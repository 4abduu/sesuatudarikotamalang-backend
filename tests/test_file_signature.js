/**
 * test_file_signature.js — Tes isi berkas (magic bytes) dan pembuatan public_id upload.
 * Tidak memakai database dan tidak memanggil jaringan. Jalankan setelah `npm run build`:
 *   node tests/test_file_signature.js
 */
const { hasValidSignature } = require("../dist/lib/fileSignature");

process.env.CLOUDINARY_CLOUD_NAME = "cloud-uji";
process.env.CLOUDINARY_API_KEY = "kunci-uji";
process.env.CLOUDINARY_API_SECRET = "rahasia-uji";
const { uploadBuffer } = require("../dist/lib/cloudinary");

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(8)]);
const pdf = Buffer.concat([Buffer.from("%PDF-1.7", "ascii"), Buffer.alloc(8)]);
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);
const html = Buffer.from("<html><script>alert(1)</script></html>");
const empty = Buffer.alloc(0);

const results = [];
function check(name, cond) {
  console.log(`${cond ? "LULUS" : "GAGAL"}  ${name}`);
  results.push(!!cond);
}

(async () => {
  check("PNG asli diterima sebagai image/png", hasValidSignature(png, "image/png"));
  check("JPEG asli diterima sebagai image/jpeg dan image/jpg", hasValidSignature(jpg, "image/jpeg") && hasValidSignature(jpg, "image/jpg"));
  check("GIF asli diterima", hasValidSignature(gif, "image/gif"));
  check("WebP asli diterima", hasValidSignature(webp, "image/webp"));
  check("PDF asli diterima", hasValidSignature(pdf, "application/pdf"));
  check("ZIP asli diterima (dua nama MIME)", hasValidSignature(zip, "application/zip") && hasValidSignature(zip, "application/x-zip-compressed"));
  check("HTML berlabel image/png ditolak", !hasValidSignature(html, "image/png"));
  check("PNG berlabel image/jpeg ditolak (tipe tidak cocok)", !hasValidSignature(png, "image/jpeg"));
  check("berkas kosong ditolak", !hasValidSignature(empty, "image/png"));
  check("MIME tak dikenal ditolak", !hasValidSignature(png, "text/html"));

  // uploadBuffer menolak isi palsu SEBELUM menghubungi Cloudinary (status 400)
  let status = null;
  try {
    await uploadBuffer(html, { filename: "evil.png", mimetype: "image/png" });
  } catch (e) {
    status = e.status;
  }
  check("uploadBuffer menolak HTML berlabel PNG dengan status 400", status === 400);

  const ok = results.every(Boolean);
  console.log(ok ? "\nSEMUA TES TANDA TANGAN BERKAS LULUS" : "\nADA TES YANG GAGAL");
  process.exit(ok ? 0 : 1);
})();
