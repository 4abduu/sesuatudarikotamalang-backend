/**
 * test_product_image_variants.js
 * Langkah 10: Tes fungsi murni lib/productImages.ts
 * (validateImageVariants, normalizeImageOrder, pruneImageVariants)
 * Tidak menyentuh database atau Cloudinary.
 */
"use strict";

const { validateImageVariants, normalizeImageOrder, pruneImageVariants } =
  require("../dist/lib/productImages");

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`LULUS  ${label}`); passed++; }
  else { console.error(`GAGAL  ${label}`); failed++; }
}

function throws400(label, fn) {
  try {
    fn();
    console.error(`GAGAL  ${label} (tidak melempar error)`);
    failed++;
  } catch (e) {
    if (e.status === 400) { console.log(`LULUS  ${label}`); passed++; }
    else { console.error(`GAGAL  ${label} (status ${e.status}, pesan: ${e.message})`); failed++; }
  }
}

// Fixtures
const IMG = ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg", "https://cdn.test/c.jpg"];
const OPTS = [{ name: "Motif", values: ["Ubin", "Sulur"] }, { name: "Warna", values: ["Merah", "Biru"] }];

// ──────────────────────────────────────────────────────────────────────────────
// validateImageVariants
// ──────────────────────────────────────────────────────────────────────────────

// undefined / null → []
ok("undefined → []", validateImageVariants(undefined, IMG, OPTS).length === 0);
ok("null → []",      validateImageVariants(null, IMG, OPTS).length === 0);
ok("[] → []",        validateImageVariants([], IMG, OPTS).length === 0);

// Entri valid
const validInput = [
  { url: IMG[0], option: "Motif", value: "Ubin" },
  { url: IMG[1], option: "Warna", value: "Merah" },
];
const valid = validateImageVariants(validInput, IMG, OPTS);
ok("2 entri valid → length 2",         valid.length === 2);
ok("entri[0].url === IMG[0]",          valid[0].url === IMG[0]);
ok("entri[0].option === 'Motif'",      valid[0].option === "Motif");
ok("entri[0].value === 'Ubin'",        valid[0].value === "Ubin");

// Aturan 1: bukan array
throws400("bukan array → 400",         () => validateImageVariants("string", IMG, OPTS));

// Aturan 1: item bukan objek
throws400("item bukan objek → 400",    () => validateImageVariants(["bukan objek"], IMG, OPTS));

// Aturan 1: url bukan string
throws400("url bukan string → 400",    () => validateImageVariants([{ url: 123, option: "Motif", value: "Ubin" }], IMG, OPTS));

// Aturan 1: url tidak ada di images
throws400("url tidak di images → 400", () => validateImageVariants(
  [{ url: "https://cdn.test/x.jpg", option: "Motif", value: "Ubin" }], IMG, OPTS
));

// Aturan 1: url duplikat
throws400("url duplikat → 400", () => validateImageVariants(
  [
    { url: IMG[0], option: "Motif", value: "Ubin" },
    { url: IMG[0], option: "Warna", value: "Merah" },
  ], IMG, OPTS
));

// Aturan 2: option tidak dikenal
throws400("option tidak dikenal → 400", () => validateImageVariants(
  [{ url: IMG[0], option: "TidakAda", value: "Ubin" }], IMG, OPTS
));

// Aturan 2: value bukan milik option itu
throws400("value tidak valid untuk option → 400", () => validateImageVariants(
  [{ url: IMG[0], option: "Motif", value: "Merah" }], IMG, OPTS  // "Merah" milik Warna, bukan Motif
));

// Aturan 3: produk tanpa varian tidak boleh punya imageVariants
throws400("produk tanpa varian + imageVariants → 400", () => validateImageVariants(
  [{ url: IMG[0], option: "Motif", value: "Ubin" }], IMG, []
));

// ──────────────────────────────────────────────────────────────────────────────
// normalizeImageOrder
// ──────────────────────────────────────────────────────────────────────────────

const variants = [{ url: IMG[1], option: "Motif", value: "Ubin" }]; // hanya b.jpg yang bertautan

// a dan c tidak bertautan → di depan, b di belakang
const sorted = normalizeImageOrder(IMG, variants);
ok("foto tidak bertautan di depan",  sorted[0] === IMG[0] && sorted[1] === IMG[2]);
ok("foto bertautan di belakang",     sorted[2] === IMG[1]);
ok("total panjang tidak berubah",    sorted.length === 3);

// Semua bertautan → urutan asli dipertahankan
const allLinked = [{ url: IMG[0], option: "Motif", value: "Ubin" }, { url: IMG[1], option: "Motif", value: "Sulur" }, { url: IMG[2], option: "Warna", value: "Merah" }];
const sortedAll = normalizeImageOrder(IMG, allLinked);
ok("semua bertautan → urutan asli",  JSON.stringify(sortedAll) === JSON.stringify(IMG));

// Tidak ada yang bertautan → urutan asli
const sortedNone = normalizeImageOrder(IMG, []);
ok("tidak ada tautan → urutan asli", JSON.stringify(sortedNone) === JSON.stringify(IMG));

// Array kosong → []
ok("images kosong → []", normalizeImageOrder([], variants).length === 0);

// ──────────────────────────────────────────────────────────────────────────────
// pruneImageVariants
// ──────────────────────────────────────────────────────────────────────────────

const allVariants = [
  { url: IMG[0], option: "Motif", value: "Ubin" },
  { url: IMG[1], option: "Warna", value: "Merah" },
];

// Hapus IMG[0] dari images → tautan IMG[0] ikut hilang
const pruned = pruneImageVariants(allVariants, [IMG[1], IMG[2]]);
ok("prune: hanya IMG[1] tersisa",   pruned.length === 1);
ok("prune: entri tersisa = IMG[1]", pruned[0].url === IMG[1]);

// Hapus semua → hasil kosong
ok("prune semua → []", pruneImageVariants(allVariants, [IMG[2]]).length === 0);

// Tidak ada perubahan → semua tersisa
const noChange = pruneImageVariants(allVariants, [IMG[0], IMG[1], IMG[2]]);
ok("prune tanpa perubahan → length 2", noChange.length === 2);

// ──────────────────────────────────────────────────────────────────────────────
console.log(`\n${failed === 0 ? "SEMUA TES imageVariants LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
if (failed > 0) process.exitCode = 1;
