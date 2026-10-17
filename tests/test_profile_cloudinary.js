/**
 * test_profile_cloudinary.js — Tes validasi avatarUrl Cloudinary di PUT /api/auth/profile
 * Jalankan setelah npm run build:
 *   node tests/test_profile_cloudinary.js
 */
require("./helpers/requireTestDb")();

const { isOwnCloudinaryImageUrl } = require("../dist/lib/cloudinary");
const { updateProfile } = require("../dist/controllers/authController");
const prisma = require("../dist/lib/prisma").default;

// Set cloud name uji agar isOwnCloudinaryImageUrl bisa bekerja
process.env.CLOUDINARY_CLOUD_NAME = "cloud-uji";

const results = [];
let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) {
    console.log(`LULUS  ${name}`);
    results.push(true);
    passed++;
  } else {
    console.log(`GAGAL  ${name}`);
    results.push(false);
    failed++;
  }
}

// ── Tes isOwnCloudinaryImageUrl langsung ──────────────────────────────────────

assert(
  "URL cloud sendiri /image/upload/.../abc.jpg → true",
  isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/v1/folder/abc.jpg")
);
assert(
  "URL cloud sendiri dengan ekstensi .png → true",
  isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/sesuatu/xyz.png")
);
assert(
  "URL cloud sendiri dengan ekstensi .webp → true",
  isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/abc.webp")
);
assert(
  "URL cloud sendiri dengan ekstensi .gif → true",
  isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/abc.gif")
);
assert(
  "URL cloud sendiri ekstensi uppercase .JPG → true (case-insensitive)",
  isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/abc.JPG")
);
assert(
  "URL cloud lain → false",
  !isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-lain/image/upload/folder/abc.jpg")
);
assert(
  "Domain subdomain palsu res.cloudinary.com.evil.com → false",
  !isOwnCloudinaryImageUrl("https://res.cloudinary.com.evil.com/cloud-uji/image/upload/x.jpg")
);
assert(
  "http:// (bukan https) → false",
  !isOwnCloudinaryImageUrl("http://res.cloudinary.com/cloud-uji/image/upload/abc.jpg")
);
assert(
  "path /raw/upload/ bukan /image/upload/ → false",
  !isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/raw/upload/file.jpg")
);
assert(
  "ekstensi .pdf → false",
  !isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/doc.pdf")
);
assert(
  "ekstensi .zip → false",
  !isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/file.zip")
);

// CLOUDINARY_CLOUD_NAME kosong → selalu false
process.env.CLOUDINARY_CLOUD_NAME = "";
assert(
  "CLOUDINARY_CLOUD_NAME kosong + URL Cloudinary → false",
  !isOwnCloudinaryImageUrl("https://res.cloudinary.com/cloud-uji/image/upload/abc.jpg")
);
// Kembalikan untuk tes controller
process.env.CLOUDINARY_CLOUD_NAME = "cloud-uji";

// ── Tes updateProfile via controller mock ─────────────────────────────────────

function invoke(avatarUrl, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const savedEnv = {};
    for (const [k, v] of Object.entries(extraEnv)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }
    let status = 200;
    const res = {
      status(code) { status = code; return this; },
      json(data) {
        for (const [k, v] of Object.entries(savedEnv)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        resolve({ status, data });
        return this;
      },
    };
    const req = {
      user: { id: "user-test-cloudinary", name: "Test", role: "buyer" },
      body: { avatarUrl },
      protocol: "http",
      get: () => "localhost:4000",
    };
    updateProfile(req, res, reject).catch(reject);
  });
}

(async () => {
  // Pastikan user dummy tersedia di DB test
  await prisma.user.upsert({
    where: { id: "user-test-cloudinary" },
    update: {},
    create: {
      id: "user-test-cloudinary",
      name: "Test Cloudinary User",
      email: "test_cloudinary@example.com",
      passwordHash: "hash123",
      role: "buyer",
    },
  });

  try {
    // URL Cloudinary milik cloud sendiri → 200
    let r = await invoke("https://res.cloudinary.com/cloud-uji/image/upload/v1/photo.jpg");
    assert("updateProfile: URL Cloudinary cloud sendiri diterima (200)", r.status === 200);

    // URL cloud lain → 400
    r = await invoke("https://res.cloudinary.com/cloud-lain/image/upload/v1/photo.jpg");
    assert("updateProfile: URL Cloudinary cloud lain ditolak (400)", r.status === 400);

    // Domain palsu → 400
    r = await invoke("https://res.cloudinary.com.evil.com/cloud-uji/image/upload/x.jpg");
    assert("updateProfile: domain palsu ditolak (400)", r.status === 400);

    // URL lokal lama masih diterima → 200
    r = await invoke("/uploads/foto.jpg");
    assert("updateProfile: URL lokal /uploads/ masih diterima (200)", r.status === 200);

    // URL eksternal acak → 400
    r = await invoke("https://evil.com/hack.jpg");
    assert("updateProfile: URL eksternal acak ditolak (400)", r.status === 400);

    // null menghapus avatar → 200
    r = await invoke(null);
    assert("updateProfile: null menghapus avatar (200)", r.status === 200);

    // Pesan error yang baru (bukan "lokal")
    r = await invoke("https://evil.com/x.jpg");
    assert(
      "updateProfile: pesan error mengandung 'URL hasil upload'",
      r.status === 400 && r.data.error === "avatarUrl harus merupakan URL hasil upload"
    );
  } finally {
    // Bersihkan data dummy setelah tes selesai
    await prisma.user.delete({ where: { id: "user-test-cloudinary" } }).catch(() => {});
  }

  console.log(`\n${failed === 0 ? "SEMUA TES CLOUDINARY AVATAR LULUS" : `${failed} tes GAGAL`}`);
  process.exit(failed === 0 ? 0 : 1);
})();