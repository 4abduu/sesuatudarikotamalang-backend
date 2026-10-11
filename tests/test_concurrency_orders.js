/**
 * CONCURRENCY TEST: createOrder Race Conditions
 *
 * Menguji bahwa pengecekan batas slot dan batas order aktif per user
 * berjalan atomik di dalam transaksi, mencegah race condition.
 *
 * TEST 1: 6 order paralel dari 6 user berbeda ke slot berkapasitas 3
 *   => tepat 3 sukses (201), sisanya 409 SLOT_FULL
 *
 * TEST 2: 5 order paralel dari 1 user (produk berbeda)
 *   => maks 3 sukses (201), sisanya 429
 *
 * PENTING: Jalankan di database TEST:
 *   set DATABASE_URL=mysql://root:@localhost:3306/sesuatu_darikota_malang_test
 *   node tests/test_concurrency_orders.js
 *
 * Prasyarat: server sudah jalan dengan DB test, seed sudah dijalankan,
 *            SLOT_CAPACITY=3 (atau default).
 */

const http = require("http");

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, urlPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json" },
    };
    if (token) options.headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) { /* raw */ }
        resolve({ statusCode: res.statusCode, data: parsed });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function registerAndLogin(email, password, name) {
  // Register (may fail if already exists, that's fine)
  await makeRequest("POST", "/api/auth/register", { name, email, password });
  // Login
  const res = await makeRequest("POST", "/api/auth/login", { email, password });
  if (res.statusCode !== 200 || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}

async function getFirstProduct(token) {
  const res = await makeRequest("GET", "/api/products", null, token);
  const products = res.data?.products || res.data?.data || [];
  if (!products.length) throw new Error("Tidak ada produk di database test. Jalankan seed dulu.");
  return products[0];
}

async function getProducts(token) {
  const res = await makeRequest("GET", "/api/products", null, token);
  return res.data?.products || res.data?.data || [];
}

function pickupDateTomorrow() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Cleanup: Cancel all active orders for a user so tests are idempotent
async function cancelActiveOrders(token) {
  const res = await makeRequest("GET", "/api/orders", null, token);
  const orders = res.data?.orders || [];
  for (const order of orders) {
    if (order.status === "menunggu_bayar") {
      await makeRequest("PATCH", `/api/orders/${order.id}/cancel`, null, token);
    }
  }
}

// ============================================================================
// TEST 1: Slot Capacity (6 concurrent orders -> slot capacity 3)
// ============================================================================
async function testSlotCapacity() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 1: Slot Capacity — 6 order paralel ke 1 slot (kapasitas 3)");
  console.log("=".repeat(70));

  const password = "TestPassword123";
  const pickupDate = pickupDateTomorrow();
  const pickupSlot = "10:00";

  // Register 6 different users
  const users = [];
  for (let i = 1; i <= 6; i++) {
    const email = `slot_test_user_${i}@test.com`;
    const name = `SlotTest User ${i}`;
    const token = await registerAndLogin(email, password, name);
    await cancelActiveOrders(token); // cleanup
    users.push({ email, token });
  }

  // Get a product to order
  const product = await getFirstProduct(users[0].token);

  console.log(`  Produk: ${product.name} (${product.id})`);
  console.log(`  Tanggal: ${pickupDate}, Slot: ${pickupSlot}`);
  console.log(`  Mengirim 6 order secara paralel...`);

  // Fire 6 concurrent orders
  const promises = users.map((u) =>
    makeRequest("POST", "/api/orders", {
      productId: product.id,
      pickupDate,
      pickupSlot,
      paymentMethod: "cod",
    }, u.token)
  );

  const results = await Promise.all(promises);

  const successes = results.filter((r) => r.statusCode === 201);
  const slotFulls = results.filter((r) => r.statusCode === 409);
  const others = results.filter((r) => r.statusCode !== 201 && r.statusCode !== 409);

  console.log(`\n  Hasil:`);
  console.log(`    201 (sukses)    : ${successes.length}`);
  console.log(`    409 (SLOT_FULL) : ${slotFulls.length}`);
  if (others.length) {
    console.log(`    Lainnya         : ${others.length}`);
    others.forEach((o) => console.log(`      ${o.statusCode}: ${JSON.stringify(o.data)}`));
  }

  // Verify SLOT_FULL responses have correct code
  for (const sf of slotFulls) {
    if (sf.data?.code !== "SLOT_FULL") {
      console.error(`    ❌ Response 409 tanpa code SLOT_FULL: ${JSON.stringify(sf.data)}`);
    }
  }

  // Cleanup: cancel successful orders
  for (const s of successes) {
    if (s.data?.order?.id) {
      const ownerToken = users.find((u) =>
        results[users.indexOf(u)]?.data?.order?.id === s.data.order.id
      )?.token;
      if (ownerToken) await makeRequest("PATCH", `/api/orders/${s.data.order.id}/cancel`, null, ownerToken);
    }
  }

  const pass = successes.length === 3 && slotFulls.length === 3 && others.length === 0;
  if (pass) {
    console.log("\n  ✅ TEST 1 PASSED: Tepat 3 sukses, 3 SLOT_FULL.");
  } else {
    console.error(`\n  ❌ TEST 1 FAILED: Harusnya 3 sukses + 3 SLOT_FULL, dapat ${successes.length} sukses + ${slotFulls.length} SLOT_FULL + ${others.length} lainnya.`);
  }

  return pass;
}

// ============================================================================
// TEST 2: Per-User Order Limit (5 concurrent orders from 1 user -> max 3)
// ============================================================================
async function testPerUserLimit() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 2: Per-User Limit — 5 order paralel dari 1 user (maks 3)");
  console.log("=".repeat(70));

  const email = "limit_test_user@test.com";
  const password = "TestPassword123";
  const token = await registerAndLogin(email, password, "LimitTest User");
  await cancelActiveOrders(token); // cleanup

  // Get multiple products (need up to 5 different products for 5 orders, or use same product with enough stock)
  const products = await getProducts(token);
  if (products.length < 1) {
    console.error("  ❌ SKIPPED: Tidak cukup produk di database test.");
    return false;
  }

  // Use different pickup slots/dates to avoid SLOT_FULL conflicts
  const pickupDate = pickupDateTomorrow();
  const slots = ["10:00", "11:00", "13:00", "15:00", "17:00"];

  console.log(`  User: ${email}`);
  console.log(`  Mengirim 5 order secara paralel ke slot berbeda...`);

  // Fire 5 concurrent orders (different slots to avoid SLOT_FULL)
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(
      makeRequest("POST", "/api/orders", {
        productId: products[0].id, // same product is fine, different slots
        pickupDate,
        pickupSlot: slots[i],
        paymentMethod: "cod",
      }, token)
    );
  }

  const results = await Promise.all(promises);

  const successes = results.filter((r) => r.statusCode === 201);
  const limitHits = results.filter((r) => r.statusCode === 429);
  const stockOuts = results.filter((r) => r.statusCode === 409 && r.data?.code !== "SLOT_FULL");
  const slotFulls = results.filter((r) => r.statusCode === 409 && r.data?.code === "SLOT_FULL");
  const others = results.filter((r) => ![201, 429, 409].includes(r.statusCode));

  console.log(`\n  Hasil:`);
  console.log(`    201 (sukses)         : ${successes.length}`);
  console.log(`    429 (limit per user) : ${limitHits.length}`);
  if (stockOuts.length) console.log(`    409 (stok habis)     : ${stockOuts.length}`);
  if (slotFulls.length) console.log(`    409 (SLOT_FULL)      : ${slotFulls.length}`);
  if (others.length) {
    console.log(`    Lainnya              : ${others.length}`);
    others.forEach((o) => console.log(`      ${o.statusCode}: ${JSON.stringify(o.data)}`));
  }

  // Cleanup: cancel successful orders
  for (const s of successes) {
    if (s.data?.order?.id) {
      await makeRequest("PATCH", `/api/orders/${s.data.order.id}/cancel`, null, token);
    }
  }

  // max 3 sukses, sisanya 429 (some might be 409 stock if stock runs out)
  const pass = successes.length <= 3 && limitHits.length >= 2 && others.length === 0;
  if (pass) {
    console.log(`\n  ✅ TEST 2 PASSED: ${successes.length} sukses (maks 3), ${limitHits.length} ditolak (429).`);
  } else {
    console.error(`\n  ❌ TEST 2 FAILED: ${successes.length} sukses, ${limitHits.length} ditolak 429. Seharusnya maks 3 sukses dan minimal 2 ditolak.`);
  }

  return pass;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  CONCURRENCY TEST: createOrder — Slot Capacity & Per-User Limit    ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  DB: Pastikan menggunakan database TEST (sesuatu_darikota_malang_test)`);

  let pass1 = false;
  let pass2 = false;

  try {
    pass1 = await testSlotCapacity();
  } catch (err) {
    console.error(`\n  ❌ TEST 1 ERROR: ${err.message}`);
  }

  try {
    pass2 = await testPerUserLimit();
  } catch (err) {
    console.error(`\n  ❌ TEST 2 ERROR: ${err.message}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log("RINGKASAN:");
  console.log(`  TEST 1 (Slot Capacity) : ${pass1 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`  TEST 2 (User Limit)    : ${pass2 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("=".repeat(70));

  process.exit(pass1 && pass2 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
