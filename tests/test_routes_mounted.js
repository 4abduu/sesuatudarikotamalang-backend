/**
 * test_routes_mounted.js — Memastikan SEMUA rute benar-benar terpasang di app (bukan 404).
 *
 * Tes lain memanggil controller langsung, sehingga rute yang lupa dipasang di app.ts tidak terdeteksi
 * (contoh: GET /api/settings/public sempat tidak terpasang). Tes ini menjalankan app asli di port acak
 * (tanpa mengganggu server lain) dan menembak rutenya lewat HTTP.
 *
 * Jalankan setelah `npm run build`: node tests/test_routes_mounted.js
 */
require("./helpers/requireTestDb")();
process.env.JWT_SECRET = process.env.JWT_SECRET || "secret-khusus-tes";

const http = require("http");
const app = require("../dist/app").default;
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");

function wibDate(offsetDays) {
  return new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

function request(port, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: { "Content-Type": "application/json" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    if (method !== "GET") req.write("{}");
    req.end();
  });
}

// [method, path, status yang diharapkan]. "!404" berarti: apa pun selain 404 (rute terpasang).
const cases = [
  ["GET", "/", 200],
  ["GET", "/api/categories", 200],
  ["GET", "/api/products", 200],
  ["GET", "/api/search?q=a", 200],
  ["GET", `/api/slots?date=${wibDate(3)}`, 200],
  ["GET", "/api/settings/public", 200],
  ["POST", "/api/ai/story-draft", 401],
  ["GET", "/api/reviews", 200],
  ["GET", "/api/artisans", 200],
  // Wajib login: harus 401, bukan 404
  ["GET", "/api/auth/me", 401],
  ["PUT", "/api/auth/profile", 401],
  ["GET", "/api/orders", 401],
  ["POST", "/api/orders", 401],
  ["POST", "/api/orders/xyz/pay", 401],
  ["GET", "/api/notifications", 401],
  ["GET", "/api/artisans/mine", 401],
  ["GET", "/api/artisans/applications/mine", 401],
  ["GET", "/api/products/mine", 401],
  ["GET", "/api/reviews/mine", 401],
  ["POST", "/api/upload/single", 401],
  // Khusus admin: tanpa token juga 401
  ["GET", "/api/admin/dashboard", 401],
  ["GET", "/api/admin/applications", 401],
  ["GET", "/api/admin/orders", 401],
  ["GET", "/api/admin/artisans", 401],
  ["GET", "/api/admin/products", 401],
  ["GET", "/api/admin/reviews", 401],
  ["GET", "/api/admin/settings", 401],
  // Webhook tanpa auth: boleh 403/503 (tanda tangan), yang penting terpasang
  ["POST", "/api/payments/webhook", "!404"],
  // Rute tak dikenal harus 404
  ["GET", "/api/rute-yang-tidak-ada", 404],
];

(async () => {
  const server = app.listen(0);
  const { port } = server.address();
  let failed = 0;
  console.log(`Server uji pada port ${port}\n`);
  for (const [method, path, expected] of cases) {
    let status;
    try {
      status = await request(port, method, path);
    } catch (e) {
      status = `ERR ${e.message}`;
    }
    const ok = expected === "!404" ? status !== 404 && typeof status === "number" : status === expected;
    if (!ok) failed++;
    console.log(`${ok ? "LULUS" : "GAGAL"}  ${method.padEnd(6)} ${path.padEnd(42)} -> ${status} (harap ${expected})`);
  }
  server.close();
  await prisma.$disconnect();
  console.log(`\n${failed === 0 ? "SEMUA RUTE TERPASANG" : failed + " rute bermasalah"}`);
  process.exit(failed === 0 ? 0 : 1);
})();
