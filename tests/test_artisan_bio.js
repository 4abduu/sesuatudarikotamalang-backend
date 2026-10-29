/**
 * test_artisan_bio.js
 * Langkah 7: Tes validasi dan semantik field bio.
 * - "" → disimpan null
 * - null → disimpan null
 * - spasi saja → disimpan null
 * - string valid → disimpan (trimmed)
 * - 2001 karakter → 400
 * - undefined → tidak mengubah bio
 */
require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default;
const artisanProfile = require("../dist/dal/artisanProfile");

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) { console.log(`LULUS  ${label}`); passed++; }
  else { console.error(`GAGAL  ${label}`); failed++; }
}

const CREATOR_ID = "bio_test_user";

async function setup() {
  await prisma.artisan.deleteMany({ where: { userId: CREATOR_ID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: CREATOR_ID } }).catch(() => {});
  await prisma.user.create({ data: { id: CREATOR_ID, name: "Bio Test User", email: `bio_${Date.now()}@t.local`, passwordHash: "h", role: "creator" } });
  await prisma.artisan.create({ data: {
    userId: CREATOR_ID,
    brandName: "Toko Bio",
    brandKey: "tokobio",
    status: "aktif",
    bio: "Bio awal",
  }});
}

async function cleanup() {
  await prisma.artisan.deleteMany({ where: { userId: CREATOR_ID } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: CREATOR_ID } }).catch(() => {});
}

const user = { id: CREATOR_ID, role: "creator" };

async function runTests() {
  await setup();

  // bio: "" → null
  const r1 = await artisanProfile.updateMyArtisanProfile(user, { bio: "" });
  ok("bio '' → null di DB", r1?.bio === null);

  // Kembalikan bio dulu
  await prisma.artisan.update({ where: { userId: CREATOR_ID }, data: { bio: "Bio awal" } });

  // bio: null → null
  const r2 = await artisanProfile.updateMyArtisanProfile(user, { bio: null });
  ok("bio null → null di DB", r2?.bio === null);

  // bio: hanya spasi → null
  await prisma.artisan.update({ where: { userId: CREATOR_ID }, data: { bio: "Bio awal" } });
  const r3 = await artisanProfile.updateMyArtisanProfile(user, { bio: "   " });
  ok("bio spasi saja → null di DB", r3?.bio === null);

  // bio: string valid dengan spasi tepi → trimmed
  const r4 = await artisanProfile.updateMyArtisanProfile(user, { bio: "  Bio baru  " });
  ok("bio valid → trimmed", r4?.bio === "Bio baru");

  // bio: 2000 karakter → tersimpan
  const bio2000 = "x".repeat(2000);
  const r5 = await artisanProfile.updateMyArtisanProfile(user, { bio: bio2000 });
  ok("bio 2000 char → tersimpan", r5?.bio === bio2000);

  // bio: 2001 karakter → 400
  try {
    await artisanProfile.updateMyArtisanProfile(user, { bio: "x".repeat(2001) });
    ok("bio 2001 char → 400", false);
  } catch (e) {
    ok("bio 2001 char → 400", e?.status === 400);
  }

  // bio: undefined → tidak mengubah nilai sebelumnya
  const beforeUndefined = await prisma.artisan.findUnique({ where: { userId: CREATOR_ID }, select: { bio: true } });
  await artisanProfile.updateMyArtisanProfile(user, { brandName: "Toko Bio" }); // tidak kirim bio
  const afterUndefined = await prisma.artisan.findUnique({ where: { userId: CREATOR_ID }, select: { bio: true } });
  ok("bio undefined → tidak berubah", beforeUndefined?.bio === afterUndefined?.bio);

  await cleanup();
}

runTests().then(() => {
  console.log(`\n${failed === 0 ? "SEMUA TES artisan bio LULUS" : `${failed} tes GAGAL`} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}).catch((err) => {
  console.error("GAGAL (unhandled)", err);
  process.exitCode = 1;
});
