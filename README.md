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
