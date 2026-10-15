/**
 * test_ai_integration.js — Integration test untuk POST /api/ai/story-draft
 * Memanggil server yang sedang berjalan dengan API Gemini sungguhan dari .env
 *
 * Prasyarat:
 *   1. Server backend jalan (npm run dev)
 *   2. GEMINI_API_KEY ada di .env
 *   3. Ada akun creator/admin di DB (dari seed; pakai SEED_ADMIN_EMAIL di env)
 *
 * Jalankan:
 *   node tests/test_ai_integration.js
 *   PORT=4000 node tests/test_ai_integration.js  (ubah port jika perlu)
 */

require("dotenv/config");
const http = require("http");

const PORT = process.env.PORT || 4000;
const BASE = `http://localhost:${PORT}`;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const ADMIN_PASS  = process.env.SEED_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASS) {
  console.error("GAGAL: SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD harus ada di .env");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("GAGAL: GEMINI_API_KEY tidak ditemukan di .env");
  process.exit(1);
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "localhost",
      port: PORT,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  console.log(`\nIntegration test AI story-draft -> ${BASE}\n`);

  // 1. Login sebagai admin
  process.stdout.write("1. Login admin... ");
  const loginRes = await request("POST", "/api/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.log(`GAGAL (status ${loginRes.status})`);
    console.error(loginRes.body);
    process.exit(1);
  }
  const token = loginRes.body.token;
  console.log(`OK (role: ${loginRes.body.user.role})`);

  // 2. Panggil AI story-draft dengan input valid
  process.stdout.write("2. POST /api/ai/story-draft (input valid)... ");
  const aiRes = await request(
    "POST",
    "/api/ai/story-draft",
    {
      productName: "Pin Enamel Jendela Kayutangan",
      category: "Pin Enamel",
      motif: "jendela biru tua dengan ornamen bunga khas arsitektur Heritage Kayutangan",
      proses: "sketsa tangan lalu dicetak enamel manual satu per satu",
      inspirasi: "jalan Basuki Rahmat sore hari saat lampu mulai menyala",
    },
    token
  );
  if (aiRes.status === 200 && aiRes.body.draft) {
    console.log("OK");
    console.log(`   Judul : ${aiRes.body.draft.judul}`);
    const preview = aiRes.body.draft.isi.slice(0, 120).replace(/\n/g, " ");
    console.log(`   Isi   : ${preview}...`);
    console.log(`   Meta  : ${JSON.stringify(aiRes.body.meta)}`);
  } else {
    console.log(`GAGAL (status ${aiRes.status})`);
    console.error(aiRes.body);
    process.exit(1);
  }

  // 3. Panggil dengan input tidak lengkap (hanya 1 poin alias)
  process.stdout.write("3. POST /api/ai/story-draft (hanya 1 alias poin)... ");
  const aiAlias = await request(
    "POST",
    "/api/ai/story-draft",
    {
      inspirasi: "gang sempit di belakang Pasar Besar yang penuh kenangan masa kecil",
    },
    token
  );
  if (aiAlias.status === 200 && aiAlias.body.draft) {
    console.log(`OK (judul: ${aiAlias.body.draft.judul})`);
  } else {
    console.log(`GAGAL (status ${aiAlias.status})`);
    console.error(aiAlias.body);
    process.exit(1);
  }

  // 4. Tanpa token -> 401
  process.stdout.write("4. Tanpa token -> 401... ");
  const noAuth = await request("POST", "/api/ai/story-draft", { motif: "singa" });
  if (noAuth.status === 401) {
    console.log("OK");
  } else {
    console.log(`GAGAL (status ${noAuth.status}, expected 401)`);
    process.exit(1);
  }

  // 5. Input kosong -> 422 VALIDATION_ERROR
  process.stdout.write("5. Input kosong -> 422 VALIDATION_ERROR... ");
  const empty = await request("POST", "/api/ai/story-draft", { productName: "Pin" }, token);
  if (empty.status === 422 && empty.body.code === "VALIDATION_ERROR") {
    console.log("OK");
  } else {
    console.log(`GAGAL (status ${empty.status}, code: ${empty.body.code})`);
    process.exit(1);
  }

  console.log("\nSEMUA INTEGRATION TEST AI LULUS\n");
})();
