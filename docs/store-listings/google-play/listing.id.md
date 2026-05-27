# Google Play — HOMU Ledger (Bahasa Indonesia / id-ID)

Listing terjemahan untuk lokal `id-ID`. Tambahkan via Play Console →
HOMU → Main store listing → "Add a translation".

**Batas karakter Play Console** — angka di samping tiap field konservatif.

---

## Nama aplikasi (≤ 30 karakter)

```
HOMU — Catatan Pengeluaran
```

_(26 karakter.)_

## Deskripsi singkat (≤ 80 karakter)

```
Catat pengeluaran bersama pasangan atau keluarga. Bilingual EN + ID. Gratis.
```

_(76 karakter.)_

## Deskripsi lengkap (≤ 4000 karakter)

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
1. Install, masuk pakai email
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
• Tidak ada amplop budgeting (direncanakan v2 — RAM-5)
• Tidak ada export pajak (direncanakan v2 — RAM-12)

Ada pertanyaan? Email kami — alamat support tertera di listing Play.

---

HOMU dibangun oleh Ramulabs, tim indie berbasis di Jakarta. Feedback dan
permintaan fitur dibaca oleh manusia, bukan bot.
```

_(~2200 karakter dari 4000. Sisa ruang buat flag "What's new" saat
peluncuran.)_

## What's new (≤ 500 karakter, per rilis)

Untuk peluncuran v1.0:
```
Selamat datang di HOMU di Play! Ini v1 kami — pencatat transaksi
bersama, voice-to-add, foto struk, multi-dompet, bilingual EN+ID.
Nemu bug? Email kami — tiap laporan dibaca manusia.
```

## Screenshot — checklist (jangan auto-generate, ambil tangkapan asli)

Play Store butuh minimal:

- [ ] **Phone**: 2 sampai 8 screenshot, 16:9 atau 9:16, sisi panjang
      min 320 px max 3840 px, 24-bit PNG/JPEG.
  - Direkomendasi: 1080×1920 portrait atau 1080×2400 (perangkat
    modern).
  - Saran shot:
    1. Hero — daftar Transaksi dengan beberapa entry terbaru (tema
       light)
    2. Sheet Tambah Transaksi terbuka di tengah-tengah ngisi
    3. FAB Voice-to-add lagi aktif (waveform muncul)
    4. Laporan — pie chart kategori
    5. Settings → Anggota — nampilin satu rumah berbagi
    6. Versi dark theme dari #1
- [ ] **7" tablet** (opsional): 1 sampai 8, format sama
- [ ] **10" tablet** (opsional): 1 sampai 8, format sama

## Feature graphic (wajib)

- [ ] 1024×500 PNG, tanpa alpha. Dipakai di halaman listing toko di
      atas screenshot.
- [ ] Saran layout: wordmark HOMU di kiri, screenshot daftar Transaksi
      di kanan.

## Icon aplikasi

- [ ] 512×512 32-bit PNG **dengan alpha** wajib di Play (beda sama
      requirement Apple 1024×1024 tanpa alpha).
- [ ] Sumber: `public/icons/icon-512.png` mungkin bisa dipakai;
      verifikasi di perangkat asli — adaptive icon mask Play bisa
      crop lebih ketat dari maskable safe area yang kami ship buat
      PWA.

## Kategori

- Kategori: **Keuangan** (primer)
- Tag: budget, pengeluaran, keluarga, pasangan
- Target audiens: Dewasa 18–65, dengan anak 13+ sekunder (HOMU tidak
  ada user-generated content)

## Detail kontak

- Website: <https://homu.ramu.app>
- Email: support@ramu.app _(buat alias ini sebelum publish)_
- Kebijakan privasi: <https://homu.ramu.app/privacy>

## Form data safety — draft jawaban

Form Data Safety di Play wajib sebelum publish. Draft jawaban di bawah;
review sama yang ngerti data flow sebelum finalisasi.

### Data yang dikumpulkan

- **Info pribadi** — Alamat email (wajib buat sign in). Dikumpulkan,
  terkait dengan user, TIDAK dibagikan ke pihak ketiga. Dienkripsi
  saat istirahat + transit. Penghapusan opsional: user bisa email
  support buat minta hapus akun (sampai kami ship hapus in-app via
  RAM-TBD).
- **Info keuangan** — Riwayat transaksi, nama dompet, nama kategori.
  Dikumpulkan, terkait user, TIDAK dibagikan. Dienkripsi saat
  istirahat + transit.
- **Foto** — Gambar struk opsional yang di-upload user. Dikumpulkan,
  terkait user, TIDAK dibagikan. Dienkripsi saat istirahat + transit.
  User bisa hapus foto dengan hapus transaksinya.
- **Aktivitas aplikasi** — Crash log saja, lewat Vercel Analytics.
  Dianonimkan. TIDAK terkait akun user.
- **Info perangkat** — User-agent buat daftar sesi aktif
  (`/settings/devices`). Terkait user, TIDAK dibagikan.

### Data yang TIDAK dikumpulkan

- Lokasi perkiraan atau presisi
- Kontak / address book
- Kalender
- Pesan atau log panggilan
- Foto di luar struk yang user upload sengaja
- Audio di luar rekaman voice-to-add, yang di-stream ke Whisper dan
  TIDAK disimpan di server
- Riwayat browsing web
- Riwayat browsing aplikasi (di luar HOMU)

### Praktik keamanan

- ☑ Data dienkripsi saat transit (TLS 1.2+)
- ☑ Data dienkripsi saat istirahat (Supabase Postgres + storage
  encryption)
- ☑ Bisa minta hapus data (sekarang via email; in-app via RAM-TBD)
- ☑ Review keamanan independen: belum — flag jujur

## Rating usia — ringkasan kuesioner IARC

Jawaban kebanyakan pertanyaan: **Tidak** (HOMU tanpa kekerasan, judi,
konten seksual, sumpah serapah, obat-obatan, UGC). Hasil yang
diharapkan: **Semua orang** / PEGI 3.

## Iklan

- **Mengandung iklan:** TIDAK
- **In-app purchase:** TIDAK saat peluncuran. Flip ke YA saat RAM-TBD
  ship tier Premium (dengan Play Billing).
