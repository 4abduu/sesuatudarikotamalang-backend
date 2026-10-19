# Sesuatu DariKota Malang — Backend API

Backend API berbasis Express.js, TypeScript, Prisma ORM, dan MySQL untuk platform **Sesuatu DariKota Malang**.

## Setup Pertama Kali

1. Pastikan MySQL sudah jalan (misal lewat Laragon), lalu buat database:
   ```sql
   CREATE DATABASE sesuatu_darikota_malang;
   ```
2. Salin `.env.example` menjadi `.env`, isi `DATABASE_URL` sesuai MySQL lokal, dan isi `JWT_SECRET` dengan string acak aman:
   ```env
   DATABASE_URL="mysql://root:@localhost:3306/sesuatu_darikota_malang"
   JWT_SECRET="rahasia_jwt_super_aman"
   ```
3. Install dependency:
   ```bash
   npm install
   ```
4. Jalankan migrasi Prisma untuk membuat skema tabel database:
   ```bash
   npm run prisma:migrate
   ```
5. Jalankan server pengembangan atau build:
   ```bash
   npm run dev        # Menjalankan dengan tsx watch (TypeScript live-reload)
   npm run typecheck  # Menjalankan tsc --noEmit
   npm run build      # Generates Prisma client & kompilasi ke dist/
   npm start          # Menjalankan dari dist/server.js
   ```
   Server akan berjalan di `http://localhost:4000`. Akses `GET /` untuk memastikan server aktif `{ "status": "ok", ... }`.

## Struktur Project

```
src/
├── app.ts                # Konfigurasi Express, middleware, routing & error handling
├── server.ts             # Entry point server (listen port & start cron job)
├── lib/                  # Module helper (prisma.ts, stock.ts, midtrans.ts, mailer.ts, upload.ts)
├── middleware/           # auth.ts (JWT verifier), requireRole.ts, rateLimiter.ts
├── routes/               # Express router (auth, products, orders, payments, admin, dll.)
├── controllers/          # Business logic handlers
├── types/                # Type definitions custom (.d.ts)
└── jobs/                 # Cron jobs (orderStatusJob.ts)
```

## Endpoint API Utama

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/google`
- **Katalog & Produk**: `GET /api/products`, `GET /api/products/:id`, `POST /api/products`
- **Pesanan**: `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/cancel`
- **Pembayaran**: `POST /api/payments/webhook` (Server-to-Server Midtrans Notification)
- **Admin**: `GET /api/admin/dashboard`, `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`, `GET /api/admin/applications`

Dokumentasi arsitektur dan aturan bisnis lengkap dapat dirujuk pada folder `docs/` (`docs/dokumen-master-sesuatu-darikota-malang.md` dan `docs/master-dokumen-v2.md`).

## Prisma Studio (GUI Data)

```bash
npm run prisma:studio
```

## Konfigurasi Environment

Salin `.env.example` ke `.env` dan isi variabel berikut. Nilai sesungguhnya dibagikan lewat jalur pribadi (bukan di repo).

| Variabel | Wajib | Dampak bila kosong |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Untuk fitur upload | `POST /api/upload/*` membalas **503** |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Untuk fitur AI | `POST /api/ai/story-draft` membalas **503** |
| `RESEND_API_KEY` | Untuk OTP email | OTP hanya dicetak di log server (mode simulasi) |
| `JWT_SECRET` | Wajib | Auth tidak berjalan |
| `DATABASE_URL` | Wajib | Server tidak bisa terhubung ke database |
| `MIDTRANS_SERVER_KEY`, dll. | Untuk pembayaran | Pembuatan order Midtrans gagal |

## Autentikasi & Otorisasi

Backend mendukung registrasi, login email dan password, Google Sign-In, serta logout melalui `POST /api/auth/logout`. JWT berlaku 7 hari dan dikirim pada header `Authorization: Bearer <token>`. JWT dipakai karena sesuai untuk klien mobile dan tidak membutuhkan sesi server per request; komprominya adalah token sulit dicabut sebelum kedaluwarsa. Mitigasinya adalah denylist saat logout, `passwordChangedAt` saat ganti/reset password, dan pembacaan role terbaru dari database pada setiap request.

Password tidak pernah disimpan sebagai plain text dan di-hash dengan bcrypt. OTP berlaku 10 menit, disimpan sebagai HMAC-SHA256, dan hangus setelah 5 percobaan salah pada kode yang sama. `OTP_PEPPER` dapat diisi sebagai kunci khusus; bila kosong, kunci diturunkan dari `JWT_SECRET`.

| Role | Akses utama |
|---|---|
| `buyer` | katalog, pencarian, order milik sendiri, pembayaran, notifikasi dan ulasan milik sendiri, pengajuan konsinyasi |
| `creator` | seluruh akses buyer yang relevan, serta profil kreator, produk, cerita, dan stok miliknya |
| `admin` | dashboard, seluruh order, aplikasi konsinyasi, produk, ulasan, pengaturan, dan perubahan status administratif |

Penegakan dilakukan berlapis: `requireAuth` dan `requireRole` untuk pemeriksaan kasar, policy/DAL untuk batas sebenarnya, serta kolom pemilik pada setiap query resource privat. `401` dengan `code: "UNAUTHORIZED"` berarti login ulang; `403` dengan `code: "FORBIDDEN"` berarti role atau izin tidak mencukupi; resource milik pengguna lain dikembalikan sebagai `404`. Token berada di header, bukan cookie, sehingga endpoint API ini tidak menggunakan cookie authentication dan tidak memerlukan mitigasi CSRF berbasis cookie.

### Akun uji untuk penilaian

Akun demo terpisah dibuat oleh seed hanya jika `SEED_DEMO_PASSWORD` diisi. Seed bersifat idempoten dan tidak mengubah akun demo yang sudah ada.

| Role | Email bawaan | Password |
|---|---|---|
| admin | `demo.admin@sesuatu.test` | `Admin123` |
| creator | `demo.creator@sesuatu.test` | `Creator123` |
| buyer | `demo.buyer@sesuatu.test` | `Buyer123` |

Email dapat diganti melalui `SEED_DEMO_ADMIN_EMAIL`, `SEED_DEMO_CREATOR_EMAIL`, dan `SEED_DEMO_BUYER_EMAIL`. Jalankan seed setelah menyiapkan database dan environment:

```bash
npm run prisma:seed
```

### Cara menguji

```bash
# Login
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo.buyer@sesuatu.test","password":"<PASSWORD>"}'

# Tanpa token -> 401 UNAUTHORIZED
curl http://localhost:4000/api/auth/me

# Buyer ke endpoint admin -> 403 FORBIDDEN
curl http://localhost:4000/api/admin/dashboard -H "Authorization: Bearer <TOKEN_BUYER>"

# Pengguna A membuka order pengguna B -> 404
curl http://localhost:4000/api/orders/<ORDER_MILIK_B> -H "Authorization: Bearer <TOKEN_A>"

# Logout lalu token yang sama -> request berikutnya 401
curl -X POST http://localhost:4000/api/auth/logout -H "Authorization: Bearer <TOKEN>"
curl http://localhost:4000/api/auth/me -H "Authorization: Bearer <TOKEN>"
```

> **Catatan:** variabel `GEMINI_API_KEY` dan `GEMINI_MODEL` harus diisi (tidak boleh hanya spasi) agar fitur AI aktif — nilai kosong `""` disamakan dengan tidak terkonfigurasi.
