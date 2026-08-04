/**
 * ============================================================================
 * RERE PHOTO - MEMBERSHIP & PHOTO DELIVERY MANAGEMENT SYSTEM
 * Frontend Logic (app.js)
 * ============================================================================
 */

const RERE_BRANDING = { appName: "Rere Photo", logoUrl: "logo.svg" };
let GAS_WEB_APP_URL = localStorage.getItem("REREPHOTO_GAS_URL") || "";

// ============================================================================
// 0. KEAMANAN TAMPILAN: ESCAPE HTML & VALIDASI URL
// ============================================================================
// Dipakai setiap kali menampilkan data yang berasal dari input pengguna
// (nama member, deskripsi paket, dst) ke dalam innerHTML, supaya karakter
// seperti < > " tidak dieksekusi sebagai HTML/JS (mencegah stored XSS).
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Dipakai untuk atribut href/src: hanya loloskan URL http/https, selain itu
// diganti "#" supaya skema berbahaya seperti javascript: tidak bisa dipasang.
function safeUrl(url) {
  const u = String(url || "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  return "#";
}
// Khusus untuk src gambar: selain http/https, izinkan juga "data:image/..."
// karena fitur upload foto (avatar member, foto paket) menyimpannya sebagai
// base64 data URI. data:image/ TIDAK bisa dipakai untuk menjalankan script
// (berbeda dari data:text/html), jadi aman dipakai di <img>. Skema lain
// (termasuk javascript: dan data:text/html) tetap ditolak.
function safeImageUrl(url) {
  const u = String(url || "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u)) return u;
  return "";
}

let currentUser = JSON.parse(localStorage.getItem("REREPHOTO_USER")) || null;
let currentStaffAccount = JSON.parse(localStorage.getItem("REREPHOTO_ACTIVE_STAFF")) || null;
let cachedStaffList = JSON.parse(localStorage.getItem("REREPHOTO_STAFF_CACHE")) || [];
let cachedPackages = JSON.parse(localStorage.getItem("REREPHOTO_PACKAGES_CACHE")) || [];
let appSettings = JSON.parse(localStorage.getItem("REREPHOTO_SETTINGS")) || {};

// ============================================================================
// 1. DATABASE MOCK LOKAL
// ============================================================================

const MOCK_INITIAL_DATA = {
  users: [
    { id: "081234567891", name: "Aurelia Amara", email: "aurelia@gmail.com", phone: "081234567891", password: btoa("123"), role: "client", points: 45, tier: "Gold \u{1F31F}", created_at: "2026-01-15", avatar_url: "" }
  ],
  transactions: [],
  staff: [
    { staff_id: "ST-001", name: "Rizky Pratama", shift: "Shift Pagi (08:00-14:00)", total_handled: 0, status: "Aktif", pass_hash: "" },
    { staff_id: "ST-002", name: "Dinda Kirana", shift: "Shift Siang (14:00-20:00)", total_handled: 0, status: "Aktif", pass_hash: "" }
  ],
  packages: [
    { package_id: "PKG-001", name: "Self Photo", duration: "Fleksibel", price: 60000, points: 15, status: "Aktif", photo_url: "", price_type: "flat", min_person: 1, max_person: 5, extra_person_price: 0, free_print: 1, extra_print_price: 5000, description: "Studio self-photo eksklusif untuk kamu dan orang tersayang." },
    { package_id: "PKG-002", name: "Vintage Box", duration: "Fleksibel", price: 25000, points: 10, status: "Aktif", photo_url: "", price_type: "per_orang", min_person: 2, max_person: 99, extra_person_price: 25000, free_print: 1, extra_print_price: 5000, description: "Nuansa vintage yang estetik untuk foto berkesan.", price_variants: [
      { id: "pv-vb-1", label: "Promo", price: 20000 },
      { id: "pv-vb-2", label: "Promo Sekolah", price: 15000 },
      { id: "pv-vb-3", label: "Promo Agustusan", price: 18000 }
    ] },
    { package_id: "PKG-003", name: "Photobox Cembung", duration: "Fleksibel", price: 20000, points: 8, status: "Aktif", photo_url: "", price_type: "per_orang", min_person: 2, max_person: 99, extra_person_price: 20000, free_print: 1, extra_print_price: 5000, description: "Efek lensa cembung unik untuk hasil foto yang beda." },
    { package_id: "PKG-004", name: "Red Room High Angle", duration: "Fleksibel", price: 25000, points: 10, status: "Aktif", photo_url: "", price_type: "per_orang", min_person: 2, max_person: 99, extra_person_price: 25000, free_print: 1, extra_print_price: 5000, description: "Sudut high angle dramatis di red room yang ikonik." },
    { package_id: "PKG-005", name: "Elevator Box", duration: "Fleksibel", price: 20000, points: 8, status: "Aktif", photo_url: "", price_type: "per_orang", min_person: 2, max_person: 99, extra_person_price: 20000, free_print: 1, extra_print_price: 5000, description: "Konsep elevator unik untuk foto yang berbeda dari biasanya." },
    { package_id: "PKG-006", name: "Sudut Merah", duration: "Fleksibel", price: 30000, points: 12, status: "Aktif", photo_url: "", price_type: "per_orang", min_person: 2, max_person: 99, extra_person_price: 30000, free_print: 1, extra_print_price: 5000, description: "Background merah elegan untuk foto yang memukau." }
  ],
  rewards: [
    { reward_id: "RWD-001", name: "Free Cetak 1 Lembar", description: "Tukarkan poin untuk 1 lembar cetak foto gratis", points_required: 30, stock: 99, status: "Aktif" },
    { reward_id: "RWD-002", name: "Diskon Rp10.000", description: "Potongan harga Rp10.000 untuk sesi berikutnya", points_required: 50, stock: 99, status: "Aktif" },
    { reward_id: "RWD-003", name: "Free Sesi Self Photo", description: "Sesi Self Photo gratis untuk 1 orang", points_required: 100, stock: 10, status: "Aktif" }
  ],
  reward_redemptions: [],
  bookings: (function () {
    const _d = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 10);
    const _t = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    return [
      { booking_id: "BK-DEMO001", created_at: _t(), member_id: "081234567891", member_name: "Aurelia Amara", package_id: "PKG-002", package_name: "Vintage Box", date: _d(3 * 864e5), time: "13:00", location: "Studio Rere Photo", guests: 2, notes: "Tema vintage bareng teman", total: 50000, status: "Menunggu Konfirmasi", confirmed_by: "", updated_at: "" },
      { booking_id: "BK-DEMO002", created_at: _t(), member_id: "081234567891", member_name: "Aurelia Amara", package_id: "PKG-001", package_name: "Self Photo", date: _d(-7 * 864e5), time: "10:00", location: "Studio Rere Photo", guests: 1, notes: "", total: 60000, status: "Selesai", confirmed_by: "Rizky Pratama", updated_at: _t() }
    ];
  })(),
  sales: [],
  expenses: [],
  suppliers: [
    { id: "SUP-001", name: "Toko Kertas Jaya", phone: "081211111111", address: "Pasar Baru, Indramayu" },
    { id: "SUP-002", name: "CV Tinta Abadi", phone: "081222222222", address: "Jl. Merdeka No. 8, Cirebon" }
  ],
  stock: [
    { id: "STK-001", name: "Kertas Foto Glossy 4R", category: "Bahan Cetak", qty: 120, unit: "lembar", min_qty: 20, buy_price: 800, sell_price: 1500, supplier_id: "SUP-001" },
    { id: "STK-002", name: "Tinta Printer Epson 664 (Hitam)", category: "Tinta", qty: 6, unit: "botol", min_qty: 3, buy_price: 55000, sell_price: 0, supplier_id: "SUP-002" },
    { id: "STK-003", name: "Frame Polaroid Set", category: "Aksesoris", qty: 45, unit: "pcs", min_qty: 10, buy_price: 3000, sell_price: 5000, supplier_id: "SUP-001" },
    { id: "STK-004", name: "Ziplock Foto 4R", category: "Kemasan", qty: 8, unit: "pak", min_qty: 15, buy_price: 5000, sell_price: 0, supplier_id: "SUP-001" },
    { id: "STK-005", name: "Prop Kacamata & Topi", category: "Props", qty: 30, unit: "pcs", min_qty: 8, buy_price: 25000, sell_price: 0, supplier_id: "" }
  ],
  stockMovements: [
    { id: "STM-001", item_id: "STK-001", type: "masuk", qty: 100, note: "Stok awal", date: new Date(Date.now() - 20 * 864e5).toISOString().slice(0,10), staff: "Owner" },
    { id: "STM-002", item_id: "STK-004", type: "masuk", qty: 20, note: "Beli dari supplier", date: new Date(Date.now() - 5 * 864e5).toISOString().slice(0,10), staff: "Owner" }
  ],
  vouchers: [
    { id: "VCH-001", code: "RERE10", discount_type: "percent", value: 10, quota: 50, used: 12, expires_at: "2026-12-31", status: "Aktif" },
    { id: "VCH-002", code: "FOTO5K", discount_type: "nominal", value: 5000, quota: 100, used: 3, expires_at: "2026-09-30", status: "Aktif" }
  ],
  frameTemplates: [],
  attendance: [],
  cashflow: [],
  recurringExpenses: [],
  tasks: [],
  settings: {
    tier_gold: 50, tier_platinum: 100, tier_diamond: 200,
    owner_email: "", owner_pass_hash: "", owner_name: "Owner Rere Photo",
    hero_banner_url: "", app_setup_done: false,
    studio_wa: "6281234567890",
    studio_ig: "rerephotoid",
    studio_tiktok: "rerephotoid",
    studio_fb: "rerephotoid",
    studio_alamat: "Jl. Raya, Tanjungpura, Kec. Karangampel, Kabupaten Indramayu, Jawa Barat 45283",
    studio_jam: "08:00 – 20:00",
    studio_maps: "https://maps.app.goo.gl/f82fhTxtpZqSLwr77"
  }
};

function initMockDb() {
  const existing = localStorage.getItem("REREPHOTO_MOCK_DB");
  if (existing) {
    const db = JSON.parse(existing);
    let changed = false;
    // Patch: tambah rewards jika belum ada
    if (!db.rewards) { db.rewards = MOCK_INITIAL_DATA.rewards; changed = true; }
    if (!db.reward_redemptions) { db.reward_redemptions = []; changed = true; }
    if (!db.bookings) { db.bookings = []; changed = true; }
    // Seed data demo supaya portal langsung terlihat hidup & bisa dicoba.
    if (db.users && !db.users.length) { db.users = MOCK_INITIAL_DATA.users; changed = true; }
    if (db.staff && !db.staff.length) { db.staff = MOCK_INITIAL_DATA.staff; changed = true; }
    if (db.bookings && !db.bookings.length) { db.bookings = MOCK_INITIAL_DATA.bookings; changed = true; }
    if (!db.sales) { db.sales = []; changed = true; }
    if (!db.expenses) { db.expenses = []; changed = true; }
    if (!db.suppliers) { db.suppliers = MOCK_INITIAL_DATA.suppliers; changed = true; }
    if (!db.stock) { db.stock = MOCK_INITIAL_DATA.stock; changed = true; }
    if (!db.stockMovements) { db.stockMovements = []; changed = true; }
    if (!db.vouchers) { db.vouchers = MOCK_INITIAL_DATA.vouchers; changed = true; }
    if (!db.frameTemplates) { db.frameTemplates = []; changed = true; }
    if (!db.attendance) { db.attendance = []; changed = true; }
    if (!db.cashflow) { db.cashflow = []; changed = true; }
    if (!db.recurringExpenses) { db.recurringExpenses = []; changed = true; }
    if (!db.tasks) { db.tasks = []; changed = true; }
    // Patch: pastikan settings ada
    if (!db.settings) { db.settings = MOCK_INITIAL_DATA.settings; changed = true; }
    // Patch: tambah studio settings jika belum ada
    const studioDefaults = ["studio_wa","studio_ig","studio_tiktok","studio_fb","studio_alamat","studio_jam","studio_maps"];
    studioDefaults.forEach(k => {
      if (db.settings[k] === undefined) {
        db.settings[k] = MOCK_INITIAL_DATA.settings[k] || "";
        changed = true;
      }
    });
    if (db.settings.tier_gold === undefined) { db.settings.tier_gold = 50; changed = true; }
    if (db.settings.tier_platinum === undefined) { db.settings.tier_platinum = 100; changed = true; }
    if (db.settings.tier_diamond === undefined) { db.settings.tier_diamond = 200; changed = true; }
    if (changed) saveMockDb(db);
  } else {
    localStorage.setItem("REREPHOTO_MOCK_DB", JSON.stringify(MOCK_INITIAL_DATA));
    localStorage.setItem("REREPHOTO_SETTINGS", JSON.stringify(MOCK_INITIAL_DATA.settings));
  }
}
initMockDb();

function getMockDb() { return JSON.parse(localStorage.getItem("REREPHOTO_MOCK_DB")); }
function saveMockDb(db) { localStorage.setItem("REREPHOTO_MOCK_DB", JSON.stringify(db)); }

// ── Token sesi untuk Mode Offline Lokal ─────────────────────────────────
// Catatan: mode ini hanya berjalan di browser sendiri (tanpa server nyata),
// jadi "token" di sini murni untuk menyamakan bentuk data dengan mode
// online, bukan untuk keamanan lintas-perangkat. Keamanan sesungguhnya
// (yang menahan orang lain memanggil action sensitif) ada di Code.gs.
function mockIssueToken(user, role) {
  // Mode lokal (tanpa server) tidak punya manfaat keamanan nyata dari TTL
  // pendek — semua data sudah ada di browser pengguna. Pakai 30 hari untuk
  // semua peran supaya owner/staf tidak perlu login ulang tiap 12 jam.
  const ttl = 30 * 24 * 60 * 60 * 1000;
  const payload = { id: String(user.id), role, name: user.name || "", exp: Date.now() + ttl };
  return btoa(JSON.stringify(payload));
}
function mockVerifyToken(token) {
  try {
    const payload = JSON.parse(atob(token));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}
// Helper singkat: pastikan token valid & rolenya termasuk yang diizinkan.
// Return null (lolos) atau objek { status:"error", message } untuk dikembalikan langsung.
function mockRequireRole(payload, roles) {
  const auth = mockVerifyToken(payload && payload.token);
  if (!auth) return { status: "error", message: "Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang." };
  if (roles.indexOf(auth.role) === -1) return { status: "error", message: "Akses ditolak untuk peran akun ini." };
  return null;
}
// Sama seperti getNextId() di backend: cari angka terbesar yang sudah
// dipakai, bukan dari jumlah baris — supaya ID tidak dobel setelah dihapus.
function mockNextId(list, prefix, idField) {
  let maxNum = 0;
  const pattern = new RegExp("^" + prefix + "-(\\d+)$");
  list.forEach(item => {
    const m = String(item[idField] || "").match(pattern);
    if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
  });
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

// ============================================================================
// 2. FETCH API KE GOOGLE APPS SCRIPT
// ============================================================================

const PUBLIC_ACTIONS = ["test", "login", "register", "setupOwnerAccount", "requestPasswordReset", "confirmPasswordReset", "getStaffList", "getPackages", "getSettings", "getRewards"];

function getActiveToken() {
  if (currentStaffAccount && currentStaffAccount.token) return currentStaffAccount.token;
  if (currentUser && currentUser.token) return currentUser.token;
  return null;
}

function isSessionInvalidResult(result) {
  return !!(result && result.status === "error" && typeof result.message === "string" &&
    (result.message.includes("Sesi tidak valid") || result.message.includes("kedaluwarsa")));
}

let sessionInvalidHandled = false; // cegah loop: cukup tangani sekali per kunjungan halaman
function handleInvalidSession() {
  if (sessionInvalidHandled) return;
  sessionInvalidHandled = true;
  localStorage.removeItem("REREPHOTO_USER");
  localStorage.removeItem("REREPHOTO_ACTIVE_STAFF");
  currentUser = null;
  currentStaffAccount = null;
  // PENTING: tidak lagi auto-reload/redirect di sini. Auto-reload sebelumnya
  // berisiko membuat halaman reload berulang-ulang kalau ada beberapa
  // permintaan sekaligus sama-sama mendeteksi sesi tidak valid (mis. token
  // yang sudah 12 jam kedaluwarsa). Sekarang cukup bersihkan sesi & minta
  // pengguna me-refresh sendiri — lebih aman daripada berisiko loop.
  showToast("Sesi kamu sudah tidak valid/kedaluwarsa. Silakan refresh halaman ini dan login ulang.", "error");
}

async function sendGasRequest(action, payload = {}, method = "POST") {
  showLoadingSpinner(true);
  try {
    const fullPayload = { ...payload };
    if (!fullPayload.token && PUBLIC_ACTIONS.indexOf(action) === -1) {
      const token = getActiveToken();
      if (token) fullPayload.token = token;
    }

    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.trim() === "" || GAS_WEB_APP_URL.includes("placeholder")) {
      await new Promise(r => setTimeout(r, 350));
      const res = executeMockBackend(action, fullPayload);
      showLoadingSpinner(false);
      if (action !== "login" && isSessionInvalidResult(res)) handleInvalidSession();
      return res;
    }

    let url = GAS_WEB_APP_URL;
    let options = {};
    if (method === "GET") {
      const queryParams = new URLSearchParams({ action, ...fullPayload }).toString();
      url += (url.includes("?") ? "&" : "?") + queryParams;
      options = { method: "GET" };
    } else {
      options = { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...fullPayload }) };
    }
    const response = await fetch(url, options);
    const result = await response.json();
    showLoadingSpinner(false);
    if (action !== "login" && isSessionInvalidResult(result)) handleInvalidSession();
    return result;
  } catch (error) {
    console.error("❌ Error Fetch GAS:", error);
    showLoadingSpinner(false);
    showToast("Gagal terhubung ke Google Sheets. Menggunakan Mode Offline Lokal.", "error");
    return executeMockBackend(action, payload);
  }
}

function executeMockBackend(action, payload) {
  const db = getMockDb();

  if (action === "login") {
    const { email_phone, password } = payload;
    const ep = String(email_phone).trim().toLowerCase();
    const pw = String(password).trim();

    // ── Owner login ──────────────────────────────────────
    // Cek email owner dari settings, default: admin@rerephoto.com
    const ownerEmail = ((db.settings && db.settings.owner_email) || "admin@rerephoto.com").toLowerCase();
    if (ep === ownerEmail) {
      const ownerHash = (db.settings && db.settings.owner_pass_hash) || "";
      // Jika hash belum di-set → terima password apapun & simpan hash
      if (!ownerHash) {
        if (!db.settings) db.settings = {};
        db.settings.owner_pass_hash = btoa(pw);
        saveMockDb(db);
        const ownerUser = { id: "AD-001", name: "Owner Rere Photo", email_phone: ownerEmail, role: "admin" };
        ownerUser.token = mockIssueToken(ownerUser, "admin");
        return { status: "success", message: "Login Owner berhasil! Password tersimpan.", user: ownerUser };
      }
      if (btoa(pw) === ownerHash) {
        const ownerUser = { id: "AD-001", name: "Owner Rere Photo", email_phone: ownerEmail, role: "admin" };
        ownerUser.token = mockIssueToken(ownerUser, "admin");
        return { status: "success", message: "Login Owner berhasil!", user: ownerUser };
      }
      return { status: "error", message: "Kata sandi Owner salah!" };
    }

    // ── Staff login ──────────────────────────────────────
    const staffObj = db.staff.find(s => s.staff_id.toLowerCase() === ep);
    if (staffObj) {
      const staffHash = staffObj.pass_hash || "";
      // Jika hash belum di-set → terima "123" & simpan
      if (!staffHash || btoa(pw) === staffHash) {
        if (!staffHash) {
          staffObj.pass_hash = btoa(pw);
          saveMockDb(db);
        }
        const staffUser = { id: staffObj.staff_id, name: staffObj.name, shift: staffObj.shift, role: "staff" };
        staffUser.token = mockIssueToken(staffUser, "staff");
        return { status: "success", message: "Login Staf berhasil!", user: staffUser };
      }
      return { status: "error", message: "Kata sandi Staf salah!" };
    }

    // ── Member login ─────────────────────────────────────
    const epNorm = ep.replace(/^0+/, "");
    const user = db.users.find(u => String(u.id).toLowerCase() === ep || String(u.id).toLowerCase().replace(/^0+/, "") === epNorm);
    if (user) {
      const hashMatch  = btoa(pw) === user.password;
      const plainMatch = pw === user.password; // backward compat data lama
      const resetPending = !user.password; // password baru saja direset owner
      if (hashMatch || plainMatch || resetPending) {
        if (!hashMatch) { user.password = btoa(pw); saveMockDb(db); }
        const userOut = { ...user };
        userOut.token = mockIssueToken(userOut, "client");
        return { status: "success", message: "Login Member berhasil!", user: userOut };
      }
      return { status: "error", message: "Kata sandi salah!" };
    }

    return { status: "error", message: "Nomor HP/Email atau Kata Sandi salah!" };
  }
  else if (action === "register") {
    const { name, email, phone, password } = payload;
    const memberId = String(phone).trim();
    if (!memberId) return { status: "error", message: "Nomor HP wajib diisi sebagai ID Member." };
    if (db.users.some(u => u.id === memberId)) return { status: "error", message: "Nomor HP sudah terdaftar di Rere Photo!" };
    const newUser = { id: memberId, name, email: email || "", phone: memberId, password: btoa(password), role: "client", points: 10, tier: "Silver", created_at: new Date().toISOString().split('T')[0], avatar_url: "" };
    db.users.push(newUser);
    saveMockDb(db);
    const userOut = { ...newUser };
    userOut.token = mockIssueToken(userOut, "client");
    return { status: "success", message: "Registrasi berhasil! +10 Poin Welcome Bonus!", user: userOut };
  }
  else if (action === "requestPasswordReset") {
    const memberId = String(payload.member_id || "").trim();
    const memberIdNorm = memberId.replace(/^0+/, "");
    const u = db.users.find(x => String(x.id).replace(/^0+/, "") === memberIdNorm);
    if (!u) return { status: "error", message: "Nomor HP tidak ditemukan." };
    if (!u.email) return { status: "error", message: "Nomor ini belum punya email terdaftar. Silakan hubungi admin studio untuk reset manual." };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!db.pwResetCodes) db.pwResetCodes = {};
    db.pwResetCodes[u.id] = code;
    saveMockDb(db);
    // Mode Offline Lokal tidak bisa mengirim email sungguhan — kode
    // ditampilkan langsung di sini supaya alurnya tetap bisa dicoba.
    showToast(`📧 [Mode Offline] Kode reset kamu: ${code}`, "info");
    return { status: "success", message: `[Mode Offline] Kode reset ditampilkan di notifikasi (email sungguhan hanya terkirim kalau sudah terhubung ke Google Sheets).` };
  }
  else if (action === "confirmPasswordReset") {
    const memberId = String(payload.member_id || "").trim();
    const memberIdNorm = memberId.replace(/^0+/, "");
    const u = db.users.find(x => String(x.id).replace(/^0+/, "") === memberIdNorm);
    if (!u) return { status: "error", message: "Nomor HP tidak ditemukan." };
    const savedCode = db.pwResetCodes && db.pwResetCodes[u.id];
    if (!savedCode || savedCode !== String(payload.code || "").trim()) {
      return { status: "error", message: "Kode salah atau sudah kedaluwarsa. Silakan minta kode baru." };
    }
    delete db.pwResetCodes[u.id];
    u.password = btoa(String(payload.new_password || "").trim());
    saveMockDb(db);
    const userOut = { ...u };
    userOut.token = mockIssueToken(userOut, "client");
    return { status: "success", message: "Password berhasil diganti! Kamu sudah login otomatis.", user: userOut };
  }
  else if (action === "updateProfile") {
    const { id, name, email, password, avatar_url } = payload;
    // Sama seperti backend asli: member hanya boleh mengubah profilnya sendiri.
    const auth = mockVerifyToken(payload.token);
    if (!auth || auth.role !== "client" || auth.id !== String(id).trim()) {
      return { status: "error", message: "Sesi tidak valid, atau Anda mencoba mengubah profil member lain." };
    }
    const u = db.users.find(x => x.id === String(id).trim());
    if (!u) return { status: "error", message: "Member tidak ditemukan." };
    if (name !== undefined) u.name = name;
    if (email !== undefined) u.email = email;
    if (password && password !== "") u.password = btoa(password);
    if (avatar_url !== undefined) u.avatar_url = avatar_url;
    saveMockDb(db);
    const userOut = { ...u };
    userOut.token = mockIssueToken(userOut, "client");
    return { status: "success", message: "Profil berhasil diperbarui!", user: userOut };
  }
  else if (action === "addTransaction") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const { member_id, points_to_add, package_name, gdrive_url, staff_id, staff_name } = payload;
    const pts = Number(points_to_add) || 0;
    const u = db.users.find(x => x.id === String(member_id).trim());
    if (!u) return { status: "error", message: `ID Member (${member_id}) tidak ditemukan!` };    u.points += pts;
    // Batas tier diambil dari settings (bisa diubah owner)
    const tierGold     = Number((db.settings && db.settings.tier_gold)     || 50);
    const tierPlatinum = Number((db.settings && db.settings.tier_platinum)  || 100);
    const tierDiamond  = Number((db.settings && db.settings.tier_diamond)   || 200);
    if (u.points >= tierDiamond) u.tier = "Diamond 💎";
    else if (u.points >= tierPlatinum) u.tier = "Platinum 👑";
    else if (u.points >= tierGold)     u.tier = "Gold 🌟";
    const trxId = "TRX-" + Math.floor(100000 + Math.random() * 900000);
    const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const newTrx = { trx_id: trxId, timestamp: nowStr, member_id: u.id, member_name: u.name, package_name: package_name || "Sesi Foto Reguler", gdrive_url: gdrive_url || "https://drive.google.com", points_added: pts, staff_id: staff_id || "ST-001", staff_name: staff_name || "Staf Rere Photo", cover_url: payload.cover_url || "", photos: Array.isArray(payload.photos) ? payload.photos : [] };
    db.transactions.unshift(newTrx);
    const sIdx = db.staff.findIndex(s => s.staff_id === staff_id);
    if (sIdx !== -1) db.staff[sIdx].total_handled += 1;
    saveMockDb(db);
    return { status: "success", message: `Berhasil mengirim link foto dan menambah ${pts} poin ke ${u.name}!`, transaction: newTrx, updatedUser: u };
  }
  else if (action === "getStaffList") return { status: "success", staffList: db.staff };
  else if (action === "addStaff") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const { name, shift } = payload;
    const newId = mockNextId(db.staff, "ST", "staff_id");
    const newStaff = { staff_id: newId, name, shift, total_handled: 0, status: "Aktif" };
    db.staff.push(newStaff);
    saveMockDb(db);
    return { status: "success", message: `Staf ${name} ditambahkan!`, newStaff };
  }
  else if (action === "deleteStaff") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    db.staff = db.staff.filter(s => s.staff_id !== payload.staff_id);
    saveMockDb(db);
    return { status: "success", message: "Staf dihapus." };
  }
  else if (action === "resetStaffPassword") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const staffObj = db.staff.find(s => s.staff_id === payload.staff_id);
    if (!staffObj) return { status: "error", message: "ID Staf tidak ditemukan." };
    staffObj.pass_hash = "";
    saveMockDb(db);
    return { status: "success", message: `Password staf ${staffObj.name} berhasil direset. Staf bisa membuat password baru saat login berikutnya.` };
  }
  else if (action === "getMembers") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const list = (db.users || []).filter(u => u.role === "client").slice().reverse();
    return { status: "success", members: list };
  }
  else if (action === "addMember") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const phone = String(payload.phone || "").trim();
    if (!phone) return { status: "error", message: "Nomor HP wajib diisi." };
    if (db.users.some(u => u.id === phone)) return { status: "error", message: "Nomor HP sudah terdaftar." };
    const u = { id: phone, name: payload.name || "Member", email: payload.email || "", phone, password: btoa(payload.password || "123"), role: "client", points: Number(payload.points) || 0, tier: "Silver", created_at: new Date().toISOString().slice(0, 10), avatar_url: "", gender: payload.gender || "", birth_date: payload.birth_date || "" };
    if (u.points >= 200) u.tier = "Diamond \u{1F48E}";
    else if (u.points >= 100) u.tier = "Platinum \u{1F451}";
    else if (u.points >= 50) u.tier = "Gold \u{1F31F}";
    db.users.push(u); saveMockDb(db);
    return { status: "success", message: "Member " + u.name + " ditambahkan.", member: u };
  }
  else if (action === "updateMember") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const u = db.users.find(x => x.id === String(payload.id).trim());
    if (!u) return { status: "error", message: "Member tidak ditemukan." };
    if (payload.name !== undefined && payload.name !== "") u.name = payload.name;
    if (payload.email !== undefined) u.email = payload.email;
    if (payload.points !== undefined && payload.points !== "") u.points = Number(payload.points) || 0;
    if (payload.tier !== undefined && payload.tier !== "") u.tier = payload.tier;
    if (payload.gender !== undefined) u.gender = payload.gender;
    if (payload.birth_date !== undefined) u.birth_date = payload.birth_date;
    if (payload.new_password !== undefined && payload.new_password !== "") {
      if (String(payload.new_password).trim().length < 4) return { status: "error", message: "Password baru minimal 4 karakter." };
      u.password = btoa(String(payload.new_password).trim());
    }
    saveMockDb(db);
    return { status: "success", message: `Data member ${u.name} berhasil diperbarui!` };
  }
  else if (action === "resetMemberPassword") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const u = db.users.find(x => x.id === String(payload.id).trim());
    if (!u) return { status: "error", message: "Member tidak ditemukan." };
    u.password = "";
    saveMockDb(db);
    return { status: "success", message: `Password member ${u.name} berhasil direset. Member bisa membuat password baru saat login berikutnya.` };
  }
  else if (action === "lookupMember") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const memberId = String(payload.member_id || "").trim().replace(/^0+/, "");
    const u = db.users.find(x => String(x.id).trim().replace(/^0+/, "") === memberId);
    if (!u) return { status: "success", found: false };
    return { status: "success", found: true, member: { id: u.id, name: u.name, tier: u.tier, points: u.points } };
  }
  else if (action === "getPackages") return { status: "success", packages: db.packages };
  else if (action === "addPackage") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const newId = mockNextId(db.packages, "PKG", "package_id");
    const newPkg = {
      package_id: newId,
      name: payload.name, duration: payload.duration || "Fleksibel",
      price: Number(payload.price), points: Number(payload.points),
      price_type: payload.price_type || "flat",
      min_person: Number(payload.min_person) || 1,
      max_person: Number(payload.max_person) || 99,
      extra_person_price: Number(payload.extra_person_price) || 0,
      free_print: Number(payload.free_print) || 1,
      extra_print_price: Number(payload.extra_print_price) || 0,
      photo_url: payload.photo_url || "",
      description: payload.description || "",
      status: "Aktif",
      price_variants: Array.isArray(payload.price_variants) ? payload.price_variants : []
    };
    db.packages.push(newPkg);
    saveMockDb(db);
    return { status: "success", message: `Paket ${payload.name} ditambahkan!`, newPackage: newPkg };
  }
  else if (action === "updatePackage") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const p = db.packages.find(x => x.package_id === payload.package_id);
    if (!p) return { status: "error", message: "Paket tidak ditemukan." };
    Object.assign(p, {
      name: payload.name, duration: payload.duration,
      price: Number(payload.price), points: Number(payload.points),
      price_type: payload.price_type || p.price_type,
      min_person: Number(payload.min_person) || p.min_person,
      max_person: Number(payload.max_person) || p.max_person,
      extra_person_price: Number(payload.extra_person_price) || 0,
      free_print: Number(payload.free_print) || p.free_print,
      extra_print_price: Number(payload.extra_print_price) || 0,
      photo_url: payload.photo_url !== undefined ? payload.photo_url : p.photo_url,
      description: payload.description || p.description,
      price_variants: Array.isArray(payload.price_variants) ? payload.price_variants : p.price_variants || []
    });
    saveMockDb(db);
    return { status: "success", message: `Paket ${p.name} diperbarui!` };
  }
  else if (action === "deletePackage") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    db.packages = db.packages.filter(p => p.package_id !== payload.package_id);
    saveMockDb(db);
    return { status: "success", message: "Paket dihapus." };
  }
  // ── REWARD CRUD ──────────────────────────────────────
  else if (action === "getRewards") return { status: "success", rewards: db.rewards || [] };
  else if (action === "addReward") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    if (!db.rewards) db.rewards = [];
    const newId = mockNextId(db.rewards, "RWD", "reward_id");
    const rwd = { reward_id: newId, name: payload.name, description: payload.description || "", points_required: Number(payload.points_required), stock: Number(payload.stock) || 99, status: "Aktif" };
    db.rewards.push(rwd);
    saveMockDb(db);
    return { status: "success", message: `Reward ${payload.name} ditambahkan!`, reward: rwd };
  }
  else if (action === "updateReward") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    if (!db.rewards) return { status: "error", message: "Belum ada reward." };
    const r = db.rewards.find(x => x.reward_id === payload.reward_id);
    if (!r) return { status: "error", message: "Reward tidak ditemukan." };
    Object.assign(r, { name: payload.name, description: payload.description, points_required: Number(payload.points_required), stock: Number(payload.stock), status: payload.status || r.status });
    saveMockDb(db);
    return { status: "success", message: `Reward ${r.name} diperbarui!` };
  }
  else if (action === "deleteReward") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    if (!db.rewards) return { status: "error", message: "Tidak ada reward." };
    db.rewards = db.rewards.filter(r => r.reward_id !== payload.reward_id);
    saveMockDb(db);
    return { status: "success", message: "Reward dihapus." };
  }
  // ── TUKAR POIN (tidak turunkan tier) ─────────────────
  else if (action === "redeemReward") {
    const { member_id, reward_id } = payload;
    const auth = mockVerifyToken(payload.token);
    if (!auth || auth.role !== "client" || auth.id !== String(member_id).trim()) {
      return { status: "error", message: "Sesi tidak valid, atau Anda mencoba menukar poin milik member lain." };
    }
    const user = db.users.find(u => u.id === String(member_id).trim());
    if (!user) return { status: "error", message: "Member tidak ditemukan." };
    if (!db.rewards) return { status: "error", message: "Tidak ada reward tersedia." };
    const reward = db.rewards.find(r => r.reward_id === reward_id);
    if (!reward) return { status: "error", message: "Reward tidak ditemukan." };
    if (reward.status !== "Aktif") return { status: "error", message: "Reward tidak aktif." };
    if (reward.stock <= 0) return { status: "error", message: "Stok reward habis." };
    if (user.points < reward.points_required) return { status: "error", message: `Poin tidak cukup. Butuh ${reward.points_required} poin, kamu punya ${user.points} poin.` };

    // Potong poin TANPA ubah tier (tier dihitung dari total poin yang pernah dikumpulkan)
    user.points -= reward.points_required;
    reward.stock -= 1;

    // Catat riwayat penukaran
    if (!db.reward_redemptions) db.reward_redemptions = [];
    const redemptionId = `RDM-${Date.now()}`;
    const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    db.reward_redemptions.push({
      id: redemptionId,
      member_id: user.id,
      member_name: user.name,
      reward_id,
      reward_name: reward.name,
      points_used: reward.points_required,
      redeemed_at: nowStr,
      status: "pending" // pending = belum dikonfirmasi karyawan
    });

    saveMockDb(db);
    return { status: "success", message: `✅ Berhasil menukar ${reward.points_required} poin dengan "${reward.name}"!`, updatedUser: { ...user }, reward };
  }
  else if (action === "getRedemptions") {
    const auth = mockVerifyToken(payload.token);
    if (!auth) return { status: "error", message: "Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang." };
    let memberFilter = payload.member_id;
    if (auth.role === "client") {
      if (memberFilter && memberFilter !== auth.id) return { status: "error", message: "Anda hanya bisa melihat riwayat penukaran milik sendiri." };
      memberFilter = auth.id;
    }
    const rdms = db.reward_redemptions || [];
    const filtered = memberFilter
      ? rdms.filter(r => r.member_id === String(memberFilter).trim())
      : payload.status
        ? rdms.filter(r => r.status === payload.status)
        : rdms;
    return { status: "success", redemptions: filtered.slice().reverse() };
  }
  else if (action === "confirmRedemption") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const { redemption_id, staff_id, staff_name } = payload;
    const rdm = (db.reward_redemptions || []).find(r => r.id === redemption_id);
    if (!rdm) return { status: "error", message: "Data penukaran tidak ditemukan." };
    if (rdm.status === "confirmed") return { status: "error", message: "Sudah dikonfirmasi sebelumnya." };
    rdm.status = "confirmed";
    rdm.confirmed_by = staff_name || staff_id || "Staf";
    rdm.confirmed_at = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    saveMockDb(db);
    return { status: "success", message: `✅ Reward "${rdm.reward_name}" untuk ${rdm.member_name} berhasil dikonfirmasi!` };
  }
  else if (action === "getSettings") {
    // Sama seperti backend asli: owner_pass_hash tidak pernah dikirim ke client.
    const raw = db.settings || {};
    const { owner_pass_hash, ...publicSettings } = raw;
    return { status: "success", settings: publicSettings };
  }
  else if (action === "updateSetting") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    if (!db.settings) db.settings = {};
    db.settings[payload.key] = payload.value;
    saveMockDb(db);
    localStorage.setItem("REREPHOTO_SETTINGS", JSON.stringify(db.settings));
    return { status: "success", message: `Pengaturan ${payload.key} diperbarui!` };
  }
  else if (action === "setupOwnerAccount") {
    // Sama seperti backend asli: hanya berhasil SEKALI, sebelum app_setup_done = true.
    if (!db.settings) db.settings = {};
    if (db.settings.app_setup_done === true || db.settings.app_setup_done === "true") {
      return { status: "error", message: "Akun owner sudah pernah dibuat. Gunakan halaman login, atau reset lewat Google Sheets jika lupa password." };
    }
    const { name, email, password } = payload;
    if (!email || !password || String(password).trim().length < 6) {
      return { status: "error", message: "Email wajib diisi dan kata sandi minimal 6 karakter." };
    }
    const emailNorm = String(email).trim().toLowerCase();
    db.settings.owner_email = emailNorm;
    db.settings.owner_pass_hash = btoa(String(password).trim());
    db.settings.owner_name = name || "Owner Rere Photo";
    db.settings.app_setup_done = true;
    saveMockDb(db);
    const ownerUser = { id: "AD-001", name: db.settings.owner_name, email_phone: emailNorm, role: "admin" };
    ownerUser.token = mockIssueToken(ownerUser, "admin");
    return { status: "success", message: "Akun owner berhasil dibuat!", user: ownerUser };
  }
  else if (action === "getDashboardData") {
    const auth = mockVerifyToken(payload.token);
    if (!auth) return { status: "error", message: "Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang." };
    let { role, id } = payload;
    // Sama seperti backend asli: client/staff hanya bisa lihat data miliknya sendiri.
    if (auth.role === "client") { role = "client"; id = auth.id; }
    if (auth.role === "staff")  { role = "staff"; id = auth.id; }
    let trxs = db.transactions;
    if (role === "client") trxs = trxs.filter(t => t.member_id === String(id).trim());
    else if (role === "staff") trxs = trxs.filter(t => !id || t.staff_id === id || id === "ALL");
    const userInfo = role === "client" ? db.users.find(u => u.id === String(id).trim()) : null;
    return { status: "success", transactions: trxs, userInfo };
  }
  else if (action === "getAdminStats") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const clients = db.users.filter(u => u.role === "client");
    const totalPoints = clients.reduce((sum, c) => sum + (c.points || 0), 0);
    return {
      status: "success",
      stats: { totalMembers: clients.length, totalTransactions: db.transactions.length, totalPointsIssued: totalPoints, estRevenue: db.transactions.length * 85000 },
      recentTransactions: db.transactions.slice(0, 15), staffList: db.staff, packagesList: db.packages, membersList: clients, sheetUrl: "https://docs.google.com/spreadsheets"
    };
  }
  // ── BOOKING SESI FOTO ─────────────────────────
  else if (action === "createBooking") {
    const roleErr = mockRequireRole(payload, ["client"]);
    if (roleErr) return roleErr;
    const { package_id, package_name, date, time, location, guests, notes, total } = payload;
    if (!package_id || !date || !time || !location) {
      return { status: "error", message: "Lengkapi paket, tanggal, jam, dan lokasi sesi foto." };
    }
    const auth = mockVerifyToken(payload.token);
    const member = db.users.find(u => u.id === auth.id);
    const bookingId = "BK-" + Math.floor(100000 + Math.random() * 900000);
    const nowStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const booking = {
      booking_id: bookingId, created_at: nowStr, member_id: auth.id,
      member_name: member ? member.name : "Member",
      package_id, package_name: package_name || "", date, time, location,
      guests: Number(guests) || 1, notes: notes || "", total: Number(total) || 0,
      status: "Menunggu Konfirmasi", confirmed_by: "", updated_at: ""
    };
    db.bookings.push(booking);
    saveMockDb(db);
    return { status: "success", message: "Booking sesi foto berhasil dibuat! Kode booking: " + bookingId, booking };
  }
  else if (action === "getBookings") {
    const auth = mockVerifyToken(payload.token);
    if (!auth) return { status: "error", message: "Sesi tidak valid atau sudah kedaluwarsa. Silakan login ulang." };
    let list = db.bookings || [];
    if (auth.role === "client") {
      if (payload.member_id && String(payload.member_id).trim() !== auth.id) {
        return { status: "error", message: "Anda hanya bisa melihat booking milik sendiri." };
      }
      list = list.filter(b => b.member_id === auth.id);
    }
    if (payload.member_id) list = list.filter(b => b.member_id === String(payload.member_id).trim());
    if (payload.status)    list = list.filter(b => b.status === payload.status);
    return { status: "success", bookings: list.slice().reverse() };
  }
  else if (action === "updateBookingStatus") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const ALLOWED = ["Terkonfirmasi", "Selesai", "Dibatalkan"];
    if (ALLOWED.indexOf(payload.status) === -1) return { status: "error", message: "Status tidak valid." };
    const b = (db.bookings || []).find(x => x.booking_id === payload.booking_id);
    if (!b) return { status: "error", message: "Booking tidak ditemukan." };
    if (b.status === "Dibatalkan" || b.status === "Selesai") {
      return { status: "error", message: "Booking sudah berstatus " + b.status + " dan tidak bisa diubah lagi." };
    }
    b.status = payload.status;
    b.confirmed_by = payload.staff_name || payload.staff_id || "Staf";
    b.updated_at = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    saveMockDb(db);
    return { status: "success", message: "Booking " + b.package_name + " berstatus " + b.status + "." };
  }
  else if (action === "cancelBooking") {
    const auth = mockVerifyToken(payload.token);
    if (!auth || auth.role !== "client" || auth.id !== String(payload.member_id).trim()) {
      return { status: "error", message: "Sesi tidak valid, atau Anda mencoba membatalkan booking milik member lain." };
    }
    const b = (db.bookings || []).find(x => x.booking_id === payload.booking_id);
    if (!b) return { status: "error", message: "Booking tidak ditemukan." };
    if (b.status !== "Menunggu Konfirmasi") {
      return { status: "error", message: "Hanya booking yang masih Menunggu Konfirmasi yang bisa dibatalkan." };
    }
    b.status = "Dibatalkan";
    b.confirmed_by = b.member_name + " (member)";
    b.updated_at = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    saveMockDb(db);
    return { status: "success", message: "Booking " + b.package_name + " berhasil dibatalkan." };
  }

  // ── KASIR & KEUANGAN ──────────────────────────
  else if (action === "createSale") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    // Sama seperti backend asli: staf tidak boleh mengatasnamakan staf lain.
    const _auth = mockVerifyToken(payload.token);
    if (_auth && _auth.role === "staff") {
      payload.kasir_id = _auth.id;
      payload.kasir_name = payload.kasir_name || _auth.name || "Staf";
    }
    const { customer_name, phone, member_id, package_id, package_name, persons, extra_print, total, payment_method, cash_received, notes, give_points, split, variant_label } = payload;
    if (!package_id || !customer_name || !total) return { status: "error", message: "Nama pelanggan, paket, dan total wajib diisi." };
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
        return { status: "error", message: "Pilih metode pembayaran yang berbeda untuk tiap bagian split." };
      }
      if (!valid || Math.abs(sumParts - tot) > 1) {
        return { status: "error", message: "Jumlah split pembayaran harus sama dengan total (" + tot.toLocaleString("id-ID") + ")." };
      }
      method = split.map(function (s) { return s.method; }).join(" + ");
      splitArr = split.map(function (s) { return { method: s.method, amount: Number(s.amount) }; });
      // Detail split disimpan di catatan
      const detail = split.map(function (s) { return s.method + " " + (Number(s.amount) || 0).toLocaleString("id-ID"); }).join(", ");
      finalNotes = (notes ? notes + " · " : "") + "Split: " + detail;
      // Bagian tunai untuk hitung kembalian
      const tunaiPart = split.find(function (s) { return s.method === "Tunai"; });
      if (tunaiPart) {
        cash = Number(cash_received) || Number(tunaiPart.amount) || 0;
        change = Math.max(0, cash - Number(tunaiPart.amount));
      } else {
        change = 0;
      }
    } else if (!method) {
      return { status: "error", message: "Pilih metode pembayaran." };
    }

    const saleId = "SL-" + Math.floor(100000 + Math.random() * 900000);
    const now = new Date();
    const nowStr = now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const dateStr = now.toISOString().slice(0, 10);
    let memberOut = null;
    if (member_id) {
      const u = db.users.find(x => x.id === String(member_id).trim());
      if (u && (give_points === true || give_points === "true")) {
        const pkgPoints = Number(payload.points_to_add) || 0;
        u.points += pkgPoints;
        if (u.points >= 200) u.tier = "Diamond \u{1F48E}";
        else if (u.points >= 100) u.tier = "Platinum \u{1F451}";
        else if (u.points >= 50) u.tier = "Gold \u{1F31F}";
        memberOut = { id: u.id, name: u.name, points: u.points, tier: u.tier };
      }
    }
    const sale = { sale_id: saleId, timestamp: nowStr, date: dateStr, customer_name: customer_name || "", phone: phone || "", member_id: member_id || "", package_id, package_name: package_name || "", variant_label: variant_label || "", persons: Number(persons) || 1, extra_print: Number(extra_print) || 0, total: tot, payment_method: method, cash_received: cash, change, notes: finalNotes, kasir_id: payload.kasir_id || "", kasir_name: payload.kasir_name || "Kasir", source: member_id ? "member" : "walkin", split: splitArr };
    db.sales.push(sale);
    saveMockDb(db);
    return { status: "success", message: "Penjualan tercatat! Total " + tot.toLocaleString("id-ID") + " (" + method + ").", sale, member: memberOut };
  }
  else if (action === "getSales") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    let list = (db.sales || []).slice();
    if (payload.kasir_id) list = list.filter(s => s.kasir_id === String(payload.kasir_id));
    if (payload.member_id) list = list.filter(s => s.member_id === String(payload.member_id).trim());
    if (payload.from) list = list.filter(s => String(s.date) >= String(payload.from));
    if (payload.to)   list = list.filter(s => String(s.date) <= String(payload.to));
    return { status: "success", sales: list.slice().reverse() };
  }
  else if (action === "getFinanceSummary") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const from = payload.from || "", to = payload.to || "";
    const sales = (db.sales || []).filter(s => (!from || String(s.date) >= from) && (!to || String(s.date) <= to));
    const expenses = (db.expenses || []).filter(s => (!from || String(s.date) >= from) && (!to || String(s.date) <= to));
    const totalIncome = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const totalExpense = expenses.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const byPayment = {};
    const byPackage = {};
    const byExpenseCategory = {};
    sales.forEach(s => { const k = s.payment_method || "Lainnya"; byPayment[k] = (byPayment[k] || 0) + (Number(s.total) || 0); });
    sales.forEach(s => { const k = s.package_name || "Paket"; if (!byPackage[k]) byPackage[k] = { count: 0, total: 0 }; byPackage[k].count += 1; byPackage[k].total += (Number(s.total) || 0); });
    expenses.forEach(s => { const k = s.category || "Lainnya"; byExpenseCategory[k] = (byExpenseCategory[k] || 0) + (Number(s.amount) || 0); });
    return {
      status: "success",
      summary: {
        totalSales: sales.length, totalIncome, totalExpenses: totalExpense, netProfit: totalIncome - totalExpense,
        byPayment, byPackage, byExpenseCategory,
        memberCount: sales.filter(s => s.source === "member").length,
        walkinCount: sales.filter(s => s.source !== "member").length
      },
      sales: sales.slice().reverse().slice(0, 25),
      expenses: expenses.slice().reverse().slice(0, 25)
    };
  }
  else if (action === "getExpenses") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    let list = (db.expenses || []).slice();
    if (payload.from) list = list.filter(s => String(s.date) >= String(payload.from));
    if (payload.to)   list = list.filter(s => String(s.date) <= String(payload.to));
    return { status: "success", expenses: list.slice().reverse() };
  }
  else if (action === "addExpense") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const { category, description, amount } = payload;
    if (!category || !amount) return { status: "error", message: "Kategori dan jumlah wajib diisi." };
    const now = new Date();
    const exp = { expense_id: "EXP-" + Math.floor(100000 + Math.random() * 900000), timestamp: now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }), date: now.toISOString().slice(0, 10), category, description: description || "", amount: Number(amount) || 0 };
    db.expenses.push(exp);
    saveMockDb(db);
    return { status: "success", message: "Pengeluaran " + category + " sebesar " + (Number(amount) || 0).toLocaleString("id-ID") + " tercatat.", expense: exp };
  }
  else if (action === "deleteExpense") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    db.expenses = (db.expenses || []).filter(s => s.expense_id !== payload.expense_id);
    saveMockDb(db);
    return { status: "success", message: "Pengeluaran dihapus." };
  }

  // ── STOK / INVENTORY ──────────────────────────
  else if (action === "getSuppliers") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    return { status: "success", suppliers: db.suppliers || [] };
  }
  else if (action === "addSupplier") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const sup = { id: mockNextId(db.suppliers || [], "SUP", "id"), name: payload.name, phone: payload.phone || "", address: payload.address || "" };
    if (!db.suppliers) db.suppliers = [];
    db.suppliers.push(sup); saveMockDb(db);
    return { status: "success", message: "Supplier " + sup.name + " ditambahkan.", supplier: sup };
  }
  else if (action === "updateSupplier") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const s = (db.suppliers || []).find(x => x.id === payload.id);
    if (!s) return { status: "error", message: "Supplier tidak ditemukan." };
    if (payload.name !== undefined) s.name = payload.name;
    if (payload.phone !== undefined) s.phone = payload.phone;
    if (payload.address !== undefined) s.address = payload.address;
    saveMockDb(db);
    return { status: "success", message: "Supplier diperbarui." };
  }
  else if (action === "deleteSupplier") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.suppliers = (db.suppliers || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Supplier dihapus." };
  }
  else if (action === "getStockItems") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    return { status: "success", stock: db.stock || [], suppliers: db.suppliers || [] };
  }
  else if (action === "addStockItem") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const it = { id: mockNextId(db.stock || [], "STK", "id"), name: payload.name, category: payload.category || "Umum", qty: Number(payload.qty) || 0, unit: payload.unit || "pcs", min_qty: Number(payload.min_qty) || 0, buy_price: Number(payload.buy_price) || 0, sell_price: Number(payload.sell_price) || 0, supplier_id: payload.supplier_id || "" };
    db.stock.push(it);
    if (Number(it.qty) > 0) {
      if (!db.stockMovements) db.stockMovements = [];
      db.stockMovements.push({ id: "STM-" + Math.floor(100000 + Math.random() * 900000), item_id: it.id, type: "masuk", qty: it.qty, note: "Stok awal", date: new Date().toISOString().slice(0, 10), staff: "Owner" });
    }
    saveMockDb(db);
    return { status: "success", message: "Barang " + it.name + " ditambahkan.", item: it };
  }
  else if (action === "updateStockItem") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const it = (db.stock || []).find(x => x.id === payload.id);
    if (!it) return { status: "error", message: "Barang tidak ditemukan." };
    if (payload.name !== undefined) it.name = payload.name;
    if (payload.category !== undefined) it.category = payload.category;
    if (payload.unit !== undefined) it.unit = payload.unit;
    if (payload.min_qty !== undefined) it.min_qty = Number(payload.min_qty) || 0;
    if (payload.buy_price !== undefined) it.buy_price = Number(payload.buy_price) || 0;
    if (payload.sell_price !== undefined) it.sell_price = Number(payload.sell_price) || 0;
    if (payload.supplier_id !== undefined) it.supplier_id = payload.supplier_id;
    saveMockDb(db);
    return { status: "success", message: "Barang " + it.name + " diperbarui." };
  }
  else if (action === "deleteStockItem") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.stock = (db.stock || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Barang dihapus." };
  }
  else if (action === "getStockMovements") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const list = (db.stockMovements || []).slice().reverse();
    const withName = list.map(m => { const it = (db.stock || []).find(x => x.id === m.item_id); return Object.assign({}, m, { item_name: it ? it.name : "?" }); });
    return { status: "success", movements: withName };
  }
  else if (action === "addStockMovement") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const it = (db.stock || []).find(x => x.id === payload.item_id);
    if (!it) return { status: "error", message: "Barang tidak ditemukan." };
    const qty = Number(payload.qty) || 0;
    if (qty <= 0) return { status: "error", message: "Jumlah harus lebih dari 0." };
    if (payload.type === "keluar" && it.qty < qty) return { status: "error", message: "Stok tidak cukup (sisa " + it.qty + ")." };
    it.qty = payload.type === "masuk" ? it.qty + qty : it.qty - qty;
    if (!db.stockMovements) db.stockMovements = [];
    const mv = { id: "STM-" + Math.floor(100000 + Math.random() * 900000), item_id: it.id, type: payload.type, qty, note: payload.note || "", date: payload.date || new Date().toISOString().slice(0, 10), staff: payload.staff || "Staf" };
    db.stockMovements.push(mv);
    saveMockDb(db);
    return { status: "success", message: (payload.type === "masuk" ? "Barang masuk: " : "Barang keluar: ") + qty + " " + it.unit + " " + it.name + ".", item: it };
  }
  // ── VOUCHER ─────────────────────────────────────
  else if (action === "getVouchers") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    return { status: "success", vouchers: (db.vouchers || []).slice().reverse() };
  }
  else if (action === "addVoucher") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const v = { id: "VCH-" + Math.floor(100000 + Math.random() * 900000), code: String(payload.code || "").toUpperCase().trim(), discount_type: payload.discount_type || "percent", value: Number(payload.value) || 0, quota: Number(payload.quota) || 0, used: 0, expires_at: payload.expires_at || "", status: "Aktif" };
    if (!v.code) return { status: "error", message: "Kode voucher wajib diisi." };
    if (!db.vouchers) db.vouchers = [];
    db.vouchers.push(v); saveMockDb(db);
    return { status: "success", message: "Voucher " + v.code + " dibuat.", voucher: v };
  }
  else if (action === "updateVoucher") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const v = (db.vouchers || []).find(x => x.id === payload.id);
    if (!v) return { status: "error", message: "Voucher tidak ditemukan." };
    if (payload.code !== undefined) v.code = String(payload.code).toUpperCase().trim();
    if (payload.discount_type !== undefined) v.discount_type = payload.discount_type;
    if (payload.value !== undefined) v.value = Number(payload.value) || 0;
    if (payload.quota !== undefined) v.quota = Number(payload.quota) || 0;
    if (payload.expires_at !== undefined) v.expires_at = payload.expires_at;
    if (payload.status !== undefined) v.status = payload.status;
    saveMockDb(db);
    return { status: "success", message: "Voucher " + v.code + " diperbarui." };
  }
  else if (action === "deleteVoucher") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    db.vouchers = (db.vouchers || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Voucher dihapus." };
  }
  // ── TEMPLATE BINGKAI ────────────────────────────
  else if (action === "getFrameTemplates") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    return { status: "success", templates: (db.frameTemplates || []).slice().reverse() };
  }
  else if (action === "saveFrameTemplate") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    if (!db.frameTemplates) db.frameTemplates = [];
    const t = { id: "FRM-" + Math.floor(100000 + Math.random() * 900000), name: payload.name || "Template", category: payload.category || "Umum", data_url: payload.data_url || "", width: Number(payload.width) || 1200, height: Number(payload.height) || 1800, created_at: new Date().toISOString().slice(0, 10) };
    db.frameTemplates.push(t); saveMockDb(db);
    return { status: "success", message: "Template bingkai '" + t.name + "' disimpan.", template: t };
  }
  else if (action === "deleteFrameTemplate") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.frameTemplates = (db.frameTemplates || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Template dihapus." };
  }
  // ── STAFF: update / hapus / gaji ────────────────
  else if (action === "updateStaff") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const s = (db.staff || []).find(x => x.staff_id === payload.staff_id);
    if (!s) return { status: "error", message: "Staf tidak ditemukan." };
    if (payload.name !== undefined) s.name = payload.name;
    if (payload.shift !== undefined) s.shift = payload.shift;
    if (payload.position !== undefined) s.position = payload.position;
    if (payload.salary !== undefined) s.salary = Number(payload.salary) || 0;
    if (payload.status !== undefined) s.status = payload.status;
    saveMockDb(db);
    return { status: "success", message: "Data staf diperbarui." };
  }
  else if (action === "getPayroll") {
    const roleErr = mockRequireRole(payload, ["admin"]);
    if (roleErr) return roleErr;
    const month = payload.month || new Date().toISOString().slice(0, 7);
    const att = (db.attendance || []).filter(a => String(a.date).startsWith(month));
    const rows = (db.staff || []).map(s => {
      const list = att.filter(a => a.staff_id === s.staff_id);
      const hadir = list.filter(a => a.status === "Hadir").length;
      const izin = list.filter(a => a.status === "Izin").length;
      const sakit = list.filter(a => a.status === "Sakit").length;
      const alpa = list.filter(a => a.status === "Alpa").length;
      const salary = Number(s.salary) || 0;
      const potonganPerHari = salary > 0 ? Math.round(salary / 26) : 0;
      const potongan = alpa * potonganPerHari;
      const total = Math.max(0, salary - potongan);
      return { staff_id: s.staff_id, name: s.name, position: s.position || "Staf", salary, hadir, izin, sakit, alpa, potongan, total };
    });
    return { status: "success", payroll: rows, month };
  }
  // ── ABSENSI ─────────────────────────────────────
  else if (action === "getAttendance") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const month = payload.month || new Date().toISOString().slice(0, 7);
    const list = (db.attendance || []).filter(a => String(a.date).startsWith(month)).slice().reverse();
    return { status: "success", attendance: list, staff: db.staff || [] };
  }
  else if (action === "markAttendance") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const staff = (db.staff || []).find(x => x.staff_id === payload.staff_id);
    if (!staff) return { status: "error", message: "Staf tidak ditemukan." };
    const dup = (db.attendance || []).find(a => a.staff_id === payload.staff_id && a.date === payload.date);
    if (dup) return { status: "error", message: "Absensi " + staff.name + " pada tanggal ini sudah ada." };
    if (!db.attendance) db.attendance = [];
    const a = { id: "ATT-" + Math.floor(100000 + Math.random() * 900000), staff_id: payload.staff_id, date: payload.date, status: payload.status || "Hadir", clock_in: payload.clock_in || "", note: payload.note || "" };
    db.attendance.push(a); saveMockDb(db);
    return { status: "success", message: "Absensi " + staff.name + " (" + a.status + ") dicatat.", attendance: a };
  }
  else if (action === "deleteAttendance") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.attendance = (db.attendance || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Absensi dihapus." };
  }
  // ── KAS / CASHFLOW ──────────────────────────────
  else if (action === "getCashflow") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const month = payload.month || new Date().toISOString().slice(0, 7);
    const list = (db.cashflow || []).filter(c => String(c.date).startsWith(month)).slice().reverse();
    return { status: "success", cashflow: list };
  }
  else if (action === "addCashflow") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    if (!payload.type || !payload.amount || Number(payload.amount) <= 0) return { status: "error", message: "Tipe dan jumlah wajib diisi." };
    if (!db.cashflow) db.cashflow = [];
    const cf = { id: "CF-" + Math.floor(100000 + Math.random() * 900000), type: payload.type, category: payload.category || (payload.type === "masuk" ? "Pendapatan" : "Pengeluaran"), amount: Number(payload.amount), date: payload.date || new Date().toISOString().slice(0, 10), note: payload.note || "", method: payload.method || "Tunai", kasir: payload.kasir || "Kasir" };
    db.cashflow.push(cf); saveMockDb(db);
    return { status: "success", message: (cf.type === "masuk" ? "Kas masuk" : "Kas keluar") + " " + cf.amount.toLocaleString("id-ID") + " dicatat.", cashflow: cf };
  }
  else if (action === "updateCashflow") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const cf = (db.cashflow || []).find(x => x.id === payload.id);
    if (!cf) return { status: "error", message: "Catatan tidak ditemukan." };
    if (payload.type !== undefined) cf.type = payload.type;
    if (payload.category !== undefined) cf.category = payload.category;
    if (payload.amount !== undefined) cf.amount = Number(payload.amount) || 0;
    if (payload.date !== undefined) cf.date = payload.date;
    if (payload.note !== undefined) cf.note = payload.note;
    if (payload.method !== undefined) cf.method = payload.method;
    saveMockDb(db);
    return { status: "success", message: "Catatan kas diperbarui." };
  }
  else if (action === "deleteCashflow") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.cashflow = (db.cashflow || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Catatan kas dihapus." };
  }
  else if (action === "getCashflowSummary") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const month = payload.month || new Date().toISOString().slice(0, 7);
    const list = (db.cashflow || []).filter(c => String(c.date).startsWith(month));
    const masuk = list.filter(c => c.type === "masuk").reduce((s, c) => s + c.amount, 0);
    const keluar = list.filter(c => c.type === "keluar").reduce((s, c) => s + c.amount, 0);
    return { status: "success", summary: { masuk, keluar, saldo: masuk - keluar, count: list.length } };
  }
  // ── PENGELUARAN RUTIN ───────────────────────────
  else if (action === "getRecurringExpenses") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    return { status: "success", recurring: (db.recurringExpenses || []).slice().reverse() };
  }
  else if (action === "addRecurringExpense") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    if (!db.recurringExpenses) db.recurringExpenses = [];
    const r = { id: "REC-" + Math.floor(100000 + Math.random() * 900000), name: payload.name || "Pengeluaran rutin", amount: Number(payload.amount) || 0, category: payload.category || "Operasional", frequency: payload.frequency || "Bulanan" };
    db.recurringExpenses.push(r); saveMockDb(db);
    return { status: "success", message: "Pengeluaran rutin '" + r.name + "' ditambahkan." };
  }
  else if (action === "deleteRecurringExpense") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.recurringExpenses = (db.recurringExpenses || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Pengeluaran rutin dihapus." };
  }
  // ── TUGAS ───────────────────────────────────────
  else if (action === "getTasks") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    return { status: "success", tasks: (db.tasks || []).slice().reverse() };
  }
  else if (action === "addTask") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    if (!db.tasks) db.tasks = [];
    const tk = { id: "TSK-" + Math.floor(100000 + Math.random() * 900000), title: payload.title || "Tugas", due_date: payload.due_date || "", done: false, created_at: new Date().toISOString().slice(0, 10) };
    db.tasks.push(tk); saveMockDb(db);
    return { status: "success", message: "Tugas ditambahkan.", task: tk };
  }
  else if (action === "updateTask") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const tk = (db.tasks || []).find(x => x.id === payload.id);
    if (!tk) return { status: "error", message: "Tugas tidak ditemukan." };
    if (payload.done !== undefined) tk.done = !!payload.done;
    if (payload.title !== undefined) tk.title = payload.title;
    saveMockDb(db);
    return { status: "success", message: tk.done ? "Tugas selesai ✅" : "Tugas dibuka kembali." };
  }
  else if (action === "deleteTask") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    db.tasks = (db.tasks || []).filter(x => x.id !== payload.id);
    saveMockDb(db);
    return { status: "success", message: "Tugas dihapus." };
  }
  // ── INSIGHT & DASHBOARD ADMIN ───────────────────
  else if (action === "getInsights") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const sales = db.sales || [];
    const totalIncome = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const totalTx = sales.length;
    const memberCount = (db.users || []).filter(u => u.role === "client").length;
    const avgTx = totalTx ? Math.round(totalIncome / totalTx) : 0;
    const bestPackage = {};
    sales.forEach(s => { bestPackage[s.package_name || "Lainnya"] = (bestPackage[s.package_name || "Lainnya"] || 0) + 1; });
    const topPackage = Object.entries(bestPackage).sort((a, b) => b[1] - a[1])[0];
    const lowStock = (db.stock || []).filter(i => i.min_qty > 0 && Number(i.qty) <= Number(i.min_qty));
    return {
      status: "success",
      insights: {
        totalIncome, totalTx, memberCount, avgTx,
        topPackage: topPackage ? { name: topPackage[0], count: topPackage[1] } : null,
        lowStockCount: lowStock.length,
        walkinCount: sales.filter(s => s.source !== "member").length,
        memberSalesCount: sales.filter(s => s.source === "member").length
      }
    };
  }
  else if (action === "getDashboardAdmin") {
    const roleErr = mockRequireRole(payload, ["staff", "admin"]);
    if (roleErr) return roleErr;
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const sales = db.sales || [];
    const todaySales = sales.filter(s => String(s.date) === today);
    const monthSales = sales.filter(s => String(s.date).startsWith(month));
    const lowStock = (db.stock || []).filter(i => i.min_qty > 0 && Number(i.qty) <= Number(i.min_qty));
    const upcomingBookings = (db.bookings || []).filter(b => b.status === "Terkonfirmasi" && String(b.date) >= today).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 6);
    const pendingBookings = (db.bookings || []).filter(b => b.status === "Menunggu Konfirmasi").length;
    const birthdays = (db.users || []).filter(u => u.birth_date && String(u.birth_date).slice(5) === today.slice(5));
    const tasks = (db.tasks || []).filter(t => !t.done);
    return {
      status: "success",
      data: {
        todayIncome: todaySales.reduce((s, x) => s + (Number(x.total) || 0), 0),
        todayCount: todaySales.length,
        monthIncome: monthSales.reduce((s, x) => s + (Number(x.total) || 0), 0),
        monthCount: monthSales.length,
        memberCount: (db.users || []).filter(u => u.role === "client").length,
        pendingBookings, lowStockCount: lowStock.length,
        lowStock, upcomingBookings, birthdays, tasks,
        cashflow: db.cashflow || []
      }
    };
  }

  return { status: "error", message: "Mock action tidak dikenali" };
}

// ============================================================================
// 3. AUTENTIKASI & KEAMANAN
// ============================================================================

// Cegah form dikirim berkali-kali kalau tombol submit-nya dipencet berulang
// sebelum request sebelumnya selesai (mencegah duplikat seperti pendaftaran
// dobel akibat klik cepat berkali-kali).
function guardFormSubmit(form, handler) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    const originalText = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Memproses..."; }
    try {
      await handler(e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });
}

async function loginUserWithRole(emailPhone, password, requiredRole, redirectUrl) {
  if (!emailPhone || !password) { showToast("Silakan isi nomor HP/Email dan kata sandi!", "error"); return false; }
  const res = await sendGasRequest("login", { email_phone: emailPhone, password });
  if (res && res.status === "success") {
    if (res.user.role !== requiredRole && requiredRole !== "any") {
      showToast(`Akses Ditolak: Akun Anda adalah [${res.user.role.toUpperCase()}]`, "error");
      return false;
    }
    if (requiredRole === "staff") { currentStaffAccount = res.user; localStorage.setItem("REREPHOTO_ACTIVE_STAFF", JSON.stringify(res.user)); }
    else { currentUser = res.user; localStorage.setItem("REREPHOTO_USER", JSON.stringify(res.user)); }
    showToast(`Selamat datang di Rere Photo, ${res.user.name}!`, "success");
    setTimeout(() => { if (redirectUrl) window.location.href = redirectUrl; else window.location.reload(); }, 800);
    return true;
  }
  showToast(res ? res.message : "Login gagal!", "error");
  return false;
}

async function registerUser(name, email, phone, password, redirectUrl) {
  if (!name || !phone || !password) { showToast("Nama, nomor HP, dan kata sandi wajib diisi!", "error"); return false; }
  const res = await sendGasRequest("register", { name, email: email || "", phone, password });
  if (res && res.status === "success") {
    currentUser = res.user;
    localStorage.setItem("REREPHOTO_USER", JSON.stringify(currentUser));
    showToast(`Pendaftaran Berhasil! ID Anda: ${currentUser.id}`, "success");
    setTimeout(() => window.location.href = (redirectUrl || "client.html"), 1000);
    return true;
  }
  showToast(res ? res.message : "Gagal mendaftar!", "error");
  return false;
}

async function updateUserProfile(name, email, password, avatarBase64) {
  if (!currentUser) return false;
  const payload = { id: currentUser.id };
  if (name !== undefined) payload.name = name;
  if (email !== undefined) payload.email = email;
  if (password && password !== "") payload.password = password;
  if (avatarBase64 !== undefined) payload.avatar_url = avatarBase64;
  
  const res = await sendGasRequest("updateProfile", payload);
  if (res && res.status === "success") {
    currentUser = res.user;
    localStorage.setItem("REREPHOTO_USER", JSON.stringify(currentUser));
    showToast("Profil berhasil diperbarui!", "success");
    return true;
  }
  showToast(res ? res.message : "Gagal memperbarui profil!", "error");
  return false;
}

function logoutUser(redirectBackUrl = "index.html") {
  currentUser = null;
  currentStaffAccount = null;
  localStorage.removeItem("REREPHOTO_USER");
  localStorage.removeItem("REREPHOTO_ACTIVE_STAFF");
  showToast("Anda telah keluar dari Rere Photo.", "info");
  setTimeout(() => { if (redirectBackUrl) window.location.href = redirectBackUrl; else window.location.reload(); }, 600);
}

function enforceRoleSecurity(expectedRole, loginPageUrl) {
  const user = expectedRole === "staff" ? JSON.parse(localStorage.getItem("REREPHOTO_ACTIVE_STAFF")) : JSON.parse(localStorage.getItem("REREPHOTO_USER"));
  if (!user || user.role !== expectedRole) {
    showToast("Silakan login terlebih dahulu.", "error");
    setTimeout(() => window.location.href = loginPageUrl, 800);
    return null;
  }
  return user;
}

// ============================================================================
// 4. MANAJEMEN STAF, PAKET & SETTINGS
// ============================================================================

async function fetchStaffList(targetSelectId = "staff-login-select", autoSelectId = null) {
  const res = await sendGasRequest("getStaffList", {}, "GET");
  if (res && res.status === "success" && res.staffList) {
    cachedStaffList = res.staffList;
    localStorage.setItem("REREPHOTO_STAFF_CACHE", JSON.stringify(cachedStaffList));
    populateStaffDropdown(targetSelectId, res.staffList, autoSelectId);
  } else if (cachedStaffList.length > 0) {
    populateStaffDropdown(targetSelectId, cachedStaffList, autoSelectId);
  }
}

function populateStaffDropdown(selectId, staffList, selectedVal = null) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">-- Pilih Staf --</option>` + staffList.map(s => `<option value="${escapeHtml(s.staff_id)}" ${selectedVal === s.staff_id ? 'selected' : ''}>${escapeHtml(s.name)} [${escapeHtml(s.shift)}]</option>`).join("");
}

async function addNewStaff(name, shift) {
  if (!name || !shift) { showToast("Nama staf dan shift wajib diisi!", "error"); return false; }
  const res = await sendGasRequest("addStaff", { name, shift });
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchAdminStats(); return true; }
  showToast(res ? res.message : "Gagal menambah staf!", "error");
  return false;
}

async function removeStaff(staffId) {
  if (!confirm("Hapus staf ini dari sistem?")) return;
  const res = await sendGasRequest("deleteStaff", { staff_id: staffId });
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchAdminStats(); return true; }
  showToast(res ? res.message : "Gagal menghapus staf!", "error");
  return false;
}

async function resetMemberPasswordAction(memberId, memberName) {
  if (!confirm(`Reset password member "${memberName}"?\n\nMember ini akan diminta membuat password baru saat login berikutnya (masukkan password apa saja, dan itu akan jadi password barunya).`)) return;
  const res = await sendGasRequest("resetMemberPassword", { id: memberId });
  if (res && res.status === "success") { showToast(res.message, "success"); return true; }
  showToast(res ? res.message : "Gagal mereset password member!", "error");
  return false;
}

async function saveMemberEdit(id, name, email, points, tier, newPassword) {
  const payload = { id, name, email, points, tier };
  if (newPassword) payload.new_password = newPassword;
  const res = await sendGasRequest("updateMember", payload);
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchAdminStats(); return true; }
  showToast(res ? res.message : "Gagal mengubah data member!", "error");
  return false;
}

async function resetStaffPasswordAction(staffId, staffName) {
  if (!confirm(`Reset password staf "${staffName}"?\n\nStaf ini akan diminta membuat password baru saat login berikutnya (masukkan password apa saja, dan itu akan jadi password barunya).`)) return;
  const res = await sendGasRequest("resetStaffPassword", { staff_id: staffId });
  if (res && res.status === "success") { showToast(res.message, "success"); return true; }
  showToast(res ? res.message : "Gagal mereset password staf!", "error");
  return false;
}

async function addNewPackage(payload) {
  if (!payload.name || !payload.price || payload.points === "") { showToast("Nama, harga, dan poin wajib diisi!", "error"); return false; }
  const res = await sendGasRequest("addPackage", payload);
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchAdminStats(); return true; }
  showToast(res ? res.message : "Gagal menambah paket!", "error");
  return false;
}

async function updatePackage(package_id, payload) {
  const res = await sendGasRequest("updatePackage", { package_id, ...payload });
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchAdminStats(); return true; }
  showToast(res ? res.message : "Gagal memperbarui paket!", "error");
  return false;
}

async function removePackage(packageId) {
  if (!confirm("Hapus paket ini?")) return;
  const res = await sendGasRequest("deletePackage", { package_id: packageId });
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchAdminStats(); return true; }
  showToast(res ? res.message : "Gagal menghapus paket!", "error");
  return false;
}

async function fetchSettings() {
  const res = await sendGasRequest("getSettings", {}, "GET");
  if (res && res.status === "success" && res.settings) {
    appSettings = res.settings;
    localStorage.setItem("REREPHOTO_SETTINGS", JSON.stringify(appSettings));
  }
}

async function updateSetting(key, value) {
  const res = await sendGasRequest("updateSetting", { key, value });
  if (res && res.status === "success") {
    appSettings[key] = value;
    localStorage.setItem("REREPHOTO_SETTINGS", JSON.stringify(appSettings));
    showToast(res.message, "success");
    return true;
  }
  showToast(res ? res.message : "Gagal memperbarui pengaturan!", "error");
  return false;
}

// ============================================================================
// BOOKING SESI FOTO (frontend helpers)
// ============================================================================
async function createBookingRequest(payload) {
  return sendGasRequest("createBooking", payload);
}

async function fetchClientBookings() {
  if (!currentUser) return [];
  const res = await sendGasRequest("getBookings", { member_id: currentUser.id }, "GET");
  return (res && res.status === "success") ? (res.bookings || []) : [];
}

async function fetchAllBookings(status) {
  const payload = status ? { status } : {};
  const res = await sendGasRequest("getBookings", payload, "GET");
  return (res && res.status === "success") ? (res.bookings || []) : [];
}

async function updateBookingStatusAction(bookingId, status, staffName) {
  return sendGasRequest("updateBookingStatus", { booking_id: bookingId, status, staff_name: staffName || "" });
}

async function cancelBookingAction(bookingId) {
  if (!currentUser) return { status: "error", message: "Belum login." };
  return sendGasRequest("cancelBooking", { booking_id: bookingId, member_id: currentUser.id });
}

function bookingStatusBadge(status) {
  const map = {
    "Menunggu Konfirmasi": "background:#fff8e1;color:#92400e;border:1px solid #feb702;",
    "Terkonfirmasi":       "background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;",
    "Selesai":             "background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;",
    "Dibatalkan":          "background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;"
  };
  return `<span style="display:inline-block;font-size:.62rem;font-weight:800;padding:.2rem .6rem;border-radius:999px;${map[status] || map["Menunggu Konfirmasi"]}">${escapeHtml(status)}</span>`;
}

function bookingDateTimeLabel(b) {
  const date = b && b.date ? String(b.date) : "";
  const time = b && b.time ? String(b.time) : "";
  let label = date;
  if (date.length === 10) {
    try {
      const d = new Date(date + "T00:00:00");
      label = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch (e) { /* pakai teks mentah */ }
  }
  return label + (time ? " · " + time + " WIB" : "");
}

// ============================================================================
// KASIR & KEUANGAN (frontend helpers)
// ============================================================================
function fmtIDR(n) { return "Rp " + Number(n || 0).toLocaleString("id-ID"); }

async function createSaleRequest(payload) {
  const staff = currentStaffAccount || JSON.parse(localStorage.getItem("REREPHOTO_ACTIVE_STAFF") || "null") || {};
  const admin = currentUser || JSON.parse(localStorage.getItem("REREPHOTO_USER") || "null") || {};
  if (staff && staff.role === "staff") { payload.kasir_id = staff.id; payload.kasir_name = staff.name; }
  else if (admin && admin.role === "admin") { payload.kasir_id = admin.id || "AD-001"; payload.kasir_name = "Owner"; }
  return sendGasRequest("createSale", payload);
}

async function fetchSales(params) {
  const res = await sendGasRequest("getSales", params || {}, "GET");
  return (res && res.status === "success") ? (res.sales || []) : [];
}

async function fetchFinanceSummary(params) {
  const res = await sendGasRequest("getFinanceSummary", params || {}, "GET");
  return (res && res.status === "success") ? res : null;
}

function downloadCSV(filename, rows) {
  if (!rows || !rows.length) { showToast("Tidak ada data untuk diekspor.", "error"); return; }
  const csv = rows.map(r => r.map(c => {
    const s = String(c === undefined || c === null ? "" : c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("File CSV berhasil diunduh. 📄", "success");
}

async function fetchPackages(targetSelectId = null, autoSelectId = null) {
  const res = await sendGasRequest("getPackages", {}, "GET");
  if (res && res.status === "success" && res.packages) {
    cachedPackages = res.packages;
    localStorage.setItem("REREPHOTO_PACKAGES_CACHE", JSON.stringify(cachedPackages));
    if (targetSelectId) populatePackageDropdown(targetSelectId, res.packages, autoSelectId);
  } else if (cachedPackages.length > 0 && targetSelectId) {
    populatePackageDropdown(targetSelectId, cachedPackages, autoSelectId);
  }
}

function populatePackageDropdown(selectId, packages, selectedVal = null) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">-- Pilih Paket --</option>` + packages.filter(p => p.status === "Aktif").map(p => {
    const tipe = p.price_type === "per_orang" ? "/org" : " flat";
    const label = `${escapeHtml(p.name)} — Rp ${Number(p.price).toLocaleString('id-ID')}${tipe} (+${p.points} Pts)`;
    return `<option value="${escapeHtml(p.package_id)}"
      data-price="${p.price}"
      data-points="${p.points}"
      data-price-type="${escapeHtml(p.price_type || 'flat')}"
      data-min-person="${p.min_person || 1}"
      data-max-person="${p.max_person || 99}"
      data-extra-person="${p.extra_person_price || 0}"
      data-free-print="${p.free_print || 1}"
      data-extra-print="${p.extra_print_price || 0}"
      data-desc="${escapeHtml(p.description || '')}"
      ${selectedVal === p.package_id ? 'selected' : ''}>
      ${label}
    </option>`;
  }).join("");
}

async function addPhotoTransaction(memberId, pointsToAdd, packageName, gdriveUrl, coverUrl, photos) {
  if (!memberId || !gdriveUrl) { showToast("Nomor HP Member dan Link Folder Foto wajib diisi!", "error"); return false; }
  const res = await sendGasRequest("addTransaction", {
    member_id: memberId, points_to_add: pointsToAdd, package_name: packageName,
    gdrive_url: gdriveUrl, cover_url: coverUrl || "",
    photos: Array.isArray(photos) ? photos : [],
    staff_id: currentStaffAccount ? currentStaffAccount.id : "ST-001",
    staff_name: currentStaffAccount ? `${currentStaffAccount.name} (${currentStaffAccount.shift})` : "Staf Rere Photo"
  });
  if (res && res.status === "success") { showToast(res.message, "success"); await fetchDashboardData("staff", currentStaffAccount ? currentStaffAccount.id : "ST-001"); return true; }
  showToast(res ? res.message : "Gagal mengirim delivery foto!", "error");
  return false;
}


async function fetchDashboardData(role, id) {
  const res = await sendGasRequest("getDashboardData", { role, id }, "GET");
  if (res && res.status === "success") {
    if (role === "client") renderClientDashboard(res.userInfo || currentUser, res.transactions);
    else if (role === "staff") renderStaffDashboard(res.transactions);
  }
}

async function fetchAdminStats() {
  const res = await sendGasRequest("getAdminStats", {}, "GET");
  if (res && res.status === "success") renderAdminDashboard(res);
}

// ============================================================================
// 5. RENDERING

// Update cepat elemen UI member (poin, tier, badge, progress) tanpa render ulang penuh.
// Dipakai setelah aksi yang mengubah poin (mis. tukar reward).
function updateClientUI(user) {
  if (!user) return;
  if (document.getElementById("client-points-display")) document.getElementById("client-points-display").textContent = (user.points || 0) + " Pts";
  if (document.getElementById("client-tier-display")) document.getElementById("client-tier-display").textContent = user.tier || "Silver";
  if (document.getElementById("client-reward-target-badge")) document.getElementById("client-reward-target-badge").textContent = (user.points || 0) + " Poin · " + (user.tier || "Silver");

  var tGold = Number(appSettings.tier_gold || 50);
  var tPlat = Number(appSettings.tier_platinum || 100);
  var tDiam = Number(appSettings.tier_diamond || 200);
  var order = ["Silver", "Gold \u{1F31F}", "Platinum \u{1F451}", "Diamond \u{1F48E}"];
  var pts = Number(user.points) || 0;
  var cur = order.indexOf(user.tier);
  if (cur === -1) cur = 0;
  var next = order[Math.min(cur + 1, order.length - 1)];
  var nextPts = next === "Gold \u{1F31F}" ? tGold : next === "Platinum \u{1F451}" ? tPlat : tDiam;
  var curPts = user.tier === "Gold \u{1F31F}" ? tGold : user.tier === "Platinum \u{1F451}" ? tPlat : user.tier === "Diamond \u{1F48E}" ? tDiam : 0;
  var pct = cur >= order.length - 1 ? 100 : Math.min(100, Math.round((pts - curPts) / (nextPts - curPts) * 100));
  var remain = Math.max(0, nextPts - pts);
  if (document.getElementById("client-reward-progress")) document.getElementById("client-reward-progress").style.width = pct + "%";
  if (document.getElementById("client-progress-text")) {
    document.getElementById("client-progress-text").textContent = cur >= order.length - 1
      ? "\u{1F3C6} Diamond Member! Tier Tertinggi!"
      : remain + " Poin lagi menuju " + next;
  }
}


// ============================================================================

function renderClientDashboard(user, transactions) {
  if (!user) return;
  if (currentUser && currentUser.id === user.id) {
    currentUser.points = user.points;
    currentUser.tier = user.tier;
    currentUser.avatar_url = user.avatar_url || currentUser.avatar_url;
    localStorage.setItem("REREPHOTO_USER", JSON.stringify(currentUser));
  }

  // Avatar
  const avatarEl = document.getElementById("client-avatar-display");
  if (avatarEl) avatarEl.src = user.avatar_url || "";
  const avatarFallback = document.getElementById("client-avatar-fallback");
  if (avatarFallback) avatarFallback.textContent = (user.name || "U").charAt(0).toUpperCase();

  if (document.getElementById("client-name-display")) document.getElementById("client-name-display").textContent = user.name;
  if (document.getElementById("client-id-display")) document.getElementById("client-id-display").textContent = user.id;
  if (document.getElementById("client-points-display")) document.getElementById("client-points-display").textContent = `${user.points} Pts`;
  if (document.getElementById("client-tier-display")) document.getElementById("client-tier-display").textContent = user.tier;

  // Update poin & tier di badge
  if (document.getElementById("client-reward-target-badge")) {
    document.getElementById("client-reward-target-badge").textContent = `${user.points} Poin · ${user.tier}`;
  }

  // Progress bar — pakai batas tier dari settings (bisa diubah owner)
  const tGold     = Number(appSettings.tier_gold || 50);
  const tPlatinum = Number(appSettings.tier_platinum || 100);
  const tDiamond  = Number(appSettings.tier_diamond || 200);
  const tierMap   = { "Silver": 0, "Gold 🌟": tGold, "Platinum 👑": tPlatinum, "Diamond 💎": tDiamond };
  const tierOrder = ["Silver", "Gold 🌟", "Platinum 👑", "Diamond 💎"];
  const current   = Number(user.points) || 0;
  const curIdx    = tierOrder.findIndex(t => t === user.tier);
  const nextTier  = tierOrder[Math.min(curIdx + 1, tierOrder.length - 1)];
  const nextPts   = tierMap[nextTier] || tDiamond;
  const curPts    = tierMap[user.tier] || 0;
  const pct       = curIdx >= tierOrder.length - 1 ? 100 : Math.min(100, Math.round((current - curPts) / (nextPts - curPts) * 100));
  const remaining = Math.max(0, nextPts - current);

  if (document.getElementById("client-reward-progress"))
    document.getElementById("client-reward-progress").style.width = `${pct}%`;
  if (document.getElementById("client-progress-text"))
    document.getElementById("client-progress-text").textContent =
      curIdx >= tierOrder.length - 1 ? `🏆 Diamond Member! Tier Tertinggi!` : `${remaining} Poin lagi menuju ${nextTier}`;

  const qrContainer = document.getElementById("client-qrcode");
  if (qrContainer) {
    qrContainer.innerHTML = "";
    if (typeof QRCode !== "undefined") {
      new QRCode(qrContainer, { text: user.id, width: 150, height: 150, colorDark: "#1E293B", colorLight: "#FFFFFF", correctLevel: QRCode.CorrectLevel.H });
    } else {
      qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(user.id)}" alt="QR Code ${user.id}" class="mx-auto rounded-xl shadow" />`;
    }
  }

  if (document.getElementById("client-barcode") && typeof JsBarcode !== "undefined") {
    JsBarcode("#client-barcode", user.id, { format: "CODE128", lineColor: "#1E293B", width: 2, height: 40, displayValue: false });
  }

  const galleryContainer = document.getElementById("client-photo-gallery");
  const emptyState = document.getElementById("client-empty-gallery");
  if (galleryContainer) {
    if (transactions && transactions.length > 0) {
      galleryContainer.innerHTML = transactions.map(t => `
        <div class="group cursor-pointer" onclick="window.open('${escapeHtml(safeUrl(t.gdrive_url || '')).replace(/'/g, "&#39;")}','_blank','noopener')">
          <div class="photo-stack">
            ${generateSessionPhotos(t)}
            <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 z-10 rounded-b-2xl">
              <p class="text-white font-bold text-xs truncate">${escapeHtml(t.package_name)}</p>
              <p class="text-white/80 text-[10px] truncate">${escapeHtml(t.timestamp.split(' ')[0])}</p>
            </div>
          </div>
          <div style="height:.4rem;"></div>
        </div>
      `).join("");
      if (emptyState) emptyState.classList.add("hidden");
    } else {
      galleryContainer.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
    }
  }
}

// Thumbnail galeri member: pakai FOTO ASLI sesi kalau staf melampirkan
// (photos / cover_url). Kalau belum ada, tampilkan cover desain branded Rere
// Photo — bukan foto random dari internet.
const RERE_GALLERY_FALLBACK_SVG =
  "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'>" +
    "<rect width='400' height='400' fill='#3a5c37'/>" +
    "<g transform='translate(200,185) scale(3.4)' fill='none' stroke='#ffffff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'/><circle cx='12' cy='13' r='4'/></g>" +
    "<text x='200' y='270' text-anchor='middle' fill='#ffffff' opacity='0.85' font-family='Arial' font-size='22' font-weight='bold' letter-spacing='6'>RERE PHOTO</text>" +
    "</svg>");

// Ubah link file Google Drive (file/d/... , uc?id=..., open?id=...) jadi URL
// thumbnail yang BISA ditampilkan browser (tanpa perlu izin download).
// Link folder tidak bisa → dikembalikan kosong (pakai cover branded).
function driveThumbnail(url) {
  if (!url) return "";
  const s = String(url).trim();
  const m = s.match(/\/file\/d\/([^/?#]+)/) || s.match(/[?&]id=([^&]+)/);
  if (m) return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(m[1]) + "&sz=w500";
  return "";
}

// Thumbnail galeri member: KOTAK POLOS satu foto. Menampilkan FOTO ASLI sesi
// kalau staf melampirkan (upload/link); kalau tidak ada, tampil cover desain
// branded Rere Photo — bukan foto random dari internet.
function generateSessionPhotos(t) {
  const urls = [];
  if (t && Array.isArray(t.photos) && t.photos.length) urls.push(t.photos[0]);
  else if (t && t.cover_url) urls.push(t.cover_url);
  // Konversi link Drive → thumbnail yang bisa ditampilkan; link lain dipakai apa adanya
  const viewable = urls.map(function (u) { return driveThumbnail(u) || safeImageUrl(u); }).filter(Boolean);
  if (!viewable.length) {
    return `<img class="layer" src="${RERE_GALLERY_FALLBACK_SVG}" alt="Sesi Rere Photo">`;
  }
  return `<img class="layer" src="${viewable[0]}" alt="Foto sesi" onerror="this.onerror=null;this.src=RERE_GALLERY_FALLBACK_SVG;">`;
}

function renderStaffDashboard(transactions) {
  if (document.getElementById("staff-active-name") && currentStaffAccount) {
    document.getElementById("staff-active-name").textContent = `${currentStaffAccount.name} [${currentStaffAccount.shift}]`;
  }
  const tbody = document.getElementById("staff-transactions-table");
  if (tbody) {
    tbody.innerHTML = transactions && transactions.length > 0 ? transactions.map(t => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm">
        <td class="py-3 px-4 font-mono text-xs text-slate-500">${escapeHtml(t.trx_id)}<br/><span class="text-[10px] text-slate-400">${escapeHtml((t.timestamp || '').split(' ')[1] || '')}</span></td>
        <td class="py-3 px-4 font-bold text-indigo-600 font-mono">${escapeHtml(t.member_id)}</td>
        <td class="py-3 px-4 font-medium text-slate-800">${escapeHtml(t.member_name)}</td>
        <td class="py-3 px-4 text-slate-600">${escapeHtml(t.package_name)}</td>
        <td class="py-3 px-4 text-center"><span class="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-xs font-bold">+${Number(t.points_added) || 0} Pts</span></td>
        <td class="py-3 px-4 text-right"><a href="${safeUrl(t.gdrive_url)}" target="_blank" rel="noopener" class="text-xs font-bold text-indigo-600 hover:underline">📁 Folder Foto</a></td>
      </tr>
    `).join("") : `<tr><td colspan="6" class="text-center py-8 text-slate-400">Belum ada input transaksi delivery.</td></tr>`;
  }
  if (document.getElementById("staff-today-count")) document.getElementById("staff-today-count").textContent = transactions ? transactions.length : 0;
}


function renderAdminDashboard(res) {
  const { stats, recentTransactions, staffList, packagesList, membersList, sheetUrl } = res;

  if (document.getElementById("stat-total-members")) document.getElementById("stat-total-members").textContent = stats.totalMembers;
  if (document.getElementById("stat-total-visits")) document.getElementById("stat-total-visits").textContent = stats.totalTransactions;
  if (document.getElementById("stat-total-points")) document.getElementById("stat-total-points").textContent = `${stats.totalPointsIssued} Pts`;
  if (document.getElementById("stat-est-revenue")) document.getElementById("stat-est-revenue").textContent = `Rp ${Number(stats.estRevenue || 0).toLocaleString("id-ID")}`;
  if (document.getElementById("admin-sheet-link") && sheetUrl) document.getElementById("admin-sheet-link").href = sheetUrl;

  // Statistik paket terpopuler & trafik (panggil fungsi di akses-owner.html)
  if (typeof renderPopularPackages === "function" && recentTransactions) renderPopularPackages(recentTransactions);
  if (typeof renderTraffic === "function" && recentTransactions) renderTraffic(recentTransactions);
  if (typeof renderStaffPerformanceChart === "function" && staffList) renderStaffPerformanceChart(staffList);

  // Staff table
  const staffTbody = document.getElementById("admin-staff-table");
  if (staffTbody && staffList) {
    staffTbody.innerHTML = staffList.map(s => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-sm">
        <td class="py-3 px-4 font-mono font-bold text-purple-700">${escapeHtml(s.staff_id)}</td>
        <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(s.name)}</td>
        <td class="py-3 px-4 text-xs text-slate-600">${escapeHtml(s.shift)}</td>
        <td class="py-3 px-4 text-center font-bold text-base text-slate-800">${Number(s.total_handled) || 0} <span class="text-xs font-normal text-slate-400">sesi</span></td>
        <td class="py-3 px-4 text-right" style="white-space:nowrap;">
          <button onclick="resetStaffPasswordAction('${escapeHtml(s.staff_id).replace(/'/g, "\\'")}','${escapeHtml(s.name).replace(/'/g, "\\'")}')" class="bg-[#edf5ed] hover:bg-[#d4e8d4] text-[#3a5c37] text-xs font-bold px-2.5 py-1 rounded-lg transition mr-1">🔑 Reset Password</button>
          <button onclick="removeStaff('${escapeHtml(s.staff_id).replace(/'/g, "\\'")}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-lg transition">🗑️ Hapus</button>
        </td>
      </tr>
    `).join("");
  }

  // Packages table
  const pkgTbody = document.getElementById("admin-packages-table");
  if (pkgTbody && packagesList) {
    pkgTbody.innerHTML = packagesList.length ? packagesList.map(p => {
      const tipe = p.price_type === "per_orang" ? "Per Org" : "Flat";
      const orang = `${p.min_person || 1}–${p.max_person >= 99 ? '∞' : p.max_person}`;
      const ekstraOrg = p.extra_person_price > 0 ? `+Rp${Number(p.extra_person_price).toLocaleString('id-ID')}/org` : '-';
      const cetakInfo = `${p.free_print || 1} gratis${p.extra_print_price > 0 ? ` · +Rp${Number(p.extra_print_price).toLocaleString('id-ID')}` : ''}`;
      const pkgIdSafe = escapeHtml(p.package_id).replace(/'/g, "\\'");
      return `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs" data-pkg-id="${escapeHtml(p.package_id)}">
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-800">${escapeHtml(p.name)}</div>
          <div class="text-slate-400 text-[10px]">${escapeHtml(p.description || '')}</div>
          ${p.photo_url ? `<div class="text-[9px] text-[#3a5c37]">📷 Ada foto</div>` : ''}
        </td>
        <td class="py-2.5 px-3 font-bold text-[#df4d00]">Rp${Number(p.price).toLocaleString('id-ID')}</td>
        <td class="py-2.5 px-3">
          <span class="bg-slate-100 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded">${escapeHtml(tipe)}</span>
        </td>
        <td class="py-2.5 px-3 text-center">
          <div class="font-bold">${escapeHtml(orang)} org</div>
          <div class="text-slate-400 text-[9px]">${escapeHtml(ekstraOrg)}</div>
        </td>
        <td class="py-2.5 px-3 text-center">
          <div class="font-bold">${escapeHtml(cetakInfo)}</div>
        </td>
        <td class="py-2.5 px-3 text-center font-bold text-[#3a5c37]">${Number(p.points) || 0}</td>
        <td class="py-2.5 px-3 text-right" style="white-space:nowrap;">
          <button onclick="editPackageModal('${pkgIdSafe}')" class="bg-[#edf5ed] hover:bg-[#d4e8d4] text-[#3a5c37] text-[10px] font-bold px-2 py-1 rounded-lg transition mr-1">Edit</button>
          <button onclick="removePackage('${pkgIdSafe}')" class="bg-[#fff0e8] hover:bg-[#ffb899] text-[#df4d00] text-[10px] font-bold px-2 py-1 rounded-lg transition">Hapus</button>
        </td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="text-center py-6 text-slate-400 text-xs">Belum ada paket.</td></tr>`;
  }

  // Members table
  const memberTbody = document.getElementById("admin-members-table");
  if (memberTbody && membersList) {
    memberTbody.innerHTML = membersList.map(m => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-sm">
        <td class="py-2.5 px-4 font-mono text-xs text-[#3a5c37] font-bold">${escapeHtml(m.id)}</td>
        <td class="py-2.5 px-4 font-medium text-slate-800">${escapeHtml(m.name)}</td>
        <td class="py-2.5 px-4 text-xs text-slate-500">${escapeHtml(m.email || m.email_phone || "-")}</td>
        <td class="py-2.5 px-4 font-bold text-slate-700">${Number(m.points) || 0} Pts</td>
        <td class="py-2.5 px-4"><span class="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">${escapeHtml(m.tier)}</span></td>
        <td class="py-2.5 px-4 text-right" style="white-space:nowrap;">
          <button onclick="openMemberCardModal('${escapeHtml(m.id).replace(/'/g, "\\'")}')" title="Lihat Kartu Member" class="bg-[#fff8e1] hover:bg-[#ffe9a8] text-[#92400e] text-[10px] font-bold px-2 py-1 rounded-lg transition mr-1 cursor-pointer">🪪</button>
          <button onclick="editMemberModal('${escapeHtml(m.id).replace(/'/g, "\\'")}')" class="bg-[#edf5ed] hover:bg-[#d4e8d4] text-[#3a5c37] text-[10px] font-bold px-2 py-1 rounded-lg transition mr-1">Edit</button>
          <button onclick="resetMemberPasswordAction('${escapeHtml(m.id).replace(/'/g, "\\'")}','${escapeHtml(m.name).replace(/'/g, "\\'")}')" class="bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-lg transition">🔑 Reset Sandi</button>
        </td>
      </tr>
    `).join("");
  }

  // Chart sudah digambar oleh renderStaffPerformanceChart() di akses-owner.html
  // (dipanggil di atas). Jangan buat chart kedua di canvas yang sama —
  // akan memicu error Chart.js "Canvas is already in use".
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const bgColors = { success: "bg-emerald-600 text-white", error: "bg-rose-600 text-white", info: "bg-indigo-600 text-white" };
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const el = document.createElement("div");
  el.className = `${bgColors[type] || bgColors.info} px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 transform transition-all duration-300 translate-y-2 opacity-0 text-sm font-medium z-50`;
  el.innerHTML = `<span class="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center font-bold shrink-0">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.remove("translate-y-2", "opacity-0"));
  setTimeout(() => { el.classList.add("translate-y-2", "opacity-0"); setTimeout(() => el.remove(), 300); }, 3500);
}

function showLoadingSpinner(show = true) {
  const spinner = document.getElementById("global-spinner");
  if (spinner) {
    if (show) spinner.classList.remove("hidden");
    else spinner.classList.add("hidden");
  }
}
