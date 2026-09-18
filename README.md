# Sesuatu DariKota Malang — Backend

API (Express.js + Prisma + MySQL).

## Setup Pertama Kali

1. Pastikan MySQL sudah jalan (misal lewat Laragon), lalu buat database-nya:
   ```sql
   CREATE DATABASE sesuatu_darikota_malang;
   ```
2. Copy `.env.example` jadi `.env`, isi `DATABASE_URL` sesuai MySQL lokal kamu, dan isi `JWT_SECRET` dengan string acak (bisa generate lewat `openssl rand -base64 32` atau ketik bebas string panjang).
3. Install dependency:
   ```bash
   npm install
   ```
4. Generate Prisma client & bikin tabel di database:
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```
5. Jalankan server:
   ```bash
   npm run dev
   ```
   Server jalan di `http://localhost:4000`. Cek `GET /` harus balas `{ "status": "ok", ... }`.

## Struktur

```
src/
├── index.js              # entry point
├── lib/prisma.js         # PrismaClient singleton
├── middleware/           # auth.js (verifikasi JWT), requireRole.js (cek role)
├── routes/                # 1 file per domain (auth, products, orders, artisans, reviews, admin)
└── controllers/           # (opsional) pisahkan logic dari routes kalau makin kompleks
```

## Endpoint yang Sudah Ada (Contoh Kerja)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (butuh header `Authorization: Bearer <token>`)
- `GET /api/products`, `GET /api/products/:id`
- `GET /api/artisans`, `GET /api/artisans/:id`
- `GET /api/reviews?productId=...`
- `GET /api/orders` (butuh login)
- `GET /api/admin/dashboard` (butuh login sebagai admin)

Sisanya masih `TODO` di tiap file route — lihat komentar di masing-masing file untuk detail apa yang perlu dibangun, sesuai aturan bisnis di `docs/dokumen-master-sesuatu-darikota-malang.md`.

## Prisma Studio (GUI lihat data)

```bash
npm run prisma:studio
```
