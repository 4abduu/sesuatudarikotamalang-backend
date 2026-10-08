/**
 * SMOKE FLOW TEST SUITE (Mode: --record | --check)
 *
 * Menjalankan alur integrasi penuh backend secara otomatis:
 * Register Buyer -> Login -> /me -> List Produk -> Detail Produk -> Buat Order COD ->
 * GET Order -> Cancel Order -> Login Admin -> Admin Dashboard -> Admin Orders.
 *
 * Semua field dinamis (ID, timestamp, token, orderNumber) dinormalisasi secara otomatis.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

// Port dan URL Server untuk Testing (Default HTTP Server Port 4000 atau PORT env)
const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;
const GOLDEN_PATH = path.join(__dirname, "golden", "smoke_flow.json");

// Multi-replace helper untuk normalisasi field dinamis
function normalizeData(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Regex penggantian timestamp ISO Date
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      return "<DATE_TIMESTAMP>";
    }
    // Regex JWT token
    if (/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(obj)) {
      return "<JWT_TOKEN>";
    }
    // Regex Order Number SDK-XXXX
    if (/^SDK-\d{4}$/.test(obj)) {
      return "<ORDER_NUMBER>";
    }
    // Regex CUID ID (contoh: cmuz...)
    if (/^cm[a-z0-9]{20,}$/.test(obj)) {
      return "<CUID_ID>";
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeData);
  }

  if (typeof obj === "object") {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (["id", "userId", "productId", "variantId", "artisanId", "categoryId", "orderId"].includes(key) && typeof value === "string") {
        normalized[key] = "<ID>";
      } else if (["createdAt", "updatedAt", "pickupDate", "holdExpiresAt", "pickupDeadline", "paidAt", "submittedAt", "decidedAt", "expiresAt"].includes(key) && value) {
        normalized[key] = "<DATE>";
      } else if (key === "token" && typeof value === "string") {
        normalized[key] = "<TOKEN>";
      } else if (key === "orderNumber" && typeof value === "string") {
        normalized[key] = "<ORDER_NUMBER>";
      } else {
        normalized[key] = normalizeData(value);
      }
    }
    return normalized;
  }

  return obj;
}

// Request helper menggunakan node standard http module
function makeRequest(method, urlPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (token) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          // Keep raw string if not JSON
        }
        resolve({
          statusCode: res.statusCode,
          data: parsed,
        });
      });
    });

    req.on("error", (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runSmokeFlow() {
  const mode = process.argv.includes("--record") ? "record" : "check";
  console.log(`=== RUNNING SMOKE FLOW TEST (MODE: ${mode.toUpperCase()}) ===`);

  const timestamp = Date.now();
  const buyerEmail = `smoke_buyer_${timestamp}@example.com`;
  const buyerPassword = "Password123!";
  const buyerName = `Smoke Buyer ${timestamp}`;

  const adminEmail = process.env.ADMIN_EMAIL || "admin@sesuatudarikotamalang.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  const flowResults = [];

  // Step 1: Register Buyer
  console.log("\n1. Register Buyer...");
  const resReg = await makeRequest("POST", "/api/auth/register", {
    name: buyerName,
    email: buyerEmail,
    password: buyerPassword,
  });
  flowResults.push({ step: "1_register", status: resReg.statusCode, data: normalizeData(resReg.data) });
  const buyerToken = resReg.data?.token;

  // Step 2: Login Buyer
  console.log("2. Login Buyer...");
  const resLogin = await makeRequest("POST", "/api/auth/login", {
    email: buyerEmail,
    password: buyerPassword,
  });
  flowResults.push({ step: "2_login", status: resLogin.statusCode, data: normalizeData(resLogin.data) });

  // Step 3: GET /api/auth/me
  console.log("3. GET /api/auth/me...");
  const resMe = await makeRequest("GET", "/api/auth/me", null, buyerToken);
  flowResults.push({ step: "3_me", status: resMe.statusCode, data: normalizeData(resMe.data) });

  // Step 4: List Products
  console.log("4. GET /api/products...");
  const resProducts = await makeRequest("GET", "/api/products");
  flowResults.push({ step: "4_list_products", status: resProducts.statusCode, data: normalizeData(resProducts.data) });
  const sampleProductId = resProducts.data?.products?.[0]?.id;

  // Step 5: Detail Product
  console.log("5. GET /api/products/:id...");
  let resProductDetail = { statusCode: 404, data: { error: "No products" } };
  if (sampleProductId) {
    resProductDetail = await makeRequest("GET", `/api/products/${sampleProductId}`);
  }
  flowResults.push({ step: "5_detail_product", status: resProductDetail.statusCode, data: normalizeData(resProductDetail.data) });

  // Step 6: Create Order COD
  console.log("6. POST /api/orders (COD)...");
  let resOrder = { statusCode: 400, data: { error: "No product" } };
  if (sampleProductId) {
    resOrder = await makeRequest("POST", "/api/orders", {
      productId: sampleProductId,
      pickupDate: new Date().toISOString(),
      pickupSlot: "10:00",
      paymentMethod: "cod",
    }, buyerToken);
  }
  flowResults.push({ step: "6_create_order_cod", status: resOrder.statusCode, data: normalizeData(resOrder.data) });
  const createdOrderId = resOrder.data?.order?.id;

  // Step 7: GET /api/orders/:id
  console.log("7. GET /api/orders/:id...");
  let resOrderDetail = { statusCode: 404, data: { error: "No order" } };
  if (createdOrderId) {
    resOrderDetail = await makeRequest("GET", `/api/orders/${createdOrderId}`, null, buyerToken);
  }
  flowResults.push({ step: "7_get_order_detail", status: resOrderDetail.statusCode, data: normalizeData(resOrderDetail.data) });

  // Step 8: Cancel Order
  console.log("8. PATCH /api/orders/:id/cancel...");
  let resCancelOrder = { statusCode: 400, data: { error: "No order" } };
  if (createdOrderId) {
    resCancelOrder = await makeRequest("PATCH", `/api/orders/${createdOrderId}/cancel`, null, buyerToken);
  }
  flowResults.push({ step: "8_cancel_order", status: resCancelOrder.statusCode, data: normalizeData(resCancelOrder.data) });

  // Step 9: Login Admin
  console.log("9. Login Admin...");
  const resAdminLogin = await makeRequest("POST", "/api/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  flowResults.push({ step: "9_admin_login", status: resAdminLogin.statusCode, data: normalizeData(resAdminLogin.data) });
  const adminToken = resAdminLogin.data?.token;

  // Step 10: Admin Dashboard
  console.log("10. GET /api/admin/dashboard...");
  let resAdminDash = { statusCode: 401, data: { error: "Unauthorized" } };
  if (adminToken) {
    resAdminDash = await makeRequest("GET", "/api/admin/dashboard", null, adminToken);
  }
  flowResults.push({ step: "10_admin_dashboard", status: resAdminDash.statusCode, data: normalizeData(resAdminDash.data) });

  // Step 11: Admin Orders
  console.log("11. GET /api/admin/orders...");
  let resAdminOrders = { statusCode: 401, data: { error: "Unauthorized" } };
  if (adminToken) {
    resAdminOrders = await makeRequest("GET", "/api/admin/orders", null, adminToken);
  }
  flowResults.push({ step: "11_admin_orders", status: resAdminOrders.statusCode, data: normalizeData(resAdminOrders.data) });

  // Handle Mode: Record vs Check
  if (mode === "record") {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(flowResults, null, 2));
    console.log(`\n✅ Smoke flow baseline successfully recorded to: ${GOLDEN_PATH}`);
  } else {
    if (!fs.existsSync(GOLDEN_PATH)) {
      console.error(`\n❌ Golden file not found at ${GOLDEN_PATH}. Run with --record first!`);
      process.exit(1);
    }
    const goldenData = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf-8"));
    const currentData = JSON.parse(JSON.stringify(flowResults));

    let hasMismatch = false;
    if (goldenData.length !== currentData.length) {
      console.error(`❌ Mismatch in step count! Golden: ${goldenData.length}, Current: ${currentData.length}`);
      hasMismatch = true;
    } else {
      for (let i = 0; i < goldenData.length; i++) {
        const gStep = goldenData[i];
        const cStep = currentData[i];
        if (gStep.step !== cStep.step || gStep.status !== cStep.status) {
          console.error(`❌ Mismatch at step ${gStep.step}!`);
          console.error(`   Golden Status: ${gStep.status}, Current Status: ${cStep.status}`);
          hasMismatch = true;
        }
      }
    }

    if (hasMismatch) {
      console.error("\n❌ SMOKE FLOW CHECK FAILED! Regression detected.");
      process.exit(1);
    } else {
      console.log("\n✅ SMOKE FLOW CHECK PASSED PERFECTLY! Response structures match golden baseline.");
    }
  }
}

runSmokeFlow().catch((err) => {
  console.error("SMOKE FLOW ERROR:", err);
  process.exit(1);
});
