# Sesuatu DariKota Malang — Backend API

> **Release v1.0.0** · Express.js · TypeScript · Prisma · MySQL

Backend utama platform **Sesuatu DariKota Malang**. Service ini menjadi sumber
kebenaran untuk akun, katalog, varian, stok, pesanan, pembayaran, upload gambar,
moderasi, email OTP, dan operasional admin.

## Arsitektur

\`\`\`text
admin-web ───────┐
                 ├──> Backend API ───> MySQL
user_mobile ────┘          │
                           ├── Cloudinary (gambar)
                           ├── OpenAI (moderasi)
                           ├── Gemini (draft cerita)
                           ├── Midtrans (pembayaran)
                           └── Resend (email)
\`\`\`

Frontend tidak menghitung ulang harga, stok, status order, atau aturan pembayaran.
Semua keputusan bisnis tersebut dibuat dan divalidasi di backend.

## Menjalankan lokal

### Prasyarat

- Node.js LTS, npm, dan MySQL 8 atau kompatibel.
- Kredensial layanan pihak ketiga hanya bila fitur terkait ingin diuji.

### Instalasi

\`\`\`bash
npm install
\`\`\`

Buat database lokal:

\`\`\`sql
CREATE DATABASE sesuatu_darikota_malang;
\`\`\`

Salin \`.env.example\` menjadi \`.env\`. Nilai minimum lokal:

\`\`\`env
NODE_ENV=development
PORT=4000
DATABASE_URL="mysql://root:@localhost:3306/sesuatu_darikota_malang"
JWT_SECRET="gunakan-string-acak-minimal-32-karakter"
\`\`\`

Jalankan migrasi dan server:

\`\`\`bash
npm run prisma:migrate
npm run dev
\`\`\`

Server tersedia di \`http://localhost:4000\`. Health check: \`GET /\`.

## Environment variables

| Variable | Kegunaan | Produksi |
|---|---|:---:|
| \`DATABASE_URL\` | Koneksi Prisma ke MySQL | Wajib |
| \`JWT_SECRET\` | Signing JWT dan fallback OTP pepper | Wajib |
| \`CORS_ALLOWED_ORIGINS\` | Origin frontend yang diizinkan | Wajib |
| \`NODE_ENV\`, \`PORT\`, \`TRUST_PROXY\` | Runtime dan proxy deployment | Wajib sesuai deployment |
| \`CLOUDINARY_CLOUD_NAME\`, \`CLOUDINARY_API_KEY\`, \`CLOUDINARY_API_SECRET\` | Upload gambar | Fitur upload |
| \`OPENAI_API_KEY\`, \`MODERATION_ENABLED\`, \`MODERATION_FAIL_MODE\` | Moderasi gambar | Fitur moderasi |
| \`GEMINI_API_KEY\`, \`GEMINI_MODEL\` | AI draft cerita | Fitur AI |
| \`MIDTRANS_SERVER_KEY\`, \`MIDTRANS_CLIENT_KEY\`, \`MIDTRANS_IS_PRODUCTION\` | Pembayaran Snap | Fitur pembayaran |
| \`GOOGLE_CLIENT_ID\` | Google Sign-In | Login Google |
| \`RESEND_API_KEY\`, \`RESEND_FROM_EMAIL\` | OTP dan email | Fitur email |
| \`PUBLIC_BASE_URL\` | URL publik backend | Direkomendasikan |
| \`OTP_PEPPER\` | Pepper OTP khusus | Opsional |
| \`SEED_DEMO_*\` | Akun demo | Lokal/demo saja |

Jangan commit \`.env\`, token, API key, password database, atau private key.
Nilai production disimpan di Railway Variables.

Untuk produksi, gunakan:

\`\`\`env
MODERATION_ENABLED=true
MODERATION_FAIL_MODE=closed
\`\`\`

Mode \`open\` hanya untuk pengujian lokal.

## Database dan seed

\`\`\`bash
npm run prisma:generate
npm run prisma:migrate       # development
npm run prisma:deploy        # production, migration yang sudah committed
npm run prisma:studio
npm run prisma:seed
npm run prisma:seed:official
\`\`\`

Jalankan seeder demo hanya pada database demo. Jangan menjalankan \`migrate
reset\`, \`db push\`, atau perintah destruktif pada database production.

## Fitur utama

- Auth password, Google Sign-In, logout per perangkat, OTP, lupa password,
  ganti email, dan ganti password.
- Katalog, kreator, produk, cerita, varian kombinasi, stok efektif, rating,
  ulasan, pencarian, dan pagination.
- Pengajuan kreator, dashboard kreator, upload produk, dan manajemen stok.
- Order, pickup, Cash/QRIS, Midtrans Snap, webhook, bayar ulang, dan notifikasi.
- Cloudinary upload dengan validasi tipe, magic bytes, moderasi, dan WebP untuk
  unggahan baru.
- Draft cerita Gemini, email Resend, dan dashboard operasional admin.

## Endpoint penting

Semua endpoint memakai prefix \`/api\`.

| Area | Endpoint contoh |
|---|---|
| Auth | \`POST /api/auth/register\`, \`POST /api/auth/login\`, \`GET /api/auth/me\` |
| Katalog | \`GET /api/products\`, \`GET /api/products/:id\` |
| Upload | \`POST /api/upload/single\`, \`POST /api/upload/multiple\` |
| Kreator | \`POST /api/artisans/apply\`, \`GET /api/artisans/:id\` |
| Order | \`POST /api/orders\`, \`GET /api/orders/:id\` |
| Payment | \`POST /api/orders/:id/pay\`, \`POST /api/payments/webhook\` |
| Admin | \`GET /api/admin/dashboard\`, \`GET /api/admin/orders\` |

Kontrak lengkap: [\`docs/API_CONTRACT.md\`](../docs/API_CONTRACT.md).

## Upload gambar

Format yang diterima JPEG, PNG, dan WebP, maksimal 2 MB. Backend memeriksa
isi file, bukan hanya ekstensi atau MIME dari client.

File yang signature-nya tidak cocok atau ditolak moderasi menghasilkan HTTP 422
\`IMAGE_REJECTED\` dengan \`rejectedIndexes\`. Upload baru ditransformasi
Cloudinary menjadi WebP dengan quality otomatis; file lama tidak dikonversi ulang.

## Quality checks

\`\`\`bash
npm run typecheck
npm run build
\`\`\`

Backend belum memiliki script test otomatis di \`package.json\`. Lakukan smoke
test health check, login, upload, order, dan webhook pada environment yang aman.

## Deployment Railway

1. Push branch yang sudah diverifikasi ke GitHub.
2. Pastikan Railway mengambil branch production yang benar.
3. Isi Railway Variables dan domain API.
4. Jalankan \`npx prisma migrate deploy\` untuk migration production.
5. Cek deployment logs, health check, login, upload, dan webhook Midtrans.

Jangan menjadikan seed demo sebagai pre-deploy command production.

## Dokumentasi terkait

- [API_CONTRACT.md](../docs/API_CONTRACT.md) — request, response, status, dan error.
- [CHANGELOG-API.md](../docs/CHANGELOG-API.md) — riwayat perubahan dan template versi.
- [dokumen master](../docs/dokumen-master-sesuatu-darikota-malang.md) — aturan bisnis.

## Release v1.0.0

Rilis pertama untuk demo akademik dan pengujian end-to-end backend, admin-web,
dan aplikasi Flutter. Sebelum penggunaan publik, lakukan audit secret, backup
database, payment production, observability, dan signing release mobile.
