/* ═══════════════════════════════════════════════════════════
   RERE PHOTO — Mesin Tampilan (UI/UX)
   Pilihan warna tema, font, dan bentuk kartu — DIATUR KHUSUS
   oleh Owner via Dashboard (tab 🎨 Tampilan di akses-owner.html).
   File ini (di semua halaman) hanya MENERAPKAN pilihan yang
   tersimpan; tidak ada tombol melayang untuk pengunjung.
   Default = tampilan bawaan Rere Photo (tidak mengubah apa pun
   sampai owner memilih).
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var STORE_KEY = "REREPHOTO_UI";

  // ── OPSI WARNA TEMA ────────────────────────────────────────
  var THEMES = {
    hijau: { label: "Hijau Krem", primary: "#3a5c37", dark: "#2d4a2c", accent: "#feb702", accentDark: "#e0a000", orange: "#df4d00", footer: "#1a2e1a", bg: "#f1eedb", swatch: "#3a5c37", desc: "Identitas asli Rere Photo" },
    navy:  { label: "Biru Navy",  primary: "#1e3a5f", dark: "#162c49", accent: "#f0a500", accentDark: "#c98a00", orange: "#df4d00", footer: "#0f2742", bg: "#eef2f7", swatch: "#1e3a5f", desc: "Kesan profesional & elegan" },
    ungu:  { label: "Ungu Mewah", primary: "#5b3a8e", dark: "#472d70", accent: "#f0c93d", accentDark: "#cfa92a", orange: "#df4d00", footer: "#2c1a4d", bg: "#f4eff9", swatch: "#5b3a8e", desc: "Kesan kreatif & kekinian" },
    rose:  { label: "Merah Rose", primary: "#9c2f4e", dark: "#7c2440", accent: "#f5b301", accentDark: "#d69a00", orange: "#df4d00", footer: "#3a1020", bg: "#faf0f2", swatch: "#9c2f4e", desc: "Cantik & hangat" },
    emas:  { label: "Hitam Emas", primary: "#b8860b", dark: "#8f6a12", accent: "#f5c542", accentDark: "#d9a92c", orange: "#e08a00", footer: "#141414", bg: "#faf6ea", swatch: "#b8860b", desc: "Mewah & premium" }
  };

  // ── OPSI FONT ──────────────────────────────────────────────
  var FONTS = {
    montserrat: { label: "Montserrat", family: "Montserrat", url: "" },
    jakarta:    { label: "Plus Jakarta", family: "Plus Jakarta Sans", url: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" },
    poppins:    { label: "Poppins", family: "Poppins", url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap" },
    inter:      { label: "Inter", family: "Inter", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" }
  };

  // ── OPSI BENTUK KARTU ──────────────────────────────────────
  var RADII = {
    rounded: { label: "Rounded", val: "1.5rem" },
    medium:  { label: "Medium", val: ".9rem" },
    kotak:   { label: "Kotak", val: ".3rem" }
  };

  var DEFAULT = { theme: "hijau", font: "montserrat", radius: "rounded" };

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (s && THEMES[s.theme] && FONTS[s.font] && RADII[s.radius]) return s;
    } catch (e) {}
    return { theme: DEFAULT.theme, font: DEFAULT.font, radius: DEFAULT.radius };
  }
  function saveState(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

  function isDefault(s) { return s.theme === "hijau" && s.font === "montserrat" && s.radius === "rounded"; }

  // ── Buat CSS override berdasarkan pilihan ──────────────────
  function buildCss(s) {
    var t = THEMES[s.theme];
    var css = "";
    css += ":root{--rp-accent:" + t.accent + ";--rp-primary:" + t.primary + ";}\n";
    if (isDefault(s)) return css; // bawaan: tidak ada yang diubah

    css += "body{background-color:" + t.bg + "!important;}\n";
    css += "header{background-color:" + t.primary + "!important;border-bottom-color:" + t.dark + "!important;}\n";
    css += "footer{background-color:" + t.footer + "!important;}\n";
    css += '[style*="background:#3a5c37"]{background-color:' + t.primary + '!important;}\n';
    css += '[style*="background:#2d4a2c"]{background-color:' + t.dark + '!important;}\n';
    css += '[style*="background:#feb702"]{background-color:' + t.accent + '!important;}\n';
    css += '[style*="background:#e0a000"]{background-color:' + t.accentDark + '!important;}\n';
    css += '[style*="background:#df4d00"]{background-color:' + t.orange + '!important;}\n';
    css += '[style*="background:#1a2e1a"]{background-color:' + t.footer + '!important;}\n';
    css += '[style*="color:#3a5c37"]{color:' + t.primary + '!important;}\n';
    css += '[style*="color:#feb702"]{color:' + t.accent + '!important;}\n';
    css += '[style*="color:#df4d00"]{color:' + t.orange + '!important;}\n';
    css += '[style*="border:3px solid #3a5c37"],' +
           '[style*="border:1px solid #3a5c37"],' +
           '[style*="border-color:#3a5c37"]{border-color:' + t.primary + '!important;}\n';
    css += '[style*="box-shadow:3px 3px 0 #3a5c37"]{box-shadow:3px 3px 0 ' + t.primary + '!important;}\n';
    css += '[style*="box-shadow:3px 3px 0 #e0a000"]{box-shadow:3px 3px 0 ' + t.accentDark + '!important;}\n';

    if (s.font !== "montserrat") {
      css += "body,h1,h2,h3,h4,h5,h6,p,a,button,input,select,textarea,label,li,td,th{font-family:'" + FONTS[s.font].family + "',sans-serif!important;}\n";
      css += ".font-display{font-family:'" + FONTS[s.font].family + "',sans-serif!important;font-weight:900!important;}\n";
    }
    if (s.radius !== "rounded") {
      css += "#pkg-carousel-track>div,#pkg-carousel-track>div a{border-radius:" + RADII[s.radius].val + "!important;}\n";
    }
    return css;
  }

  // ── Terapkan pilihan ───────────────────────────────────────
  var styleEl = null;
  function applyState(s) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "rere-ui-css";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildCss(s);
    var f = FONTS[s.font];
    if (f.url && !document.getElementById("rere-font-" + s.font)) {
      var l = document.createElement("link");
      l.id = "rere-font-" + s.font;
      l.rel = "stylesheet";
      l.href = f.url;
      document.head.appendChild(l);
    }
  }

  // ── API untuk Dashboard Owner (akses-owner.html) ───────────
  window.RereUI = {
    THEMES: THEMES,
    FONTS: FONTS,
    RADII: RADII,
    DEFAULT: DEFAULT,
    getState: loadState,
    set: function (partial) {
      var s = loadState();
      if (partial) {
        if (partial.theme !== undefined) s.theme = partial.theme;
        if (partial.font !== undefined) s.font = partial.font;
        if (partial.radius !== undefined) s.radius = partial.radius;
      }
      saveState(s);
      applyState(s);
      return s;
    },
    reset: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      applyState(DEFAULT);
      return DEFAULT;
    },
    apply: function () { applyState(loadState()); }
  };

  // ── Terapkan tema GLOBAL (diatur owner) di semua perangkat ──
  // Owner menyimpan pilihan lewat tab 🎨 Tampilan (updateSetting). Kalau
  // website terhubung Google Apps Script (cloud), semua perangkat membaca
  // nilai yang sama dari cloud → tema berlaku serentak. Tanpa cloud, nilai
  // hanya tersimpan di perangkat owner (keterbatasan mode lokal).
  function readGlobalState() {
    try {
      var st = loadState();
      var changed = false;
      // 1) Coba dari settings cloud / DB (mock)
      var s = null;
      try { var db = JSON.parse(localStorage.getItem("REREPHOTO_MOCK_DB") || "null"); s = db && db.settings; } catch (e) {}
      if (!s) { try { s = JSON.parse(localStorage.getItem("REREPHOTO_SETTINGS") || "null"); } catch (e) {} }
      if (s) {
        if (s.ui_theme && THEMES[s.ui_theme]) { st.theme = s.ui_theme; changed = true; }
        if (s.ui_font && FONTS[s.ui_font]) { st.font = s.ui_font; changed = true; }
        if (s.ui_radius && RADII[s.ui_radius]) { st.radius = s.ui_radius; changed = true; }
      }
      if (changed) { applyState(st); }
      return changed;
    } catch (e) { return false; }
  }

  function fetchCloudUi() {
    var gasUrl = "";
    try {
      // Pakai URL yang sama dengan app.js (localStorage owner ATAU default bawaan
      // kode) — biar semua perangkat otomatis nyambung ke cloud tanpa set manual.
      gasUrl = (typeof window.getResolvedGasUrl === "function")
        ? window.getResolvedGasUrl()
        : (localStorage.getItem("REREPHOTO_GAS_URL") || "");
    } catch (e) {}
    if (!gasUrl || !/^https?:/i.test(gasUrl)) return;
    try {
      fetch(gasUrl + (gasUrl.indexOf("?") !== -1 ? "&" : "?") + "action=getSettings", { method: "GET" })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.status === "success" && res.settings) {
            var s = res.settings, st = loadState(), changed = false;
            if (s.ui_theme && THEMES[s.ui_theme]) { st.theme = s.ui_theme; changed = true; }
            if (s.ui_font && FONTS[s.ui_font]) { st.font = s.ui_font; changed = true; }
            if (s.ui_radius && RADII[s.ui_radius]) { st.radius = s.ui_radius; changed = true; }
            if (changed) applyState(st);
          }
        }).catch(function () {});
    } catch (e) {}
  }

  // Terapkan otomatis saat halaman dibuka (semua halaman)
  function initUi() {
    applyState(loadState());
    readGlobalState(); // baca pengaturan global (dari DB lokal / settings)
    fetchCloudUi();    // kalau cloud aktif, ambil dari Google Sheets
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUi);
  } else {
    initUi();
  }
})();
