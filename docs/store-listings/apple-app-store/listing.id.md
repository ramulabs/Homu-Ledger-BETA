# Apple App Store — HOMU Ledger (Bahasa Indonesia / id-ID)

Listing terjemahan untuk lokal `id`. Tambah lewat App Store Connect →
HOMU → App Store → "Add Language" → Indonesian.

**Batas karakter App Store Connect** — angka di samping field
konservatif.

---

## Nama aplikasi (≤ 30 karakter)

```
HOMU — Ledger Bersama
```

_(21 karakter.)_

## Subtitle (≤ 30 karakter)

```
Pengeluaran rumah & pasangan
```

_(28 karakter.)_

## Promotional text (≤ 170 karakter)

Promotional text bisa di-update *antar rilis* tanpa submit ulang —
pakai untuk hal time-sensitive ("sekarang dengan Laporan!") bukan
deskripsi fitur utama.

```
Catat pengeluaran bersama pasangan atau keluarga. Voice-to-add bahasa
Indonesia & Inggris. Foto struk. Tanpa iklan, tanpa wajib link
rekening.
```

_(154 karakter.)_

## Description (≤ 4000 karakter)

```
HOMU adalah pencatat pengeluaran bersama untuk pasangan dan keluarga
yang mengatur uang bareng-bareng — bukan saling jaga jarak.

HOMU jawab pertanyaan "siapa bayar belanja bulan ini?" dan "kita habis
berapa sih buat jajan?" — tanpa ribetnya spreadsheet, bising-nya app
agregator bank, atau canggungnya nge-log transaksi lewat Venmo.

UNTUK SIAPA
• Pasangan yang split tagihan, sewa, dan belanja
• Keluarga yang nyatuin pengeluaran rumah
• Anak kos yang setor-setoran tiap akhir bulan
• Siapa pun yang sering lupa nyatat belanjaan cash

FITUR UTAMA
• Tambah transaksi dalam 5 detik — nominal, kategori, opsional foto
  struk
• Voice-to-add: tap mikrofon, bilang "20rb kopi", selesai. Input suara
  Bahasa Indonesia bukan tempelan, tapi fitur utama
• Multi-dompet — kartu bank, e-wallet, kas patungan, semua dipisah
• Ledger rumah bersama — undang pasangan, lihat entry satu sama lain
  real-time
• Insight kategori — tahu persis ke mana uang bulan ini pergi
• Antarmuka bilingual: Bahasa Indonesia dan English, bisa ganti kapan
  saja
• Privasi dulu — tanpa iklan, tanpa SDK analitik yang dijual ke broker
  data, tanpa harus link rekening kalau kamu tidak mau

KENAPA HOMU
Kami bangun HOMU karena bosan dengan trade-off di app lain: kalau
slick, dari Amerika dan nggak ngerti Bahasa Indonesia. Kalau lokal,
penuh iklan dan trik gelap. HOMU keduanya — slick DAN lokal — dan
fitur catat-mencatat utamanya tetap gratis.

CARA PAKAI
1. Install, masuk pakai email atau Apple ID
2. Set up dompet kamu (Cash, kartu BCA, Gopay — pakai yang kamu pakai)
3. Undang anggota rumah — pasangan, anak yang udah dipercaya pegang
   uang, teman kos
4. Mulai catat — suara, foto struk, atau ketik biasa
5. Buka Laporan di akhir bulan buat lihat ke mana uangnya

PRIVASI
HOMU simpan riwayat transaksi kamu di project Supabase kami sendiri,
region Tokyo. Kami nggak jual data. Nggak tampilin iklan. Nggak wajib
nge-link rekening. Kebijakan privasi lengkap di
https://homu.ramu.app/privacy.

YANG SENGAJA TIDAK ADA DI HOMU
• Tidak ada import otomatis dari bank (direncanakan — mau bikin dengan
  benar, bukan buru-buru)
• Tidak ada tracking investasi
• Tidak ada amplop budgeting (direncanakan v2)
• Tidak ada export pajak (direncanakan v2)

Ada pertanyaan? Email kami — alamat support tertera di listing.

---

HOMU dibangun oleh Ramulabs, tim indie berbasis di Jakarta. Feedback
dan permintaan fitur dibaca oleh manusia, bukan bot.
```

_(~2200 karakter dari 4000.)_

## Keywords (≤ 100 karakter, pisah koma, TANPA SPASI setelah koma)

Apple deprecate spasi antar keyword — buang. Keyword nggak perlu
mengulang kata yang udah ada di title / subtitle / kategori.

```
pengeluaran,budget,keluarga,pasangan,ledger,bersama,kos,bahasa,indonesia,struk,suara,rupiah
```

_(94 karakter.)_

## Support URL

```
https://homu.ramu.app/help
```

_(Buat page-nya atau redirect ke form kontak sebelum submission.)_

## Marketing URL (opsional)

```
https://homu.ramu.app
```

## Privacy policy URL (wajib)

```
https://homu.ramu.app/privacy
```

## Icon aplikasi

- [ ] 1024×1024 PNG, **tanpa alpha channel**, **tanpa rounded corners**
      (Apple yang nge-apply mask-nya).
- [ ] Sumber: regenerate dari source logo lewat
      `npx capacitor-assets generate --ios` — lihat
      `scripts/native-ios-bootstrap.md` step 4.
- [ ] Background solid only (Apple reject icon dengan transparency).

## Screenshot — checklist (jangan auto-generate, ambil yang asli)

App Store Connect butuh screenshot untuk minimal **satu** display class
per device. Makin sedikit yang Apple butuh, makin tinggi peluang dia
auto-scale dari set terbesar. Aman-nya: kirim satu set per device class
saat ini:

- [ ] **iPhone display 6.7" (iPhone 14 Pro Max, 15 Plus, 16 Plus)**
      — 1290×2796 portrait. 3 sampai 10 screenshot. **WAJIB** —
      semua scale dari sini.
- [ ] **iPhone display 6.5" (iPhone lama)** — 1242×2688. Apple
      auto-scale dari 6.7" kalau di-skip, tapi reviewer prefer
      dedicated.
- [ ] **iPhone display 5.5" (iPhone 8 Plus)** — 1242×2208. Wajib
      HANYA kalau support iOS 12 atau sebelumnya — kita set deployment
      target ke iOS 15+, jadi bisa skip.
- [ ] **iPad Pro 12.9"** — 2048×2732 portrait. Wajib kalau app
      universal (kita ship universal — lihat `LSRequiresIPhoneOS` true
      + iPad orientations di Info.plist). Wajib.
- [ ] **iPad Pro 11"** — 1668×2388. Opsional tapi disarankan.

Saran shot (sama kayak Play, di-stage ulang buat iOS):
1. Hero — daftar Transaksi dengan beberapa entry terbaru (light)
2. Sheet Tambah Transaksi terbuka di tengah-tengah ngisi
3. FAB Voice-to-add lagi aktif (waveform muncul)
4. Laporan — pie chart kategori
5. Settings → Anggota — nampilin satu rumah berbagi
6. Versi dark theme dari #1

## App preview video (opsional)

- [ ] Satu per device class, 15-30 detik, MP4 atau MOV, H.264.
- [ ] Skip buat peluncuran v1 — nambah kompleksitas tanpa banyak
      bantu conversion buat utility finance.

## Kuesioner rating usia (12+)

Kuesioner Apple — jawaban yang diharapkan:

- Kekerasan kartun atau fantasi: Tidak ada
- Kekerasan realistis: Tidak ada
- Konten seksual / nudity: Tidak ada
- Sumpah serapah / humor kasar: Tidak ada
- Penggunaan alkohol / tembakau / obat: Tidak ada
- Tema dewasa / sugestif: Tidak ada
- Tema horor / takut: Tidak ada
- Judi: Tidak ada
- Kontes: Tidak ada
- Akses web tidak terbatas: Tidak (HOMU cuma render halaman kita
  sendiri)
- Info medis / treatment: Tidak

Rating yang diharapkan: **4+** (atau **Apple 12+** kalau reviewer
strict ke pertanyaan "unrestricted web access" karena kita ada
webview — siap argumen turun ke 4+ karena webview cuma load domain
kita sendiri via Universal Links).

## App Privacy ("nutrition labels") — draft jawaban

Section App Privacy Apple. Tiap item tanya: "Lo collect X?" Kalau ya,
"linked ke identity? dipakai buat tracking?"

### Contact Info → Email Address
- Dikoleksi: YA
- Linked ke user: YA
- Dipakai tracking: TIDAK
- Tujuan: App Functionality (sign in akun)

### Financial Info → Other Financial Info
- Dikoleksi: YA (nominal transaksi, nama dompet, nama kategori)
- Linked ke user: YA
- Dipakai tracking: TIDAK
- Tujuan: App Functionality

### User Content → Photos or Videos
- Dikoleksi: YA (foto struk opsional)
- Linked ke user: YA
- Dipakai tracking: TIDAK
- Tujuan: App Functionality (lampir ke transaksi)

### User Content → Audio Data
- Dikoleksi: TIDAK (Whisper stream + discard; kita nggak simpan di
  server)
- Catatan: meskipun mic *dipakai*, data audio tidak disimpan past
  request lifecycle. Guidance Apple bilang data yang nggak retained
  ≠ collected.

### Identifiers → User ID
- Dikoleksi: YA (Supabase auth `uid`)
- Linked ke user: YA
- Dipakai tracking: TIDAK
- Tujuan: App Functionality

### Diagnostics → Crash Data
- Dikoleksi: YA (Vercel built-in)
- Linked ke user: TIDAK (dianonimkan)
- Dipakai tracking: TIDAK
- Tujuan: App Functionality

### TIDAK dikoleksi
- Lokasi (presisi ATAU kasar)
- Info sensitif
- Kontak
- Riwayat browsing / search
- Health & Fitness
- Pembelian (kita nggak pakai Apple IAP saat peluncuran)
- Usage Data (kita nggak ship analytics SDK)

## Account deletion (App Store guideline 5.1.1(v) — WAJIB)

Apple wajibkan in-app account deletion sejak iOS 17. Sekarang kita
support deletion via email. **Sebelum submission:** ship flow deletion
in-app (tracked sebagai follow-up RAM-13).

UX placeholder selama review:
- Settings → Akun → Hapus akun → buka
  `mailto:support@ramu.app?subject=Hapus%20akun%20saya`. Apple mungkin
  reject karena belum cukup in-app. Follow-up ticket implement flow
  konfirmasi deletion in-app proper.

## Info build — App Review

- **Akun demo** — buat sebelum review dengan:
  - Email: `apple-review@ramu.app`
  - Password: `<random, kasih ke reviewer di catatan submission>`
  - Pre-seed dengan 5-10 transaksi di dua bulan supaya reviewer
    lihat Laporan jalan.
- **Catatan buat reviewer**:
  > HOMU adalah pencatat pengeluaran bersama untuk pasangan dan
  > keluarga. Akun demo udah berisi sample data. Voice-to-add perlu
  > permission mikrofon; kalau test di tempat sepi, silakan tap
  > transaksi yang udah ada di daftar buat lihat flow edit / hapus.
  > App load konten dari https://homu.ramu.app via Universal Links;
  > tap URL HOMU manapun di device buat buka app.
