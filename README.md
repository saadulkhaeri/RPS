# 📸 RERE PHOTO — Sistem Web Studio Foto

Sistem web Rere Photo (fotobox / self-photo studio) — **tanpa server, tanpa
Google Sheets wajib**. Semua data tersimpan di browser (Mode Lokal), lengkap
dengan backup & pindah data. Buka `index.html` dan langsung jalan.

## 🗂️ Halaman

### Publik & Member
| Halaman | Fungsi |
|---|---|
| `index.html` | Landing page + tombol BOOKING |
| `login-member.html` | Login / daftar member |
| `client.html` | Akun member: poin, tier, reward, riwayat booking, galeri foto |
| `booking.html` | Booking sesi foto member |

### Admin (butuh login owner/staf)
| Halaman | Fungsi |
|---|---|
| `akses-owner.html` | **Satu halaman owner dengan tab**: 📊 Dashboard · 💰 Keuangan · 🎟️ Voucher · 🖼️ Template · ⏱️ Absensi & Gaji · 🏪 Profil Studio |
| `portal-karyawan.html` | Portal staf **ringan** (tanpa panel, cepat load): login → Kasir · Atur Booking · Stok |
| `kasir.html` | Kasir 2-in-1: tab **Kasir/Penjualan** (split bill Tunai+QRIS+Transfer, struk) + tab **Delivery & Poin** (kirim link foto & tambah poin member) |
| `keuangan.html` | **Khusus Owner** — laba rugi, kas masuk/keluar, pengeluaran rutin, export CSV |
| `stok.html` | Inventori: barang, supplier, mutasi masuk/keluar, peringatan stok menipis |
| `voucher.html` | Kode diskon (persen/nominal) dengan kuota & masa berlaku |
| `template_bingkai.html` | Katalog bingkai foto (upload gambar / URL) |
| `absensi_gaji.html` | Absensi staf (Hadir/Izin/Sakit/Cuti/Alpa) + hitung gaji otomatis |
| `pengaturan.html` | Profil studio (alamat, WA, IG, TikTok, Maps, banner) |
| `kartu_member.html` | Kartu member (cadangan/halaman lama — sekarang dari dashboard owner pakai **popup**) |

## 💡 Fitur Khusus (baru)
- **Kasir = satu halaman**: penjualan + delivery & poin digabung lewat 2 tab.
- **Split bill**: bayar bisa terbagi 2 metode (mis. Tunai 40rb + QRIS 60rb).
  Dicatat sebagai "Tunai + QRIS" di laporan, kembalian dihitung dari bagian tunai.
- **Keuangan khusus Owner**: karyawan/staf tidak bisa membuka halaman keuangan
  (link disembunyikan & halaman menolak akses staf).

## 🧭 Panel Navigasi (Sidebar) di Halaman Admin
- **Owner** (akses-owner, keuangan, dll.): panel samping lengkap — Dashboard
  Owner · Kasir · Keuangan · Stok · Voucher · Template · Absensi · Booking ·
  Profil Studio.
- **Staf**: panel cuma 3 — **Kasir · Booking · Stok** (sesuai ruang lingkup).
- **Portal Karyawan** sengaja **tanpa panel** & tanpa library berat (Tailwind,
  QR) supaya **cepat & ringan saat dimuat** — di dalamnya ada 3 kartu akses
  cepat (Kasir / Atur Booking / Stok) + panel kelola booking langsung.
- Konfirmasi reward member kini ditangani **Owner** (tombol di dashboard owner),
  bukan staf lagi.

## 🔑 Akun Demo
| Peran | Cara masuk |
|---|---|
| **Member** | `login-member.html` → **081234567891** / **123** |
| **Staf** | `portal-karyawan.html` → pilih **Rizky Pratama** → password **apa saja** (login pertama) |
| **Owner** | `akses-owner.html` → Setup Wizard sekali (email + password sendiri) |

## 🚀 Cara Pakai
1. Buka `index.html` di browser (klik 2x).
2. Admin: buka `akses-owner.html` (owner) atau `portal-karyawan.html` (staf).
3. Data tersimpan di browser ini. Untuk pindah perangkat: Owner → **⬇️ Unduh Backup** → impor di perangkat lain.

> Backend Google Sheets (`Code.gs`) tetap tersedia opsional — diatur lewat
> tombol **⚙️ GAS URL** di dashboard owner.

## 🎨 Ubah Tampilan (UI/UX) — Khusus Owner
- Buka **Dashboard Owner → tab 🎨 Tampilan** untuk mengatur tampilan seluruh website:
  - **Warna tema**: Hijau Krem (bawaan) · Biru Navy · Ungu Mewah · Merah Rose · Hitam Emas
  - **Font**: Montserrat (bawaan) · Plus Jakarta · Poppins · Inter
  - **Bentuk kartu paket**: Rounded · Medium · Kotak
  - **Gambar Hero** (banner beranda): upload file atau tempel URL gambar
- Ada **pratinjau kartu** live, pilihan tersimpan otomatis di browser, dan tombol
  **↺ Reset Semua** untuk kembali ke tampilan bawaan Rere Photo.
- Pengunjung/member **tidak bisa** mengubah tampilan — tidak ada tombol ubah
  tampilan di halaman publik. Font utama website: **Montserrat**.

## 🖼️ Foto Paket di Beranda (Carousel)
- Kartu paket memakai **cover desain bawaan** (logo Rere Photo) — bersih, tanpa
  foto stok/AI. Mau pakai foto asli studio? Buka **Dashboard Owner → Paket →
  Ubah** → upload URL/gambar paket. Foto asli itu otomatis menimpa cover default.
- Harga tampil "Mulai IDR …/orang" untuk paket per orang, dan "IDR …" untuk
  paket flat (sesuai pengaturan paket di dashboard).

## 🖼️ Galeri Foto (Akun Member)
- Staf saat Input Delivery (Portal Karyawan → 📁 Delivery & Poin) cukup isi:
  - **📁 Link Folder Hasil Foto** (wajib) — tempat semua foto asli.
  - **📸 Foto Thumbnail** (opsional) — **upload gambar langsung** dari
    HP/laptop (otomatis dikompres) atau tempel link foto (bisa link file
    Google Drive — otomatis diubah jadi thumbnail yang bisa tampil), biar
    thumbnail di galeri member menampilkan foto aslinya.
- Kartu galeri member: **tumpukan foto berlapis** (gaya lama) yang menampilkan
  foto asli sesi kalau thumbnail ada, atau cover branded kalau kosong.
  **Klik kartu → langsung membuka folder Google Drive** di tab baru.
- Di HP, buka folder lalu tekan lama foto untuk menyimpan.

## 💰 Pilihan Harga Paket (Varian Promo)
- Setiap paket bisa punya **beberapa pilihan harga** — misal Vintage Box:
  **Harga Normal** (harga utama) + **Promo**, **Promo Sekolah**, **Promo
  Agustusan**, dll.
- **Owner mengatur** lewat **Dashboard Owner → 📦 Kelola Paket** (tambah/ubah
  paket): tombol **+ Tambah Pilihan Harga** untuk isi nama + harga tiap varian.
- **Kasir**: setelah pilih paket, muncul dropdown **💰 Pilih Harga** — pilih
  variannya, total & struk otomatis mengikuti. Struk menampilkan
  "Vintage Box (Promo Sekolah)".
- Varian tersimpan di data penjualan (`variant_label`) jadi laporan keuangan
  tetap akurat. Kalau paket tanpa varian, dropdown tidak muncul.

## 🪪 Kartu Member (Popup)
- Di **Dashboard Owner → tabel Member**, tombol **🪪** membuka **popup kartu
  member** — tanpa pindah halaman.
- Kartu berukuran **standar 85.6 × 54 mm** (ratio kartu ATM/kredit), berisi
  nama, ID, poin, tier, dan QR code. Ada tombol **🖨️ Cetak Kartu**.
