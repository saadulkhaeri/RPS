/**
 * ============================================================================
 * RERE PHOTO - MEMBERSHIP & PHOTO DELIVERY MANAGEMENT SYSTEM
 * Backend Google Apps Script (Code.gs) - VERSI DIPERBAIKI (HARDENED)
 * ============================================================================
 * Perubahan utama pada versi ini dibanding versi sebelumnya:
 *  1. Setiap action sensitif kini WAJIB menyertakan token login yang valid
 *     (dicek di server, bukan cuma disembunyikan di tampilan client).
 *  2. Password tidak lagi disimpan sebagai Base64 (itu cuma encoding, bukan
 *     hash) — sekarang memakai HMAC-SHA256 dengan kunci rahasia server.
 *  3. handleUpdateProfile sekarang ikut meng-hash password baru (dulu
 *     tersimpan plaintext sehingga user terkunci setelah ganti password).
 *  4. ID Staff/Paket/Reward dibuat dari angka tertinggi yang sudah ada + 1,
 *     bukan dari jumlah baris — supaya tidak dobel setelah ada data dihapus.
 *  5. handleGetSettings tidak lagi mengirim owner_pass_hash ke client.
 *  6. Data demo di setupDatabase() memakai password ter-hash yang konsisten
 *     dengan cara login, sehingga akun demo benar-benar bisa dipakai login.
 * ============================================================================
 */

const SHEET_MEMBERS      = "Members";
const SHEET_TRANSACTIONS = "Transactions";
const SHEET_STAFF        = "Data_Staff";
const SHEET_PACKAGES     = "Packages";
const SHEET_SETTINGS     = "Settings";
const SHEET_REWARDS      = "Rewards";
const SHEET_REDEMPTIONS  = "Redemptions";
const SHEET_BOOKINGS     = "Bookings";
const SHEET_SALES        = "Sales";
const SHEET_EXPENSES     = "Expenses";

// Umur token sesi (dalam milidetik). Klien (member) dibuat lebih panjang
// karena mereka jarang buka aplikasi; staf/owner lebih pendek karena
// biasanya dipakai di perangkat bersama (komputer studio).
const TOKEN_TTL_CLIENT_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari
const TOKEN_TTL_STAFF_MS  = 15 * 60 * 60 * 1000;       // 15 jam
const TOKEN_TTL_ADMIN_MS  = 12 * 60 * 60 * 1000;       // 12 jam

// ============================================================================
// KEAMANAN: HASH PASSWORD & TOKEN SESI
// ============================================================================

/**
 * Mengambil (atau membuat sekali saja) kunci rahasia server yang dipakai
 * untuk hashing password & menandatangani token. Disimpan di Script
 * Properties (bukan di Sheet) supaya tidak pernah ikut terkirim ke client
 * lewat action apa pun.
 */
function getSecretKey() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("REREPHOTO_SECRET_KEY");
  if (!secret) {
    secret = Utilities.getUuid() + "-" + Utilities.getUuid() + "-" + new Date().getTime();
    props.setProperty("REREPHOTO_SECRET_KEY", secret);
  }
  return secret;
}

/**
 * Hash password dengan HMAC-SHA256 + kunci rahasia server (keyed hash).
 * Ini BUKAN Base64 (yang gampang dibalik) — tanpa tahu kunci rahasianya,
 * hash ini tidak bisa dibalik ke password asli.
 * Catatan: untuk keamanan maksimal idealnya tiap user punya salt sendiri,
 * tapi itu perlu ubah struktur kolom Sheet. Pendekatan keyed-hash ini sudah
 * jauh lebih aman dari Base64 tanpa perlu migrasi skema data.
 */
function hashPassword(password) {
  const secret = getSecretKey();
  const raw = Utilities.computeHmacSha256Signature(String(password), secret);
  return raw.map(function (b) { return ("0" + (b & 0xFF).toString(16)).slice(-2); }).join("");
}

/** Bikin token sesi terenkripsi-tertandatangani. */
function generateToken(user, role) {
  const ttl = role === "client" ? TOKEN_TTL_CLIENT_MS : role === "staff" ? TOKEN_TTL_STAFF_MS : TOKEN_TTL_ADMIN_MS;
  const payload = { id: String(user.id), role: role, name: user.name || "", exp: new Date().getTime() + ttl };
  const secret = getSecretKey();
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const sig  = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret));
  return body + "." + sig;
}

/** Verifikasi token: cek tanda tangan & masa berlaku. Return payload atau null. */
function verifyToken(token) {
  try {
    if (!token || typeof token !== "string" || token.indexOf(".") === -1) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const body = parts[0], sig = parts[1];
    const secret = getSecretKey();
    const expectedSig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret));
    if (expectedSig !== sig) return null;
    const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString();
    const payload = JSON.parse(json);
    if (!payload || !payload.exp || new Date().getTime() > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Cek token dari request & pastikan rolenya diizinkan untuk action ini.
 * Return { payload } jika sukses, atau { error: "pesan" } jika gagal.
 */
function requireAuth(params, allowedRoles) {
  const payload = verifyToken(params && params.token);
  if (!payload) return { error: "Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang." };
  if (allowedRoles && allowedRoles.indexOf(payload.role) === -1) {
    return { error: "Akses ditolak: fitur ini tidak tersedia untuk peran akun Anda." };
  }
  return { payload: payload };
}

// ============================================================================
// ROUTING
// ============================================================================

// Action yang boleh diakses tanpa login (data publik / halaman sebelum login).
// Referensi/dokumentasi: action GET yang tidak butuh token (ditangani
// langsung di awal doGet). Daftar ini harus selalu sinkron dengan doGet.
const PUBLIC_GET_ACTIONS  = ["test", "getStaffList", "getPackages", "getRewards", "getSettings"];
// Catatan: "setupOwnerAccount" juga tidak butuh token (dipanggil sebelum ada
// akun owner sama sekali), tapi tetap aman karena hanya berhasil SEKALI --
// begitu app_setup_done bernilai true, action ini akan selalu ditolak.
const PUBLIC_POST_ACTIONS = ["login", "register", "setupOwnerAccount", "requestPasswordReset", "confirmPasswordReset"];

function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || "test";

    // ── Action publik (tidak perlu token) ──────────────────────────────
    if (action === "test") return createJsonResponse({ status: "success", message: "Rere Photo GAS Active!", timestamp: new Date().toISOString() });
    if (action === "getStaffList") return handleGetStaffList();
    if (action === "getPackages")  return handleGetPackages();
    if (action === "getRewards")   return handleGetRewards();
    if (action === "getSettings")  return handleGetSettings();

    // ── Action lain WAJIB token login dengan role yang sesuai ──────────
    if (action === "getDashboardData") {
      const auth = requireAuth(params, ["client", "staff", "admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      return handleGetDashboardData(params, auth.payload);
    }
    if (action === "getAdminStats") {
      const auth = requireAuth(params, ["admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      return handleGetAdminStats();
    }
    if (action === "getMembers") {
      const auth = requireAuth(params, ["staff", "admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      return handleGetMembers();
    }
    if (action === "getRedemptions") {
      const auth = requireAuth(params, ["client", "staff", "admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      return handleGetRedemptions(params, auth.payload);
    }
    if (action === "lookupMember") {
      const auth = requireAuth(params, ["staff", "admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      return handleLookupMember(params);
    }

    if (action === "getBookings") {
      const auth = requireAuth(params, ["client", "staff", "admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      return handleGetBookings(params, auth.payload);
    }

    if (action === "getSales" || action === "getExpenses" || action === "getFinanceSummary") {
      const auth = requireAuth(params, ["staff", "admin"]);
      if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
      if (action === "getSales")          return handleGetSales(params);
      if (action === "getExpenses")       return handleGetExpenses(params);
      if (action === "getFinanceSummary") return handleGetFinanceSummary(params);
    }

    return createJsonResponse({ status: "error", message: "Action tidak dikenali: " + action });
  } catch (err) {
    return createJsonResponse({ status: "error", message: "Server Error doGet: " + err.toString() });
  }
}

function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) data = JSON.parse(e.postData.contents);
    else if (e && e.parameter) data = e.parameter;
    const action = data.action;

    if (action === "login")             return handleLogin(data);
    if (action === "register")          return handleRegister(data);
    if (action === "setupOwnerAccount") return handleSetupOwnerAccount(data);
    if (action === "requestPasswordReset") return handleRequestPasswordReset(data);
    if (action === "confirmPasswordReset") return handleConfirmPasswordReset(data);

    // Semua action di bawah ini WAJIB login dengan role yang sesuai.
    const ROLE_RULES = {
      updateProfile:     ["client"],
      redeemReward:      ["client"],
      addTransaction:    ["staff", "admin"],
      confirmRedemption: ["staff", "admin"],
      addMember:         ["admin"],
      addStaff:          ["admin"],
      deleteStaff:       ["admin"],
      resetStaffPassword:["admin"],
      updateMember:        ["admin"],
      resetMemberPassword: ["admin"],
      addPackage:        ["admin"],
      updatePackage:     ["admin"],
      deletePackage:     ["admin"],
      updateSetting:     ["admin"],
      addReward:         ["admin"],
      updateReward:      ["admin"],
      deleteReward:      ["admin"],
      createBooking:       ["client"],
      cancelBooking:       ["client"],
      updateBookingStatus: ["staff", "admin"],
      createSale:          ["staff", "admin"],
      addExpense:          ["admin"],
      deleteExpense:       ["admin"]
    };

    if (!ROLE_RULES.hasOwnProperty(action)) {
      return createJsonResponse({ status: "error", message: "Action tidak dikenali: " + action });
    }

    const auth = requireAuth(data, ROLE_RULES[action]);
    if (auth.error) return createJsonResponse({ status: "error", message: auth.error });
    const me = auth.payload;

    if (action === "updateProfile") {
      if (String(data.id).trim() !== me.id) return createJsonResponse({ status: "error", message: "Anda hanya bisa mengubah profil sendiri." });
      return handleUpdateProfile(data);
    }
    if (action === "redeemReward") {
      if (String(data.member_id).trim() !== me.id) return createJsonResponse({ status: "error", message: "Anda hanya bisa menukar poin milik sendiri." });
      return handleRedeemReward(data);
    }
    if (action === "addTransaction") {
      // Staf tidak boleh mengatasnamakan staf lain; admin boleh input manual.
      if (me.role === "staff") { data.staff_id = me.id; data.staff_name = data.staff_name || me.name; }
      return handleAddTransaction(data);
    }
    if (action === "confirmRedemption") {
      if (me.role === "staff" && !data.staff_name) data.staff_name = me.name;
      return handleConfirmRedemption(data);
    }

    if (action === "createBooking") return handleCreateBooking(data, me);
    if (action === "cancelBooking") {
      if (String(data.member_id).trim() !== me.id) {
        return createJsonResponse({ status: "error", message: "Anda hanya bisa membatalkan booking milik sendiri." });
      }
      return handleCancelBooking(data);
    }
    if (action === "updateBookingStatus") {
      if (me.role === "staff" && !data.staff_name) data.staff_name = me.name;
      return handleUpdateBookingStatus(data);
    }

    if (action === "createSale") {
      // Staf tidak boleh mengatasnamakan staf lain.
      if (me.role === "staff") { data.kasir_id = me.id; data.kasir_name = data.kasir_name || me.name; }
      return handleCreateSale(data);
    }
    if (action === "addExpense")    return handleAddExpense(data);
    if (action === "deleteExpense") return handleDeleteExpense(data);
    if (action === "addMember")       return handleAddMember(data);
    if (action === "addStaff")        return handleAddStaff(data);
    if (action === "deleteStaff")     return handleDeleteStaff(data);
    if (action === "resetStaffPassword") return handleResetStaffPassword(data);
    if (action === "updateMember")        return handleUpdateMember(data);
    if (action === "resetMemberPassword") return handleResetMemberPassword(data);
    if (action === "addPackage")      return handleAddPackage(data);
    if (action === "updatePackage")   return handleUpdatePackage(data);
    if (action === "deletePackage")   return handleDeletePackage(data);
    if (action === "updateSetting")   return handleUpdateSetting(data);
    if (action === "addReward")       return handleAddReward(data);
    if (action === "updateReward")    return handleUpdateReward(data);
    if (action === "deleteReward")    return handleDeleteReward(data);

    return createJsonResponse({ status: "error", message: "Action tidak dikenali: " + action });
  } catch (err) {
    return createJsonResponse({ status: "error", message: "Server Error doPost: " + err.toString() });
  }
}

// ============================================================================
// LOGIN & REGISTER
// ============================================================================

/**
 * Cek apakah storedHash adalah hash LAMA (Base64 polos dari versi sebelum
 * perbaikan ini) yang cocok dengan password yang diketik. Dipakai supaya
 * akun yang sudah lebih dulu terdaftar di Google Sheets (dengan skema lama)
 * tetap bisa login, lalu otomatis di-upgrade ke hash HMAC-SHA256 yang baru
 * pada login itu juga — tanpa perlu reset manual satu-satu oleh owner.
 */
/**
 * Menghilangkan angka 0 di depan nomor HP untuk keperluan PERBANDINGAN saja
 * (bukan untuk disimpan). Ini jaga-jaga terhadap data yang sudah kelanjur
 * kehilangan angka 0 di depan akibat Google Sheets otomatis mengubahnya jadi
 * angka — supaya member tetap bisa login baik mengetik nomornya lengkap
 * dengan awalan 0 maupun tanpa awalan 0.
 */
function normalizePhoneForCompare(str) {
  return String(str || "").trim().toLowerCase().replace(/^0+/, "");
}

function isLegacyBase64Match(password, storedHash) {
  if (!storedHash) return false;
  try {
    if (Utilities.base64Encode(String(password)) === storedHash) return true;
  } catch (err) { /* abaikan */ }
  // Jaga-jaga tambahan: versi lama sebelumnya punya bug di handleUpdateProfile
  // yang bisa menyimpan password baru sebagai TEKS POLOS (tanpa di-encode
  // sama sekali) saat member mengganti password dari dashboard. Kalau ada
  // akun lama yang kena bug itu, hash-nya persis sama dengan password itu
  // sendiri — tetap kita terima & migrasi supaya member itu tidak terkunci.
  return String(password) === String(storedHash);
}

function handleLogin(data) {
  const { email_phone, password } = data;
  if (!email_phone || !password) return createJsonResponse({ status: "error", message: "Nomor HP/Email dan kata sandi wajib diisi." });
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const ep   = String(email_phone).trim().toLowerCase();
  const pw   = String(password).trim();
  const pwHash = hashPassword(pw);

  // ── Owner login: password diambil dari Sheet Settings ──────────────────
  const settingSheet = ss.getSheetByName(SHEET_SETTINGS);
  let ownerEmail = "", ownerPassHash = "", ownerName = "Owner Rere Photo";
  if (settingSheet) {
    const sRows = settingSheet.getDataRange().getValues();
    for (let i = 1; i < sRows.length; i++) {
      if (sRows[i][0] === "owner_email")     ownerEmail    = String(sRows[i][1]).trim().toLowerCase();
      if (sRows[i][0] === "owner_pass_hash") ownerPassHash = String(sRows[i][1]).trim();
      if (sRows[i][0] === "owner_name")      ownerName     = String(sRows[i][1]).trim();
    }
  }
  if (!ownerEmail) ownerEmail = "admin@rerephoto.com";

  if (ep === ownerEmail) {
    if (!ownerPassHash || pwHash === ownerPassHash) {
      // Jika ownerPassHash kosong = belum di-set, izinkan masuk & simpan hash
      if (!ownerPassHash && settingSheet) {
        handleUpdateSetting({ key: "owner_pass_hash", value: pwHash });
      }
      const user = { id: "AD-001", name: ownerName, email_phone: ownerEmail, role: "admin" };
      user.token = generateToken(user, "admin");
      return createJsonResponse({ status: "success", message: "Login Owner berhasil!", user: user });
    }
    // Migrasi otomatis dari hash Base64 lama (versi sebelum perbaikan ini)
    if (isLegacyBase64Match(pw, ownerPassHash)) {
      handleUpdateSetting({ key: "owner_pass_hash", value: pwHash });
      const user = { id: "AD-001", name: ownerName, email_phone: ownerEmail, role: "admin" };
      user.token = generateToken(user, "admin");
      return createJsonResponse({ status: "success", message: "Login Owner berhasil!", user: user });
    }
    return createJsonResponse({ status: "error", message: "Kata sandi Owner salah!" });
  }

  // ── Staff login: password di-hash & disimpan di kolom ke-6 Sheet Staff ─
  const staffSheet = ss.getSheetByName(SHEET_STAFF);
  if (staffSheet) {
    const rows = staffSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() !== ep) continue;
      const storedHash = rows[i][5] ? String(rows[i][5]).trim() : "";
      if (!storedHash || pwHash === storedHash) {
        // Jika hash kosong = belum di-set, simpan sekarang (login pertama kali)
        if (!storedHash) staffSheet.getRange(i + 1, 6).setValue(pwHash);
        const user = { id: rows[i][0], name: rows[i][1], shift: rows[i][2], role: "staff", total_handled: rows[i][3] };
        user.token = generateToken(user, "staff");
        return createJsonResponse({ status: "success", message: "Login Staf berhasil!", user: user });
      }
      // Migrasi otomatis dari hash Base64 lama
      if (isLegacyBase64Match(pw, storedHash)) {
        staffSheet.getRange(i + 1, 6).setValue(pwHash);
        const user = { id: rows[i][0], name: rows[i][1], shift: rows[i][2], role: "staff", total_handled: rows[i][3] };
        user.token = generateToken(user, "staff");
        return createJsonResponse({ status: "success", message: "Login Staf berhasil!", user: user });
      }
      return createJsonResponse({ status: "error", message: "Kata sandi Staf salah!" });
    }
  }

  // Member login
  const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!memberSheet) return createJsonResponse({ status: "error", message: "Sheet Members belum dibuat. Jalankan setupDatabase()." });
  const rows = memberSheet.getDataRange().getValues();
  const epNormalized = normalizePhoneForCompare(ep);
  for (let i = 1; i < rows.length; i++) {
    const storedRaw = String(rows[i][0]).trim().toLowerCase();
    const isIdMatch = storedRaw === ep || normalizePhoneForCompare(storedRaw) === epNormalized;
    if (!isIdMatch) continue;
    const storedHash = String(rows[i][3]).trim();
    const isMatch = storedHash === pwHash;
    const isLegacyMatch = !isMatch && isLegacyBase64Match(pw, storedHash);
    // Hash kosong = password member baru saja di-reset owner; terima password
    // apa pun yang diketik sekarang dan jadikan itu password baru (sama
    // seperti alur "login pertama kali" untuk staf/owner).
    const isResetPending = !storedHash;
    if (isMatch || isLegacyMatch || isResetPending) {
      if (isLegacyMatch || isResetPending) memberSheet.getRange(i + 1, 4).setValue(pwHash);
      const user = { id: rows[i][0], name: rows[i][1], email: rows[i][2], phone: rows[i][0], role: rows[i][4] || "client",
        points: Number(rows[i][5]) || 0, tier: rows[i][6] || "Silver", created_at: rows[i][7], avatar_url: rows[i][8] || "" };
      user.token = generateToken(user, "client");
      return createJsonResponse({ status: "success", message: "Login Member berhasil!", user: user });
    }
    return createJsonResponse({ status: "error", message: "Nomor HP/Email atau Kata Sandi salah!" });
  }
  return createJsonResponse({ status: "error", message: "Nomor HP/Email atau Kata Sandi salah!" });
}

/**
 * Langkah 1 "Lupa Password" member: cari member berdasarkan No. HP, kalau
 * dia punya email terdaftar, kirim kode 6 digit ke email itu (berlaku 15
 * menit, disimpan sementara di CacheService — otomatis hilang sendiri
 * setelah kedaluwarsa, tidak perlu kolom tambahan di Sheet).
 */
function handleRequestPasswordReset(data) {
  const memberId = String(data.member_id || "").trim();
  if (!memberId) return createJsonResponse({ status: "error", message: "Nomor HP wajib diisi." });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members tidak ditemukan." });
  const rows = sheet.getDataRange().getValues();
  const idNormalized = normalizePhoneForCompare(memberId);
  for (let i = 1; i < rows.length; i++) {
    const storedRaw = String(rows[i][0]).trim();
    if (storedRaw !== memberId && normalizePhoneForCompare(storedRaw) !== idNormalized) continue;
    const email = String(rows[i][2] || "").trim();
    if (!email) {
      return createJsonResponse({ status: "error", message: "Nomor ini belum punya email terdaftar. Silakan hubungi admin studio untuk reset manual." });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000)); // kode 6 digit
    CacheService.getScriptCache().put("pwreset_" + storedRaw, code, 15 * 60); // berlaku 15 menit
    try {
      MailApp.sendEmail({
        to: email,
        subject: "Kode Reset Password - Rere Photo",
        body: `Halo ${rows[i][1]},\n\nKode untuk reset password akun Rere Photo kamu adalah:\n\n${code}\n\nKode ini berlaku selama 15 menit. Jika kamu tidak meminta reset password, abaikan email ini.\n\n— Rere Photo`
      });
    } catch (err) {
      return createJsonResponse({ status: "error", message: "Gagal mengirim email. Coba lagi nanti atau hubungi admin studio." });
    }
    // Sembunyikan sebagian email di pesan (mis. a****a@gmail.com) supaya tidak membocorkan email penuh ke siapa pun yang iseng coba-coba nomor.
    const maskedEmail = email.replace(/^(.)(.*)(.@.*)$/, (m, a, mid, tail) => a + mid.replace(/./g, "*") + tail);
    return createJsonResponse({ status: "success", message: `Kode reset sudah dikirim ke ${maskedEmail}. Cek juga folder Spam kalau belum masuk.` });
  }
  return createJsonResponse({ status: "error", message: "Nomor HP tidak ditemukan." });
}

/**
 * Langkah 2 "Lupa Password" member: verifikasi kode 6 digit yang dikirim
 * lewat email, lalu simpan password baru (di-hash seperti biasa).
 */
function handleConfirmPasswordReset(data) {
  const memberId = String(data.member_id || "").trim();
  const code     = String(data.code || "").trim();
  const newPassword = String(data.new_password || "").trim();
  if (!memberId || !code || !newPassword) return createJsonResponse({ status: "error", message: "Semua kolom wajib diisi." });
  if (newPassword.length < 4) return createJsonResponse({ status: "error", message: "Kata sandi baru minimal 4 karakter." });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members tidak ditemukan." });
  const rows = sheet.getDataRange().getValues();
  const idNormalized = normalizePhoneForCompare(memberId);
  for (let i = 1; i < rows.length; i++) {
    const storedRaw = String(rows[i][0]).trim();
    if (storedRaw !== memberId && normalizePhoneForCompare(storedRaw) !== idNormalized) continue;
    const cachedCode = CacheService.getScriptCache().get("pwreset_" + storedRaw);
    if (!cachedCode || cachedCode !== code) {
      return createJsonResponse({ status: "error", message: "Kode salah atau sudah kedaluwarsa. Silakan minta kode baru." });
    }
    CacheService.getScriptCache().remove("pwreset_" + storedRaw); // kode cuma bisa dipakai sekali
    const newHash = hashPassword(newPassword);
    sheet.getRange(i + 1, 4).setValue(newHash);
    const user = { id: storedRaw, name: rows[i][1], email: rows[i][2], phone: storedRaw, role: rows[i][4] || "client",
      points: Number(rows[i][5]) || 0, tier: rows[i][6] || "Silver", created_at: rows[i][7], avatar_url: rows[i][8] || "" };
    user.token = generateToken(user, "client");
    return createJsonResponse({ status: "success", message: "Password berhasil diganti! Kamu sudah login otomatis.", user: user });
  }
  return createJsonResponse({ status: "error", message: "Nomor HP tidak ditemukan." });
}

function handleRegister(data) {
  const { name, email, phone, password } = data;
  if (!name || !phone || !password) return createJsonResponse({ status: "error", message: "Nama, nomor HP, dan kata sandi wajib diisi." });
  if (String(password).trim().length < 4) return createJsonResponse({ status: "error", message: "Kata sandi minimal 4 karakter." });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members belum dibuat." });
  const memberId = String(phone).trim();
  if (!memberId) return createJsonResponse({ status: "error", message: "Nomor HP wajib diisi." });

  // PENTING: kunci proses ini supaya dua permintaan daftar yang datang nyaris
  // bersamaan (mis. tombol Daftar sempat ke-klik dua kali dengan cepat)
  // tidak sama-sama lolos cek nomor HP lalu menghasilkan 2 baris member
  // dengan nomor HP yang sama persis (kondisi race yang tanpa lock bisa lolos).
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return createJsonResponse({ status: "error", message: "Server sedang sibuk, coba lagi sebentar." });
  }
  try {
    const rows = sheet.getDataRange().getValues();
    const memberIdNormalized = normalizePhoneForCompare(memberId);
    for (let i = 1; i < rows.length; i++) {
      const storedRaw = String(rows[i][0]).trim();
      if (storedRaw === memberId || normalizePhoneForCompare(storedRaw) === memberIdNormalized) {
        return createJsonResponse({ status: "error", message: "Nomor HP sudah terdaftar!" });
      }
    }
    const createdAt = new Date().toISOString().split('T')[0];
    const passHash = hashPassword(String(password).trim());
    sheet.appendRow([memberId, name, email || "", passHash, "client", 10, "Silver", createdAt, ""]);
    const user = { id: memberId, name, email: email || "", phone: memberId, role: "client", points: 10, tier: "Silver", created_at: createdAt, avatar_url: "" };
    user.token = generateToken(user, "client");
    return createJsonResponse({ status: "success", message: "Registrasi berhasil!", user: user });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Setup awal akun Owner (dipanggil oleh Setup Wizard di akses-owner.html).
 * Tidak butuh token karena memang dijalankan SEBELUM ada akun owner sama
 * sekali — tapi aman karena hanya bisa berhasil SATU KALI: begitu
 * app_setup_done = "true" tersimpan di Settings, percobaan berikutnya
 * selalu ditolak (mencegah orang lain mengambil alih akun owner).
 */
function handleSetupOwnerAccount(data) {
  const { name, email, password } = data;
  if (!email || !password) return createJsonResponse({ status: "error", message: "Email dan kata sandi wajib diisi." });
  if (String(password).trim().length < 6) return createJsonResponse({ status: "error", message: "Kata sandi minimal 6 karakter." });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) { sheet = ss.insertSheet(SHEET_SETTINGS); sheet.appendRow(["Key", "Value"]); formatSheetHeader(sheet, "#3a5c37"); }

  const rows = sheet.getDataRange().getValues();
  let setupDone = false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === "app_setup_done" && String(rows[i][1]).trim().toLowerCase() === "true") setupDone = true;
  }
  if (setupDone) {
    return createJsonResponse({ status: "error", message: "Akun owner sudah pernah dibuat. Gunakan halaman login, atau reset lewat Google Sheets jika lupa password." });
  }

  const emailNorm = String(email).trim().toLowerCase();
  const passHash  = hashPassword(String(password).trim());
  handleUpdateSetting({ key: "owner_email", value: emailNorm });
  handleUpdateSetting({ key: "owner_pass_hash", value: passHash });
  handleUpdateSetting({ key: "owner_name", value: name || "Owner Rere Photo" });
  handleUpdateSetting({ key: "app_setup_done", value: "true" });

  const user = { id: "AD-001", name: name || "Owner Rere Photo", email_phone: emailNorm, role: "admin" };
  user.token = generateToken(user, "admin");
  return createJsonResponse({ status: "success", message: "Akun owner berhasil dibuat!", user: user });
}

/**
 * Owner mengubah data member (nama/email/poin/tier) langsung dari dashboard.
 * Password TIDAK bisa diubah lewat sini — pakai handleResetMemberPassword.
 */
function handleGetMembers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "success", members: [] });
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    list.push({
      id: rows[i][0], name: rows[i][1], email: rows[i][2], phone: rows[i][0],
      points: rows[i][5], tier: rows[i][6], created_at: rows[i][7] || "",
      gender: rows[i][9] || "", birth_date: rows[i][10] || ""
    });
  }
  return createJsonResponse({ status: "success", members: list.reverse() });
}

function handleAddMember(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members belum tersedia." });
  const phone = String(data.phone || "").trim();
  if (!phone) return createJsonResponse({ status: "error", message: "Nomor HP wajib diisi." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === phone) {
      return createJsonResponse({ status: "error", message: "Nomor HP sudah terdaftar." });
    }
  }
  const points = Number(data.points) || 0;
  let tier = "Silver";
  if (points >= 200) tier = "Diamond \u{1F48E}";
  else if (points >= 100) tier = "Platinum \u{1F451}";
  else if (points >= 50) tier = "Gold \u{1F31F}";
  sheet.appendRow([phone, data.name || "Member", data.email || "", hashPassword(data.password || "123"), "client", points, tier, new Date().toISOString().slice(0, 10), "", data.gender || "", data.birth_date || ""]);
  return createJsonResponse({ status: "success", message: "Member " + (data.name || "") + " ditambahkan.", member: { id: phone, name: data.name || "Member", email: data.email || "", phone: phone, points: points, tier: tier } });
}

function handleUpdateMember(data) {
  const { id, name, email, points, tier, new_password } = data;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members tidak ditemukan." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(id).trim()) {
      if (name !== undefined && name !== "")   sheet.getRange(i + 1, 2).setValue(name);
      if (email !== undefined)                 sheet.getRange(i + 1, 3).setValue(email);
      if (points !== undefined && points !== "") sheet.getRange(i + 1, 6).setValue(Number(points) || 0);
      if (tier !== undefined && tier !== "")   sheet.getRange(i + 1, 7).setValue(tier);
      // Owner bisa langsung mengetik password baru untuk member (opsional —
      // kalau dikosongkan, password lama tidak berubah sama sekali).
      if (new_password !== undefined && new_password !== "") {
        if (String(new_password).trim().length < 4) return createJsonResponse({ status: "error", message: "Password baru minimal 4 karakter." });
        sheet.getRange(i + 1, 4).setValue(hashPassword(String(new_password).trim()));
      }
      return createJsonResponse({ status: "success", message: `Data member ${rows[i][1]} berhasil diperbarui!` });
    }
  }
  return createJsonResponse({ status: "error", message: "Member tidak ditemukan." });
}

/**
 * Reset password member (dipakai owner saat member lupa password). Kolom
 * password dikosongkan; member bersangkutan akan diminta membuat password
 * baru secara otomatis pada percobaan login berikutnya — sama seperti alur
 * reset password staf.
 */
function handleResetMemberPassword(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members tidak ditemukan." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.id).trim()) {
      sheet.getRange(i + 1, 4).setValue("");
      return createJsonResponse({ status: "success", message: `Password member ${rows[i][1]} berhasil direset. Member bisa membuat password baru saat login berikutnya.` });
    }
  }
  return createJsonResponse({ status: "error", message: "Member tidak ditemukan." });
}

/**
 * Pencarian cepat data member berdasarkan ID (nomor HP), dipakai di Portal
 * Karyawan supaya staf bisa langsung lihat nama membernya sebelum submit
 * transaksi (memastikan nomor yang diketik benar). Hanya mengembalikan info
 * dasar yang tidak sensitif (bukan password/email).
 */
function handleLookupMember(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members tidak ditemukan." });
  const memberId = String(params.member_id || "").trim();
  if (!memberId) return createJsonResponse({ status: "error", found: false });
  const rows = sheet.getDataRange().getValues();
  const idNormalized = normalizePhoneForCompare(memberId);
  for (let i = 1; i < rows.length; i++) {
    const storedRaw = String(rows[i][0]).trim();
    if (storedRaw === memberId || normalizePhoneForCompare(storedRaw) === idNormalized) {
      return createJsonResponse({ status: "success", found: true,
        member: { id: storedRaw, name: rows[i][1], tier: rows[i][6] || "Silver", points: Number(rows[i][5]) || 0 } });
    }
  }
  return createJsonResponse({ status: "success", found: false });
}

function handleUpdateProfile(data) {
  const { id, name, email, password, avatar_url } = data;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MEMBERS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Members tidak ditemukan." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(id).trim()) {
      if (name)       sheet.getRange(i + 1, 2).setValue(name);
      if (email)      sheet.getRange(i + 1, 3).setValue(email);
      // PENTING: password baru WAJIB di-hash sebelum disimpan, sama seperti
      // saat register/login. Sebelumnya di sini disimpan plaintext sehingga
      // user tidak bisa login lagi setelah ganti password — sudah diperbaiki.
      if (password && String(password).trim() !== "") {
        if (String(password).trim().length < 4) return createJsonResponse({ status: "error", message: "Kata sandi baru minimal 4 karakter." });
        sheet.getRange(i + 1, 4).setValue(hashPassword(String(password).trim()));
      }
      if (avatar_url !== undefined) sheet.getRange(i + 1, 9).setValue(avatar_url);
      const updated = { id: rows[i][0], name: name || rows[i][1], email: email || rows[i][2], phone: rows[i][0],
        role: rows[i][4], points: Number(rows[i][5]) || 0, tier: rows[i][6], avatar_url: avatar_url !== undefined ? avatar_url : (rows[i][8] || "") };
      updated.token = generateToken(updated, "client");
      return createJsonResponse({ status: "success", message: "Profil berhasil diperbarui!", user: updated });
    }
  }
  return createJsonResponse({ status: "error", message: "Member tidak ditemukan." });
}

// ============================================================================
// TRANSAKSI (DELIVERY FOTO)
// ============================================================================

function handleAddTransaction(data) {
  const { member_id, points_to_add, package_name, gdrive_url, staff_id, staff_name } = data;
  const coverUrl = data.cover_url || "";
  const photos = Array.isArray(data.photos) ? data.photos : [];
  const pts = Number(points_to_add) || 0;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
  const trxSheet    = ss.getSheetByName(SHEET_TRANSACTIONS);
  const staffSheet  = ss.getSheetByName(SHEET_STAFF);
  if (!memberSheet || !trxSheet) return createJsonResponse({ status: "error", message: "Sheet belum siap." });

  const members = memberSheet.getDataRange().getValues();
  let updatedMember = null;
  for (let i = 1; i < members.length; i++) {
    if (String(members[i][0]).trim() === String(member_id).trim()) {
      const newPts = (Number(members[i][5]) || 0) + pts;
      let newTier = members[i][6] || "Silver";
      if (newPts >= 200) newTier = "Diamond 💎";
      else if (newPts >= 100) newTier = "Platinum 👑";
      else if (newPts >= 50)  newTier = "Gold 🌟";
      memberSheet.getRange(i + 1, 6).setValue(newPts);
      memberSheet.getRange(i + 1, 7).setValue(newTier);
      updatedMember = { id: members[i][0], name: members[i][1], email: members[i][2], phone: members[i][0],
        role: members[i][4], points: newPts, tier: newTier, avatar_url: members[i][8] || "" };
      break;
    }
  }
  if (!updatedMember) return createJsonResponse({ status: "error", message: "ID Member tidak ditemukan!" });

  const trxId  = "TRX-" + Math.floor(100000 + Math.random() * 900000);
  const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  trxSheet.appendRow([trxId, nowStr, updatedMember.id, updatedMember.name, package_name || "Sesi Foto", gdrive_url || "", pts, staff_id || "", staff_name || "", coverUrl, photos.join("\n")]);

  if (staffSheet && staff_id) {
    const sRows = staffSheet.getDataRange().getValues();
    for (let j = 1; j < sRows.length; j++) {
      if (String(sRows[j][0]).trim() === String(staff_id).trim()) {
        staffSheet.getRange(j + 1, 4).setValue((Number(sRows[j][3]) || 0) + 1);
        break;
      }
    }
  }
  return createJsonResponse({ status: "success",
    message: `Berhasil mengirim link foto dan menambah ${pts} poin untuk ${updatedMember.name}!`,
    transaction: { trx_id: trxId, timestamp: nowStr, member_id: updatedMember.id, member_name: updatedMember.name,
      package_name, gdrive_url, points_added: pts, staff_name },
    updatedUser: updatedMember });
}

// ============================================================================
// STAFF
// ============================================================================

function handleGetStaffList() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STAFF);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Data_Staff tidak ada." });
  const rows = sheet.getDataRange().getValues();
  const staffList = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) staffList.push({ staff_id: rows[i][0], name: rows[i][1], shift: rows[i][2], total_handled: Number(rows[i][3]) || 0, status: rows[i][4] || "Aktif" });
  }
  return createJsonResponse({ status: "success", staffList });
}

function handleAddStaff(data) {
  const { name, shift } = data;
  if (!name || !shift) return createJsonResponse({ status: "error", message: "Nama dan shift wajib diisi." });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_STAFF);
  if (!sheet) sheet = ss.insertSheet(SHEET_STAFF);
  const newId = getNextId(sheet, "ST");
  sheet.appendRow([newId, name, shift, 0, "Aktif"]);
  return createJsonResponse({ status: "success", message: `Staf ${name} berhasil ditambahkan!`,
    newStaff: { staff_id: newId, name, shift, total_handled: 0, status: "Aktif" } });
}

function handleDeleteStaff(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STAFF);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Data_Staff tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.staff_id).trim()) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ status: "success", message: `Staf ${rows[i][1]} berhasil dihapus.` });
    }
  }
  return createJsonResponse({ status: "error", message: "ID Staf tidak ditemukan." });
}

/**
 * Reset password staf (kolom Pass Hash dikosongkan). Setelah ini, staf yang
 * bersangkutan akan diminta membuat password baru secara otomatis pada
 * percobaan login berikutnya (sama seperti alur "login pertama kali").
 * Hanya owner (admin) yang boleh melakukan ini.
 */
function handleResetStaffPassword(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_STAFF);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Data_Staff tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.staff_id).trim()) {
      sheet.getRange(i + 1, 6).setValue("");
      return createJsonResponse({ status: "success", message: `Password staf ${rows[i][1]} berhasil direset. Staf bisa membuat password baru saat login berikutnya.` });
    }
  }
  return createJsonResponse({ status: "error", message: "ID Staf tidak ditemukan." });
}

// ============================================================================
// PACKAGES (PAKET FOTO) - FIELD LENGKAP
// ============================================================================

function handleGetPackages() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACKAGES);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Packages tidak ada." });
  const rows = sheet.getDataRange().getValues();
  const packages = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) packages.push({
      package_id:         rows[i][0],
      name:               rows[i][1],
      duration:           rows[i][2],
      price:              Number(rows[i][3]) || 0,
      points:             Number(rows[i][4]) || 0,
      status:             rows[i][5] || "Aktif",
      price_type:         rows[i][6] || "flat",
      min_person:         Number(rows[i][7]) || 1,
      max_person:         Number(rows[i][8]) || 99,
      extra_person_price: Number(rows[i][9]) || 0,
      free_print:         Number(rows[i][10]) || 1,
      extra_print_price:  Number(rows[i][11]) || 0,
      description:        rows[i][12] || "",
      photo_url:          rows[i][13] || "",
      price_variants:     parseVariants(rows[i][14])
    });
  }
  return createJsonResponse({ status: "success", packages });
}

function parseVariants(val) {
  if (!val) return [];
  try {
    const arr = JSON.parse(val);
    return Array.isArray(arr) ? arr.filter(function (v) { return v && v.label; }) : [];
  } catch (e) { return []; }
}

function handleAddPackage(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_PACKAGES);
  if (!sheet) sheet = ss.insertSheet(SHEET_PACKAGES);
  const newId = getNextId(sheet, "PKG");
  sheet.appendRow([
    newId, data.name, data.duration || "Fleksibel",
    Number(data.price), Number(data.points), "Aktif",
    data.price_type || "flat",
    Number(data.min_person) || 1,
    Number(data.max_person) || 99,
    Number(data.extra_person_price) || 0,
    Number(data.free_print) || 1,
    Number(data.extra_print_price) || 0,
    data.description || "",
    data.photo_url || "",
    JSON.stringify(Array.isArray(data.price_variants) ? data.price_variants : [])
  ]);
  return createJsonResponse({ status: "success", message: `Paket ${data.name} berhasil ditambahkan!` });
}

function handleUpdatePackage(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACKAGES);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Packages tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.package_id).trim()) {
      sheet.getRange(i + 1, 2).setValue(data.name);
      sheet.getRange(i + 1, 3).setValue(data.duration || rows[i][2]);
      sheet.getRange(i + 1, 4).setValue(Number(data.price));
      sheet.getRange(i + 1, 5).setValue(Number(data.points));
      if (data.price_type)         sheet.getRange(i + 1, 7).setValue(data.price_type);
      if (data.min_person)         sheet.getRange(i + 1, 8).setValue(Number(data.min_person));
      if (data.max_person)         sheet.getRange(i + 1, 9).setValue(Number(data.max_person));
      if (data.extra_person_price !== undefined) sheet.getRange(i + 1, 10).setValue(Number(data.extra_person_price));
      if (data.free_print)         sheet.getRange(i + 1, 11).setValue(Number(data.free_print));
      if (data.extra_print_price !== undefined)  sheet.getRange(i + 1, 12).setValue(Number(data.extra_print_price));
      if (data.description !== undefined) sheet.getRange(i + 1, 13).setValue(data.description);
      if (data.photo_url !== undefined)   sheet.getRange(i + 1, 14).setValue(data.photo_url);
      if (data.price_variants !== undefined) sheet.getRange(i + 1, 15).setValue(JSON.stringify(Array.isArray(data.price_variants) ? data.price_variants : []));
      return createJsonResponse({ status: "success", message: `Paket ${data.name} berhasil diperbarui!` });
    }
  }
  return createJsonResponse({ status: "error", message: "ID Paket tidak ditemukan." });
}

function handleDeletePackage(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PACKAGES);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Packages tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.package_id).trim()) {
      const name = rows[i][1];
      sheet.deleteRow(i + 1);
      return createJsonResponse({ status: "success", message: `Paket ${name} berhasil dihapus.` });
    }
  }
  return createJsonResponse({ status: "error", message: "ID Paket tidak ditemukan." });
}

// ============================================================================
// REWARDS (MULTI REWARD CUSTOM)
// ============================================================================

function handleGetRewards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_REWARDS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REWARDS);
    sheet.appendRow(["Reward ID", "Nama", "Deskripsi", "Poin Dibutuhkan", "Stok", "Status"]);
    formatSheetHeader(sheet, "#3a5c37");
  }
  const rows = sheet.getDataRange().getValues();
  const rewards = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) rewards.push({ reward_id: rows[i][0], name: rows[i][1], description: rows[i][2],
      points_required: Number(rows[i][3]) || 0, stock: Number(rows[i][4]) || 0, status: rows[i][5] || "Aktif" });
  }
  return createJsonResponse({ status: "success", rewards });
}

function handleAddReward(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_REWARDS);
  if (!sheet) { sheet = ss.insertSheet(SHEET_REWARDS); sheet.appendRow(["Reward ID", "Nama", "Deskripsi", "Poin Dibutuhkan", "Stok", "Status"]); formatSheetHeader(sheet, "#3a5c37"); }
  const newId = getNextId(sheet, "RWD");
  sheet.appendRow([newId, data.name, data.description || "", Number(data.points_required), Number(data.stock) || 99, "Aktif"]);
  return createJsonResponse({ status: "success", message: `Reward ${data.name} berhasil ditambahkan!` });
}

function handleUpdateReward(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REWARDS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Rewards tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.reward_id).trim()) {
      sheet.getRange(i + 1, 2).setValue(data.name);
      sheet.getRange(i + 1, 3).setValue(data.description || "");
      sheet.getRange(i + 1, 4).setValue(Number(data.points_required));
      sheet.getRange(i + 1, 5).setValue(Number(data.stock));
      if (data.status) sheet.getRange(i + 1, 6).setValue(data.status);
      return createJsonResponse({ status: "success", message: `Reward ${data.name} berhasil diperbarui!` });
    }
  }
  return createJsonResponse({ status: "error", message: "Reward tidak ditemukan." });
}

function handleDeleteReward(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REWARDS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Rewards tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.reward_id).trim()) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ status: "success", message: "Reward berhasil dihapus." });
    }
  }
  return createJsonResponse({ status: "error", message: "Reward tidak ditemukan." });
}

// ============================================================================
// REDEEM REWARD (TUKAR POIN — TIER TIDAK TURUN)
// ============================================================================

function handleRedeemReward(data) {
  const { member_id, reward_id } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet  = ss.getSheetByName(SHEET_MEMBERS);
  const rewardSheet  = ss.getSheetByName(SHEET_REWARDS);
  const rdmSheet     = ss.getSheetByName(SHEET_REDEMPTIONS) || (function () {
    const s = ss.insertSheet(SHEET_REDEMPTIONS);
    s.getRange("B:B").setNumberFormat("@"); // kolom Member ID
    s.appendRow(["ID", "Member ID", "Member Name", "Reward ID", "Reward Name", "Poin Digunakan", "Waktu", "Status", "Dikonfirmasi Oleh", "Waktu Konfirmasi"]);
    formatSheetHeader(s, "#3a5c37");
    return s;
  })();

  if (!memberSheet || !rewardSheet) return createJsonResponse({ status: "error", message: "Sheet belum siap." });

  const mRows = memberSheet.getDataRange().getValues();
  let mIdx = -1, user = null;
  for (let i = 1; i < mRows.length; i++) {
    if (String(mRows[i][0]).trim() === String(member_id).trim()) { mIdx = i; user = mRows[i]; break; }
  }
  if (!user) return createJsonResponse({ status: "error", message: "Member tidak ditemukan." });

  const rRows = rewardSheet.getDataRange().getValues();
  let rIdx = -1, reward = null;
  for (let i = 1; i < rRows.length; i++) {
    if (String(rRows[i][0]).trim() === String(reward_id).trim()) { rIdx = i; reward = rRows[i]; break; }
  }
  if (!reward) return createJsonResponse({ status: "error", message: "Reward tidak ditemukan." });
  if (reward[5] !== "Aktif") return createJsonResponse({ status: "error", message: "Reward tidak aktif." });
  if (Number(reward[4]) <= 0) return createJsonResponse({ status: "error", message: "Stok reward habis." });

  const userPoints = Number(user[5]) || 0;
  const ptsNeeded  = Number(reward[3]) || 0;
  if (userPoints < ptsNeeded) return createJsonResponse({ status: "error", message: `Poin tidak cukup. Butuh ${ptsNeeded}, kamu punya ${userPoints}.` });

  const newPoints = userPoints - ptsNeeded;
  memberSheet.getRange(mIdx + 1, 6).setValue(newPoints);
  rewardSheet.getRange(rIdx + 1, 5).setValue(Number(reward[4]) - 1);

  const rdmId  = "RDM-" + new Date().getTime();
  const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  rdmSheet.appendRow([rdmId, user[0], user[1], reward[0], reward[1], ptsNeeded, nowStr, "pending", "", ""]);

  return createJsonResponse({ status: "success",
    message: `✅ Berhasil menukar ${ptsNeeded} poin dengan "${reward[1]}"!`,
    updatedUser: { id: user[0], name: user[1], points: newPoints, tier: user[6] },
    reward: { reward_id: reward[0], name: reward[1] } });
}

function handleConfirmRedemption(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Redemptions tidak ada." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.redemption_id).trim()) {
      if (rows[i][7] === "confirmed") return createJsonResponse({ status: "error", message: "Sudah dikonfirmasi sebelumnya." });
      const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
      sheet.getRange(i + 1, 8).setValue("confirmed");
      sheet.getRange(i + 1, 9).setValue(data.staff_name || "Staf");
      sheet.getRange(i + 1, 10).setValue(nowStr);
      return createJsonResponse({ status: "success", message: `✅ Reward "${rows[i][4]}" untuk ${rows[i][2]} berhasil dikonfirmasi!` });
    }
  }
  return createJsonResponse({ status: "error", message: "Data penukaran tidak ditemukan." });
}

function handleGetRedemptions(params, me) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REDEMPTIONS);
  if (!sheet) return createJsonResponse({ status: "success", redemptions: [] });

  // Klien hanya boleh melihat riwayat penukaran miliknya sendiri.
  if (me.role === "client") {
    if (params.member_id && String(params.member_id).trim() !== me.id) {
      return createJsonResponse({ status: "error", message: "Anda hanya bisa melihat riwayat penukaran milik sendiri." });
    }
    params.member_id = me.id;
  }

  const rows = sheet.getDataRange().getValues();
  let list = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    list.push({ id: rows[i][0], member_id: rows[i][1], member_name: rows[i][2],
      reward_id: rows[i][3], reward_name: rows[i][4], points_used: rows[i][5],
      redeemed_at: rows[i][6], status: rows[i][7] || "pending",
      confirmed_by: rows[i][8] || "", confirmed_at: rows[i][9] || "" });
  }
  if (params.member_id) list = list.filter(function (r) { return r.member_id === String(params.member_id).trim(); });
  if (params.status)    list = list.filter(function (r) { return r.status === params.status; });
  return createJsonResponse({ status: "success", redemptions: list.reverse() });
}

// ============================================================================
// SETTINGS
// ============================================================================

// Kunci Settings yang RAHASIA — tidak boleh pernah dikirim ke client mana pun.
const SETTINGS_PRIVATE_KEYS = ["owner_pass_hash"];

function handleGetSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SETTINGS);
    sheet.appendRow(["Key", "Value"]);
    sheet.appendRow(["hero_banner_url", ""]);
    formatSheetHeader(sheet, "#3a5c37");
  }
  const rows = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0]);
    if (key && SETTINGS_PRIVATE_KEYS.indexOf(key) === -1) settings[key] = rows[i][1];
  }
  return createJsonResponse({ status: "success", settings });
}

function handleUpdateSetting(data) {
  const { key, value } = data;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) { sheet = ss.insertSheet(SHEET_SETTINGS); sheet.appendRow(["Key", "Value"]); }
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(key).trim()) {
      sheet.getRange(i + 1, 2).setValue(value);
      return createJsonResponse({ status: "success", message: `Pengaturan ${key} diperbarui!` });
    }
  }
  sheet.appendRow([key, value]);
  return createJsonResponse({ status: "success", message: `Pengaturan ${key} ditambahkan!` });
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

function handleGetDashboardData(params, me) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const trxSheet    = ss.getSheetByName(SHEET_TRANSACTIONS);
  const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (!trxSheet || !memberSheet) return createJsonResponse({ status: "error", message: "Sheet tidak ditemukan." });

  let role = params.role, id = params.id;

  // Klien hanya boleh melihat dashboard miliknya sendiri, apa pun parameter
  // yang dikirim dari sisi client (mencegah orang lain menebak member_id).
  if (me.role === "client") { role = "client"; id = me.id; }
  // Staf (bukan admin) hanya boleh melihat data transaksi miliknya sendiri.
  if (me.role === "staff")  { role = "staff"; id = me.id; }

  const trxRows = trxSheet.getDataRange().getValues();
  const transactions = [];
  for (let i = trxRows.length - 1; i >= 1; i--) {
    const row = trxRows[i];
    const trxObj = { trx_id: row[0], timestamp: row[1], member_id: row[2], member_name: row[3],
      package_name: row[4], gdrive_url: row[5] || "", points_added: Number(row[6]) || 0, staff_id: row[7], staff_name: row[8],
      cover_url: row[9] || "", photos: row[10] ? String(row[10]).split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : [] };
    if (role === "client") { if (String(row[2]).trim() === String(id).trim()) transactions.push(trxObj); }
    else if (role === "staff") { if (!id || String(row[7]).trim() === String(id).trim() || id === "ALL") transactions.push(trxObj); }
    else transactions.push(trxObj);
  }

  let userInfo = null;
  if (role === "client" && id) {
    const mRows = memberSheet.getDataRange().getValues();
    for (let u = 1; u < mRows.length; u++) {
      if (String(mRows[u][0]).trim() === String(id).trim()) {
        userInfo = { id: mRows[u][0], name: mRows[u][1], email: mRows[u][2], phone: mRows[u][0],
          points: Number(mRows[u][5]) || 0, tier: mRows[u][6], avatar_url: mRows[u][8] || "" };
        break;
      }
    }
  }
  return createJsonResponse({ status: "success", transactions: transactions.slice(0, 50), userInfo });
}

function handleGetAdminStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
  const trxSheet    = ss.getSheetByName(SHEET_TRANSACTIONS);
  const staffSheet  = ss.getSheetByName(SHEET_STAFF);
  const pkgSheet    = ss.getSheetByName(SHEET_PACKAGES);

  let totalMembers = 0, totalPointsIssued = 0, totalTransactions = 0;
  const recentTransactions = [], membersList = [];

  if (memberSheet) {
    const mRows = memberSheet.getDataRange().getValues();
    for (let i = 1; i < mRows.length; i++) {
      if (String(mRows[i][4]) === "client") {
        totalMembers++;
        totalPointsIssued += (Number(mRows[i][5]) || 0);
        membersList.push({ id: mRows[i][0], name: mRows[i][1], email: mRows[i][2], phone: mRows[i][0],
          points: Number(mRows[i][5]) || 0, tier: mRows[i][6], avatar_url: mRows[i][8] || "" });
      }
    }
  }
  if (trxSheet) {
    const tRows = trxSheet.getDataRange().getValues();
    totalTransactions = Math.max(0, tRows.length - 1);
    for (let j = tRows.length - 1; j >= Math.max(1, tRows.length - 15); j--) {
      recentTransactions.push({ trx_id: tRows[j][0], timestamp: tRows[j][1], member_id: tRows[j][2],
        member_name: tRows[j][3], package_name: tRows[j][4], gdrive_url: tRows[j][5],
        points_added: Number(tRows[j][6]) || 0, staff_name: tRows[j][8] });
    }
  }

  let staffList = [], packagesList = [];
  if (staffSheet) {
    const sRows = staffSheet.getDataRange().getValues();
    for (let k = 1; k < sRows.length; k++) if (sRows[k][0]) staffList.push({ staff_id: sRows[k][0], name: sRows[k][1], shift: sRows[k][2], total_handled: Number(sRows[k][3]) || 0, status: sRows[k][4] });
  }
  if (pkgSheet) {
    const pRows = pkgSheet.getDataRange().getValues();
    for (let p = 1; p < pRows.length; p++) if (pRows[p][0]) packagesList.push({
      package_id: pRows[p][0], name: pRows[p][1], duration: pRows[p][2],
      price: Number(pRows[p][3]) || 0, points: Number(pRows[p][4]) || 0, status: pRows[p][5],
      price_type: pRows[p][6] || "flat", min_person: Number(pRows[p][7]) || 1,
      max_person: Number(pRows[p][8]) || 99, extra_person_price: Number(pRows[p][9]) || 0,
      free_print: Number(pRows[p][10]) || 1, extra_print_price: Number(pRows[p][11]) || 0,
      description: pRows[p][12] || "", photo_url: pRows[p][13] || ""
    });
  }

  return createJsonResponse({ status: "success",
    stats: { totalMembers, totalTransactions, totalPointsIssued, estRevenue: totalTransactions * 25000 },
    recentTransactions, staffList, packagesList, membersList: membersList.slice(0, 50),
    sheetUrl: ss.getUrl() });
}

// ============================================================================
// HELPER
// ============================================================================

function createJsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function formatSheetHeader(sheet, bgColor) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  h.setBackground(bgColor); h.setFontColor("#FFFFFF"); h.setFontWeight("bold");
  h.setHorizontalAlignment("center"); sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

/**
 * Generate ID baru yang aman dari tabrakan: cari angka terbesar yang sudah
 * dipakai pada pola "PREFIX-NNN" di kolom A, lalu tambahkan 1. Ini
 * menggantikan cara lama yang memakai jumlah baris (rows.length), yang bisa
 * menghasilkan ID yang sudah dipakai lagi setelah ada data yang dihapus.
 */
function getNextId(sheet, prefix) {
  const rows = sheet.getDataRange().getValues();
  let maxNum = 0;
  const pattern = new RegExp("^" + prefix + "-(\\d+)$");
  for (let i = 1; i < rows.length; i++) {
    const idVal = String(rows[i][0] || "");
    const m = idVal.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return prefix + "-" + String(maxNum + 1).padStart(3, "0");
}

// ============================================================================
// SETUP DATABASE (jalankan sekali saat pertama kali)
// ============================================================================

/**
 * ⚠️ PERINGATAN: fungsi ini MENGHAPUS SEMUA ISI setiap Sheet (Members,
 * Transactions, Data_Staff, Packages, Rewards, Redemptions, Settings) lalu
 * mengisinya ulang dengan data demo dari awal. HANYA jalankan ini SEKALI,
 * saat pertama kali membuat database.
 *
 * Supaya tidak kejadian lagi tidak sengaja menghapus data member/staf/
 * transaksi asli, fungsi ini akan MENOLAK berjalan jika sistem sudah pernah
 * di-setup sebelumnya (app_setup_done = true di Settings). Kalau kamu
 * benar-benar yakin ingin mengulang dari nol dan menghapus SEMUA data yang
 * sudah ada, jalankan setupDatabase(true) — bukan setupDatabase() biasa.
 */
/**
 * Deteksi apakah spreadsheet ini kemungkinan sudah berisi data ASLI (bukan
 * cuma data demo bawaan), supaya setupDatabase() tahu kapan harus menolak
 * jalan tanpa diminta paksa (force).
 */
function hasExistingRealData(ss) {
  const settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (settingsSheet) {
    const rows = settingsSheet.getDataRange().getValues();
    // Setup Wizard owner sudah pernah selesai = sudah pasti dipakai sungguhan.
    if (rows.some(r => r[0] === "app_setup_done" && String(r[1]).trim().toLowerCase() === "true")) return true;
  }
  const trxSheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (trxSheet && trxSheet.getLastRow() > 1) return true; // ada transaksi tercatat
  const rdmSheet = ss.getSheetByName(SHEET_REDEMPTIONS);
  if (rdmSheet && rdmSheet.getLastRow() > 1) return true; // ada penukaran reward
  const membersSheet = ss.getSheetByName(SHEET_MEMBERS);
  if (membersSheet && membersSheet.getLastRow() > 4) return true; // header + 3 demo = 4 baris; lebih dari itu berarti ada member asli yang mendaftar
  const staffSheet = ss.getSheetByName(SHEET_STAFF);
  if (staffSheet && staffSheet.getLastRow() > 4) return true; // header + 3 demo staf; lebih dari itu berarti ada staf asli ditambahkan
  return false;
}

function setupDatabase(force) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!force && hasExistingRealData(ss)) {
    Logger.log("⛔ DIBATALKAN: database ini sudah berisi data ASLI (member/staf/transaksi yang bukan sekadar data demo).");
    Logger.log("Menjalankan setupDatabase() lagi akan MENGHAPUS SEMUA data itu dan menggantinya dengan data demo dari awal.");
    Logger.log("Kalau kamu YAKIN ingin mengulang dari nol dan menghapus semua data yang ada, jalankan: setupDatabase(true)");
    return;
  }

  // Members — password demo di-hash dengan cara yang SAMA seperti login,
  // supaya akun demo (081234567891 / dst, password "123") benar-benar bisa
  // dipakai untuk login setelah database ini dibuat.
  let s = ss.getSheetByName(SHEET_MEMBERS) || ss.insertSheet(SHEET_MEMBERS);
  s.clear();
  // PENTING: paksa kolom ID (nomor HP) selalu berformat Teks. Tanpa ini,
  // Google Sheets otomatis mengubah nilai seperti "081234567891" menjadi
  // angka 81234567891 (menghilangkan angka 0 di depan), yang bikin login
  // gagal kalau member mengetik nomornya lengkap dengan awalan 0.
  s.getRange("A:A").setNumberFormat("@");
  s.appendRow(["ID (Phone)", "Name", "Email", "Password", "Role", "Points", "Tier", "Created At", "Avatar URL", "Gender", "Birth Date"]);
  [["081234567891", "Aurelia Amara", "aurelia@gmail.com", hashPassword("123"), "client", 45, "Gold 🌟", "2026-01-15", "", "P", "1998-04-12"],
   ["081234567892", "Kevin Sanjaya", "kevin@gmail.com", hashPassword("123"), "client", 120, "Platinum 👑", "2026-02-01", "", "L", "1995-08-23"],
   ["081234567893", "Siti Nurhaliza", "siti@gmail.com", hashPassword("123"), "client", 15, "Silver", "2026-03-10", "", "P", "2001-11-30"]
  ].forEach(r => s.appendRow(r));
  formatSheetHeader(s, "#3a5c37");

  // Transactions
  s = ss.getSheetByName(SHEET_TRANSACTIONS) || ss.insertSheet(SHEET_TRANSACTIONS);
  s.clear();
  s.getRange("C:C").setNumberFormat("@"); // kolom Member ID — sama alasannya, cegah nomor HP kehilangan angka 0 di depan
  s.appendRow(["Transaction ID", "Timestamp", "Member ID", "Member Name", "Package Name", "GDrive URL", "Points Added", "Staff ID", "Staff Name", "Cover URL", "Photos"]);
  formatSheetHeader(s, "#3a5c37");

  // Staff — kolom "Pass Hash" sengaja dikosongkan: password staf akan
  // otomatis diset saat mereka login PERTAMA KALI (lihat handleLogin).
  s = ss.getSheetByName(SHEET_STAFF) || ss.insertSheet(SHEET_STAFF);
  s.clear();
  s.appendRow(["Staff ID", "Name", "Shift", "Total Handled", "Status", "Pass Hash (auto)"]);
  [["ST-001", "Rizky Pratama", "Shift Pagi (08:00-14:00)", 42, "Aktif"],
   ["ST-002", "Dinda Kirana", "Shift Siang (14:00-20:00)", 38, "Aktif"],
   ["ST-003", "Budi Santoso", "Shift Malam (20:00-02:00)", 29, "Aktif"]
  ].forEach(r => s.appendRow(r));
  formatSheetHeader(s, "#3a5c37");

  // Packages (kolom lengkap)
  s = ss.getSheetByName(SHEET_PACKAGES) || ss.insertSheet(SHEET_PACKAGES);
  s.clear();
  s.appendRow(["Package ID", "Name", "Duration", "Price", "Points", "Status", "Price Type", "Min Person", "Max Person", "Extra Person Price", "Free Print", "Extra Print Price", "Description", "Photo URL", "Price Variants"]);
  [["PKG-001", "Self Photo", "Fleksibel", 60000, 15, "Aktif", "flat", 1, 5, 0, 1, 5000, "Studio self-photo eksklusif 1-5 orang.", ""],
   ["PKG-002", "Vintage Box", "Fleksibel", 25000, 10, "Aktif", "per_orang", 2, 99, 25000, 1, 5000, "Nuansa vintage estetik, min. 2 orang.", ""],
   ["PKG-003", "Photobox Cembung", "Fleksibel", 20000, 8, "Aktif", "per_orang", 2, 99, 20000, 1, 5000, "Efek cembung unik, min. 2 orang.", ""],
   ["PKG-004", "Red Room High Angle", "Fleksibel", 25000, 10, "Aktif", "per_orang", 2, 99, 25000, 1, 5000, "High angle dramatis di red room.", ""],
   ["PKG-005", "Elevator Box", "Fleksibel", 20000, 8, "Aktif", "per_orang", 2, 99, 20000, 1, 5000, "Konsep elevator unik.", ""],
   ["PKG-006", "Sudut Merah", "Fleksibel", 30000, 12, "Aktif", "per_orang", 2, 99, 30000, 1, 5000, "Background merah elegan.", ""]
  ].forEach(r => s.appendRow(r));
  formatSheetHeader(s, "#3a5c37");

  // Rewards
  s = ss.getSheetByName(SHEET_REWARDS) || ss.insertSheet(SHEET_REWARDS);
  s.clear();
  s.appendRow(["Reward ID", "Nama", "Deskripsi", "Poin Dibutuhkan", "Stok", "Status"]);
  [["RWD-001", "Free Cetak 1 Lembar", "Tukar poin untuk 1 lembar cetak gratis", 30, 99, "Aktif"],
   ["RWD-002", "Diskon Rp10.000", "Potongan harga untuk sesi berikutnya", 50, 99, "Aktif"],
   ["RWD-003", "Free Sesi Self Photo", "Sesi Self Photo gratis 1 orang", 100, 10, "Aktif"]
  ].forEach(r => s.appendRow(r));
  formatSheetHeader(s, "#3a5c37");

  // Redemptions
  s = ss.getSheetByName(SHEET_REDEMPTIONS) || ss.insertSheet(SHEET_REDEMPTIONS);
  s.clear();
  s.getRange("B:B").setNumberFormat("@"); // kolom Member ID
  s.appendRow(["ID", "Member ID", "Member Name", "Reward ID", "Reward Name", "Poin Digunakan", "Waktu", "Status", "Dikonfirmasi Oleh", "Waktu Konfirmasi"]);
  formatSheetHeader(s, "#3a5c37");

  // Sales — penjualan kasir (bisa tanpa member)
  s = ss.getSheetByName(SHEET_SALES) || ss.insertSheet(SHEET_SALES);
  s.clear();
  s.getRange("F:F").setNumberFormat("@"); // kolom Member ID
  s.appendRow(["Sale ID", "Timestamp", "Date", "Customer Name", "Phone", "Member ID", "Package ID", "Package Name", "Persons", "Extra Print", "Total", "Payment Method", "Cash Received", "Change", "Notes", "Kasir ID", "Kasir Name", "Source"]);
  formatSheetHeader(s, "#3a5c37");

  // Expenses — pengeluaran operasional
  s = ss.getSheetByName(SHEET_EXPENSES) || ss.insertSheet(SHEET_EXPENSES);
  s.clear();
  s.appendRow(["Expense ID", "Timestamp", "Date", "Category", "Description", "Amount"]);
  formatSheetHeader(s, "#3a5c37");

  // Bookings — data booking sesi foto member
  s = ss.getSheetByName(SHEET_BOOKINGS) || ss.insertSheet(SHEET_BOOKINGS);
  s.clear();
  s.getRange("C:C").setNumberFormat("@"); // kolom Member ID
  s.appendRow(["Booking ID", "Tanggal Dibuat", "Member ID", "Member Name", "Package ID", "Package Name", "Tanggal Sesi", "Jam", "Lokasi", "Jumlah Orang", "Catatan", "Total Harga", "Status", "Dikonfirmasi Oleh", "Waktu Update"]);
  const d = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 10);
  [["BK-100001", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), "081234567891", "Aurelia Amara", "PKG-002", "Vintage Box", d(3 * 864e5), "13:00", "Studio Rere Photo", 2, "", 50000, "Menunggu Konfirmasi", "", ""],
   ["BK-100002", new Date(Date.now() - 7 * 864e5).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), "081234567891", "Aurelia Amara", "PKG-001", "Self Photo", d(-7 * 864e5), "10:00", "Studio Rere Photo", 1, "", 60000, "Selesai", "Rizky Pratama", ""]
  ].forEach(r => s.appendRow(r));
  formatSheetHeader(s, "#3a5c37");

  // Settings — owner_pass_hash sengaja dikosongkan: akan diisi otomatis saat
  // owner login/setup pertama kali (lihat handleLogin & Setup Wizard).
  s = ss.getSheetByName(SHEET_SETTINGS) || ss.insertSheet(SHEET_SETTINGS);
  s.clear();
  s.appendRow(["Key", "Value"]);
  s.appendRow(["hero_banner_url", ""]);
  s.appendRow(["owner_email", ""]);
  s.appendRow(["owner_pass_hash", ""]);
  s.appendRow(["owner_name", "Owner Rere Photo"]);
  s.appendRow(["app_setup_done", "false"]);
  s.appendRow(["tier_gold", "50"]);
  s.appendRow(["tier_platinum", "100"]);
  s.appendRow(["tier_diamond", "200"]);
  s.appendRow(["studio_wa", "6281234567890"]);
  s.appendRow(["studio_ig", "rerephotoid"]);
  s.appendRow(["studio_tiktok", "rerephotoid"]);
  s.appendRow(["studio_fb", "rerephotoid"]);
  s.appendRow(["studio_alamat", "Jl. Raya, Tanjungpura, Kec. Karangampel, Kabupaten Indramayu"]);
  s.appendRow(["studio_jam", "08:00 - 20:00"]);
  s.appendRow(["studio_maps", "https://maps.app.goo.gl/f82fhTxtpZqSLwr77"]);
  formatSheetHeader(s, "#3a5c37");

  // Pastikan kunci rahasia server sudah dibuat sejak awal.
  getSecretKey();

  Logger.log("✅ Database Rere Photo berhasil dibuat & aman (password ter-hash, ID anti-tabrakan, token sesi aktif)!");
}

// ============================================================================
// BOOKING SESI FOTO
// ============================================================================

/**
 * Member membuat booking sesi foto baru (status awal: Menunggu Konfirmasi).
 */
function handleCreateBooking(data, me) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Bookings belum tersedia. Jalankan setupDatabase() terlebih dahulu." });

  const { package_id, package_name, date, time, location, guests, notes, total } = data;
  if (!package_id || !date || !time || !location) {
    return createJsonResponse({ status: "error", message: "Lengkapi paket, tanggal, jam, dan lokasi sesi foto." });
  }

  const bookingId = "BK-" + Math.floor(100000 + Math.random() * 900000);
  const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  sheet.appendRow([bookingId, nowStr, me.id, me.name, package_id, package_name || "", date, time, location, Number(guests) || 1, notes || "", Number(total) || 0, "Menunggu Konfirmasi", "", ""]);

  const booking = {
    booking_id: bookingId, created_at: nowStr, member_id: me.id, member_name: me.name,
    package_id, package_name: package_name || "", date, time, location,
    guests: Number(guests) || 1, notes: notes || "", total: Number(total) || 0,
    status: "Menunggu Konfirmasi", confirmed_by: "", updated_at: ""
  };
  return createJsonResponse({ status: "success", message: "Booking sesi foto berhasil dibuat! Kode booking: " + bookingId, booking });
}

/**
 * Lihat daftar booking. Member hanya melihat miliknya sendiri; staf/admin
 * melihat semua (bisa difilter status).
 */
function handleGetBookings(params, me) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return createJsonResponse({ status: "success", bookings: [] });

  // Member hanya boleh melihat booking miliknya sendiri.
  if (me.role === "client") {
    if (params.member_id && String(params.member_id).trim() !== me.id) {
      return createJsonResponse({ status: "error", message: "Anda hanya bisa melihat booking milik sendiri." });
    }
    params.member_id = me.id;
  }

  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    list.push({
      booking_id: rows[i][0], created_at: rows[i][1], member_id: rows[i][2],
      member_name: rows[i][3], package_id: rows[i][4], package_name: rows[i][5],
      date: rows[i][6], time: rows[i][7], location: rows[i][8],
      guests: rows[i][9], notes: rows[i][10], total: rows[i][11],
      status: rows[i][12] || "Menunggu Konfirmasi",
      confirmed_by: rows[i][13] || "", updated_at: rows[i][14] || ""
    });
  }
  if (params.member_id) list = list.filter(function (r) { return r.member_id === String(params.member_id).trim(); });
  if (params.status)    list = list.filter(function (r) { return r.status === params.status; });
  return createJsonResponse({ status: "success", bookings: list.reverse() });
}

/**
 * Staf/admin mengubah status booking: Terkonfirmasi / Selesai / Dibatalkan.
 */
function handleUpdateBookingStatus(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Bookings belum tersedia." });

  const { booking_id, status } = data;
  const ALLOWED = ["Terkonfirmasi", "Selesai", "Dibatalkan"];
  if (ALLOWED.indexOf(status) === -1) {
    return createJsonResponse({ status: "error", message: "Status tidak valid." });
  }

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(booking_id).trim()) {
      const cur = rows[i][12] || "Menunggu Konfirmasi";
      if (cur === "Dibatalkan" || cur === "Selesai") {
        return createJsonResponse({ status: "error", message: "Booking sudah berstatus " + cur + " dan tidak bisa diubah lagi." });
      }
      sheet.getRange(i + 1, 13).setValue(status);
      sheet.getRange(i + 1, 14).setValue(data.staff_name || data.staff_id || "Staf");
      sheet.getRange(i + 1, 15).setValue(new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
      return createJsonResponse({ status: "success", message: "Booking " + rows[i][5] + " berstatus " + status + "." });
    }
  }
  return createJsonResponse({ status: "error", message: "Booking tidak ditemukan." });
}

/**
 * Member membatalkan booking sendiri — hanya yang masih Menunggu Konfirmasi.
 */
function handleCancelBooking(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_BOOKINGS);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Bookings belum tersedia." });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.booking_id).trim()) {
      if (String(rows[i][2]).trim() !== String(data.member_id).trim()) {
        return createJsonResponse({ status: "error", message: "Anda hanya bisa membatalkan booking milik sendiri." });
      }
      const cur = rows[i][12] || "Menunggu Konfirmasi";
      if (cur !== "Menunggu Konfirmasi") {
        return createJsonResponse({ status: "error", message: "Hanya booking yang masih Menunggu Konfirmasi yang bisa dibatalkan." });
      }
      sheet.getRange(i + 1, 13).setValue("Dibatalkan");
      sheet.getRange(i + 1, 14).setValue(rows[i][3] + " (member)");
      sheet.getRange(i + 1, 15).setValue(new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
      return createJsonResponse({ status: "success", message: "Booking " + rows[i][5] + " berhasil dibatalkan." });
    }
  }
  return createJsonResponse({ status: "error", message: "Booking tidak ditemukan." });
}

// ============================================================================
// KASIR & KEUANGAN
// ============================================================================

/**
 * Kasir mencatat penjualan sesi foto — member ATAU walk-in (tanpa member).
 * Kalau member_id terisi dan member ditemukan, poin paket otomatis ditambahkan.
 */
function handleCreateSale(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName(SHEET_SALES);
  if (!salesSheet) return createJsonResponse({ status: "error", message: "Sheet Sales belum tersedia." });

  const { customer_name, phone, member_id, package_id, package_name, persons, extra_print, total, payment_method, cash_received, notes, give_points, split } = data;
  if (!package_id || !customer_name || !total) {
    return createJsonResponse({ status: "error", message: "Nama pelanggan, paket, dan total wajib diisi." });
  }
  const tot = Number(total) || 0;

  // ── SPLIT BILL: pembayaran terbagi beberapa metode ──
  let method = payment_method;
  let finalNotes = notes || "";
  let splitArr = null;
  let cash = Number(cash_received) || tot;
  let change = Math.max(0, cash - tot);

  if (split && Array.isArray(split) && split.length >= 2) {
    const valid = split.every(function (s) { return s && s.method && Number(s.amount) > 0; });
    const sumParts = split.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    const uniqueMethods = split.map(function (s) { return s.method; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
    if (uniqueMethods < split.length) {
      return createJsonResponse({ status: "error", message: "Pilih metode pembayaran yang berbeda untuk tiap bagian split." });
    }
    if (!valid || Math.abs(sumParts - tot) > 1) {
      return createJsonResponse({ status: "error", message: "Jumlah split pembayaran harus sama dengan total (" + tot.toLocaleString("id-ID") + ")." });
    }
    method = split.map(function (s) { return s.method; }).join(" + ");
    splitArr = split.map(function (s) { return { method: s.method, amount: Number(s.amount) }; });
    const detail = split.map(function (s) { return s.method + " " + (Number(s.amount) || 0).toLocaleString("id-ID"); }).join(", ");
    finalNotes = (notes ? notes + " · " : "") + "Split: " + detail;
    const tunaiPart = split.find(function (s) { return s.method === "Tunai"; });
    if (tunaiPart) {
      cash = Number(cash_received) || Number(tunaiPart.amount) || 0;
      change = Math.max(0, cash - Number(tunaiPart.amount));
    } else {
      change = 0;
    }
  } else if (!method) {
    return createJsonResponse({ status: "error", message: "Pilih metode pembayaran." });
  }

  const saleId = "SL-" + Math.floor(100000 + Math.random() * 900000);
  const now = new Date();
  const nowStr = now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const dateStr = now.toISOString().slice(0, 10);

  // Kalau member ditemukan & diminta beri poin → tambah poin + tier.
  let memberOut = null;
  if (member_id) {
    const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
    if (memberSheet) {
      const members = memberSheet.getDataRange().getValues();
      for (let i = 1; i < members.length; i++) {
        if (String(members[i][0]).trim() === String(member_id).trim()) {
          if (give_points === true || give_points === "true") {
            const pkgPoints = Number(data.points_to_add) || 0;
            const newPts = (Number(members[i][5]) || 0) + pkgPoints;
            let newTier = members[i][6] || "Silver";
            if (newPts >= 200) newTier = "Diamond \u{1F48E}";
            else if (newPts >= 100) newTier = "Platinum \u{1F451}";
            else if (newPts >= 50) newTier = "Gold \u{1F31F}";
            memberSheet.getRange(i + 1, 6).setValue(newPts);
            memberSheet.getRange(i + 1, 7).setValue(newTier);
            memberOut = { id: members[i][0], name: members[i][1], points: newPts, tier: newTier };
          }
          break;
        }
      }
    }
  }

  salesSheet.appendRow([saleId, nowStr, dateStr, customer_name || "", phone || "", member_id || "", package_id, package_name || "", Number(persons) || 1, Number(extra_print) || 0, tot, method, cash, change, finalNotes, data.kasir_id || "", data.kasir_name || "Kasir", member_id ? "member" : "walkin"]);

  return createJsonResponse({
    status: "success",
    message: "Penjualan tercatat! Total " + (tot).toLocaleString("id-ID") + " (" + payment_method + ").",
    sale: {
      sale_id: saleId, timestamp: nowStr, date: dateStr, customer_name: customer_name || "",
      phone: phone || "", member_id: member_id || "", package_id, package_name: package_name || "",
      persons: Number(persons) || 1, extra_print: Number(extra_print) || 0, total: tot,
      payment_method: method, cash_received: cash, change, notes: finalNotes,
      kasir_id: data.kasir_id || "", kasir_name: data.kasir_name || "Kasir",
      source: member_id ? "member" : "walkin"
    },
    member: memberOut
  });
}

/** Daftar penjualan — filter opsional: kasir_id, member_id, from/to (YYYY-MM-DD). */
function handleGetSales(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SALES);
  if (!sheet) return createJsonResponse({ status: "success", sales: [] });
  const rows = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    list.push({
      sale_id: rows[i][0], timestamp: rows[i][1], date: rows[i][2],
      customer_name: rows[i][3], phone: rows[i][4], member_id: rows[i][5],
      package_id: rows[i][6], package_name: rows[i][7],
      persons: rows[i][8], extra_print: rows[i][9], total: rows[i][10],
      payment_method: rows[i][11], cash_received: rows[i][12], change: rows[i][13],
      notes: rows[i][14], kasir_id: rows[i][15], kasir_name: rows[i][16], source: rows[i][17] || "walkin"
    });
  }
  if (params.kasir_id)  list = list.filter(function (r) { return r.kasir_id === String(params.kasir_id); });
  if (params.member_id) list = list.filter(function (r) { return r.member_id === String(params.member_id).trim(); });
  if (params.from) list = list.filter(function (r) { return String(r.date) >= String(params.from); });
  if (params.to)   list = list.filter(function (r) { return String(r.date) <= String(params.to); });
  return createJsonResponse({ status: "success", sales: list.reverse() });
}

/** Ringkasan keuangan: pendapatan (per metode & per paket), beban, laba bersih. */
function handleGetFinanceSummary(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSheet = ss.getSheetByName(SHEET_SALES);
  const expSheet   = ss.getSheetByName(SHEET_EXPENSES);
  const from = params.from || "";
  const to   = params.to   || "";

  let sales = [];
  if (salesSheet) {
    const rows = salesSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const date = String(rows[i][2]);
      if (from && date < from) continue;
      if (to && date > to) continue;
      sales.push({
        sale_id: rows[i][0], timestamp: rows[i][1], date: date,
        customer_name: rows[i][3], phone: rows[i][4], member_id: rows[i][5],
        package_id: rows[i][6], package_name: rows[i][7],
        persons: rows[i][8], extra_print: rows[i][9], total: Number(rows[i][10]) || 0,
        payment_method: rows[i][11], cash_received: rows[i][12], change: rows[i][13],
        notes: rows[i][14], kasir_id: rows[i][15], kasir_name: rows[i][16], source: rows[i][17] || "walkin"
      });
    }
  }

  let expenses = [];
  if (expSheet) {
    const rows = expSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      const date = String(rows[i][2]);
      if (from && date < from) continue;
      if (to && date > to) continue;
      expenses.push({ expense_id: rows[i][0], timestamp: rows[i][1], date: date, category: rows[i][3], description: rows[i][4], amount: Number(rows[i][5]) || 0 });
    }
  }

  const totalIncome = sales.reduce(function (s, x) { return s + x.total; }, 0);
  const totalExpense = expenses.reduce(function (s, x) { return s + x.amount; }, 0);

  const byPayment = {};
  sales.forEach(function (x) {
    const k = x.payment_method || "Lainnya";
    byPayment[k] = (byPayment[k] || 0) + x.total;
  });

  const byPackage = {};
  sales.forEach(function (x) {
    const k = x.package_name || "Paket";
    if (!byPackage[k]) byPackage[k] = { count: 0, total: 0 };
    byPackage[k].count += 1;
    byPackage[k].total += x.total;
  });

  const byExpenseCategory = {};
  expenses.forEach(function (x) {
    const k = x.category || "Lainnya";
    byExpenseCategory[k] = (byExpenseCategory[k] || 0) + x.amount;
  });

  return createJsonResponse({
    status: "success",
    summary: {
      totalSales: sales.length,
      totalIncome: totalIncome,
      totalExpenses: totalExpense,
      netProfit: totalIncome - totalExpense,
      byPayment: byPayment,
      byPackage: byPackage,
      byExpenseCategory: byExpenseCategory,
      memberCount: sales.filter(function (x) { return x.source === "member"; }).length,
      walkinCount: sales.filter(function (x) { return x.source !== "member"; }).length
    },
    sales: sales.slice().reverse().slice(0, 25),
    expenses: expenses.slice().reverse().slice(0, 25)
  });
}

/** Pengeluaran (admin). */
function handleAddExpense(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Expenses belum tersedia." });
  const { category, description, amount } = data;
  if (!category || !amount) return createJsonResponse({ status: "error", message: "Kategori dan jumlah wajib diisi." });
  const id = "EXP-" + Math.floor(100000 + Math.random() * 900000);
  const now = new Date();
  sheet.appendRow([id, now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), now.toISOString().slice(0, 10), category, description || "", Number(amount) || 0]);
  return createJsonResponse({ status: "success", message: "Pengeluaran " + category + " sebesar " + (Number(amount) || 0).toLocaleString("id-ID") + " tercatat." });
}

/** Hapus pengeluaran (admin). */
function handleDeleteExpense(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXPENSES);
  if (!sheet) return createJsonResponse({ status: "error", message: "Sheet Expenses belum tersedia." });
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.expense_id).trim()) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ status: "success", message: "Pengeluaran dihapus." });
    }
  }
  return createJsonResponse({ status: "error", message: "Pengeluaran tidak ditemukan." });
}
