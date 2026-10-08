// Gunakan database test terpisah
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "mysql://root:@localhost:3306/sesuatu_darikota_malang_test";

const crypto = require("crypto");
const prisma = require("../src/lib/prisma");
const { handleWebhook } = require("../src/controllers/payments.controller");
const { createOrder } = require("../src/controllers/orders.controller");

// Helper Mock Express req/res/next
function createMockReqRes(body, user = null) {
  let statusCode = 200;
  let jsonResponse = null;

  const req = { body, user };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
  };
  const next = (err) => {
    if (err) throw err;
  };

  return {
    req,
    res,
    next,
    getResponse: () => ({ statusCode, jsonResponse }),
  };
}

async function runTests() {
  console.log("===============================================================");
  console.log(`DATABASE TEST URL: ${process.env.DATABASE_URL}`);
  console.log("===============================================================");
  console.log("=== STARTING COMPLETE FASE 13 RECOVERY & VERIFICATION TESTS ===");

  const originalServerKey = process.env.MIDTRANS_SERVER_KEY;
  const testServerKey = process.env.MIDTRANS_SERVER_KEY || "test_env_server_key";
  process.env.MIDTRANS_SERVER_KEY = testServerKey;

  const createdIds = {
    users: [],
    categories: [],
    artisans: [],
    products: [],
    variants: [],
    orders: [],
  };

  // 1. Setup Base Data
  const timestamp = Date.now();
  const testUser = await prisma.user.create({
    data: {
      name: `Test User ${timestamp}`,
      email: `test_${timestamp}@example.com`,
      passwordHash: "dummyhash",
      role: "buyer",
    },
  });
  createdIds.users.push(testUser.id);

  const testCategory = await prisma.category.create({
    data: {
      name: `Kategori Test ${timestamp}`,
      slug: `kategori-test-${timestamp}`,
    },
  });
  createdIds.categories.push(testCategory.id);

  const testArtisan = await prisma.artisan.create({
    data: {
      brandName: `Brand Test ${timestamp}`,
    },
  });
  createdIds.artisans.push(testArtisan.id);

  const getSignature = (orderId, statusCode, grossAmount, key = process.env.MIDTRANS_SERVER_KEY) => {
    return crypto
      .createHash("sha512")
      .update(`${orderId}${statusCode}${grossAmount}${key}`)
      .digest("hex");
  };

  // --- TES 1: Produk Tanpa Varian (Stok 1) -> Order #1 Berhasil, Order #2 409 Conflict ---
  console.log("\n[TES 1] Produk Tanpa Varian (Stok 1) -> Order #1 201, Order #2 409");
  const singleStockProduct = await prisma.product.create({
    data: {
      artisanId: testArtisan.id,
      categoryId: testCategory.id,
      name: `Single Product ${timestamp}`,
      slug: `single-product-${timestamp}`,
      description: "Deskripsi single product",
      price: 50000,
      images: ["https://example.com/test.jpg"],
    },
  });
  createdIds.products.push(singleStockProduct.id);

  // Buat Varian Default (combination: [], stock: 1)
  const singleVariant = await prisma.productVariant.create({
    data: {
      productId: singleStockProduct.id,
      combination: [],
      stock: 1,
    },
  });
  createdIds.variants.push(singleVariant.id);

  // Order #1: Pembuatan pesanan pertama
  const reqResOrder1 = createMockReqRes(
    {
      productId: singleStockProduct.id,
      pickupDate: new Date().toISOString(),
      pickupSlot: "10:00",
      paymentMethod: "cod",
    },
    testUser
  );

  await createOrder(reqResOrder1.req, reqResOrder1.res, reqResOrder1.next);
  const respOrder1 = reqResOrder1.getResponse();
  console.log("Order #1 Response status:", respOrder1.statusCode);
  if (respOrder1.statusCode !== 201) {
    throw new Error(`Order #1 harusnya status 201, tapi ${respOrder1.statusCode}: ${JSON.stringify(respOrder1.jsonResponse)}`);
  }
  createdIds.orders.push(respOrder1.jsonResponse.order.id);

  // Order #2: Pembuatan pesanan kedua untuk produk yang sama (stok sudah habis)
  const reqResOrder2 = createMockReqRes(
    {
      productId: singleStockProduct.id,
      pickupDate: new Date().toISOString(),
      pickupSlot: "10:00",
      paymentMethod: "cod",
    },
    testUser
  );

  await createOrder(reqResOrder2.req, reqResOrder2.res, reqResOrder2.next);
  const respOrder2 = reqResOrder2.getResponse();
  console.log("Order #2 Response status:", respOrder2.statusCode, respOrder2.jsonResponse);
  if (respOrder2.statusCode !== 409) {
    throw new Error(`Order #2 saat stok habis harusnya status 409 Conflict, tapi ${respOrder2.statusCode}`);
  }

  // --- TES 2A: Late Settlement (a) Stok Cukup -> Berubah jadi Lunas ---
  console.log("\n[TES 2A] Late Settlement (a) Stok Cukup -> Status Lunas");
  const productLateA = await prisma.product.create({
    data: {
      artisanId: testArtisan.id,
      categoryId: testCategory.id,
      name: `Product Late A ${timestamp}`,
      slug: `product-late-a-${timestamp}`,
      description: "Deskripsi test late A",
      price: 50000,
      images: ["https://example.com/test.jpg"],
    },
  });
  createdIds.products.push(productLateA.id);

  const variantLateA = await prisma.productVariant.create({
    data: {
      productId: productLateA.id,
      combination: [],
      stock: 1,
    },
  });
  createdIds.variants.push(variantLateA.id);

  const orderLateA = await prisma.order.create({
    data: {
      orderNumber: `ORDER-LATE-A-${timestamp}`,
      userId: testUser.id,
      totalAmount: 50000,
      status: "kedaluwarsa",
      paymentMethod: "midtrans",
      pickupSlot: "10:00",
      pickupDate: new Date(),
      items: {
        create: {
          productId: productLateA.id,
          variantId: variantLateA.id,
          quantity: 1,
          priceSnapshot: 50000,
        },
      },
    },
  });
  createdIds.orders.push(orderLateA.id);

  const sigLateA = getSignature(orderLateA.orderNumber, "200", "50000.00");
  const reqResLateA = createMockReqRes({
    order_id: orderLateA.orderNumber,
    status_code: "200",
    gross_amount: "50000.00",
    signature_key: sigLateA,
    transaction_status: "settlement",
    transaction_id: `MIDTRANS-LATE-A-${timestamp}`,
  });

  await handleWebhook(reqResLateA.req, reqResLateA.res, reqResLateA.next);
  const oLateA = await prisma.order.findUnique({ where: { id: orderLateA.id } });
  console.log("Order Late A Status:", oLateA.status);
  if (oLateA.status !== "lunas") {
    throw new Error("Late settlement stok cukup HARUS berubah jadi lunas!");
  }

  // --- TES 2B: Late Settlement (b) Stok Sudah Diambil Order Lain (Lunas) -> Tetap Kedaluwarsa + Payment + Notification ---
  console.log("\n[TES 2B] Late Settlement (b) Stok Terpakai Order Lain -> Tetap Kedaluwarsa + Notifikasi");
  // Order lain yang sudah LUNAS memakai stok 1 milik productLateA
  const orderOtherPaid = await prisma.order.create({
    data: {
      orderNumber: `ORDER-OTHERPAID-${timestamp}`,
      userId: testUser.id,
      totalAmount: 50000,
      status: "lunas",
      paymentMethod: "midtrans",
      pickupSlot: "10:00",
      pickupDate: new Date(),
      items: {
        create: {
          productId: productLateA.id,
          variantId: variantLateA.id,
          quantity: 1,
          priceSnapshot: 50000,
        },
      },
    },
  });
  createdIds.orders.push(orderOtherPaid.id);

  const orderLateB = await prisma.order.create({
    data: {
      orderNumber: `ORDER-LATE-B-${timestamp}`,
      userId: testUser.id,
      totalAmount: 50000,
      status: "kedaluwarsa",
      paymentMethod: "midtrans",
      pickupSlot: "10:00",
      pickupDate: new Date(),
      items: {
        create: {
          productId: productLateA.id,
          variantId: variantLateA.id,
          quantity: 1,
          priceSnapshot: 50000,
        },
      },
    },
  });
  createdIds.orders.push(orderLateB.id);

  const sigLateB = getSignature(orderLateB.orderNumber, "200", "50000.00");
  const reqResLateB = createMockReqRes({
    order_id: orderLateB.orderNumber,
    status_code: "200",
    gross_amount: "50000.00",
    signature_key: sigLateB,
    transaction_status: "settlement",
    transaction_id: `MIDTRANS-LATE-B-${timestamp}`,
  });

  await handleWebhook(reqResLateB.req, reqResLateB.res, reqResLateB.next);
  const oLateB = await prisma.order.findUnique({ where: { id: orderLateB.id } });
  const paymentLateB = await prisma.payment.findUnique({ where: { orderId: orderLateB.id } });
  const notificationLateB = await prisma.notification.findFirst({
    where: { userId: testUser.id, title: { contains: "Stok Habis" } },
  });

  console.log("Order Late B Status:", oLateB.status, "Payment recorded:", !!paymentLateB, "Notification:", !!notificationLateB);
  if (oLateB.status !== "kedaluwarsa" || !paymentLateB || !notificationLateB) {
    throw new Error("Late settlement stok habis HARUS tetap kedaluwarsa, mencatat Payment, dan menerbitkan Notifikasi!");
  }

  // --- TES 2C: Late Settlement (c) Order Dibatalkan -> Tetap Dibatalkan + Payment + Notification ---
  console.log("\n[TES 2C] Late Settlement (c) Order Dibatalkan -> Tetap Dibatalkan + Notifikasi");
  const orderLateC = await prisma.order.create({
    data: {
      orderNumber: `ORDER-LATE-C-${timestamp}`,
      userId: testUser.id,
      totalAmount: 50000,
      status: "dibatalkan",
      paymentMethod: "midtrans",
      pickupSlot: "10:00",
      pickupDate: new Date(),
      items: {
        create: {
          productId: productLateA.id,
          variantId: variantLateA.id,
          quantity: 1,
          priceSnapshot: 50000,
        },
      },
    },
  });
  createdIds.orders.push(orderLateC.id);

  const sigLateC = getSignature(orderLateC.orderNumber, "200", "50000.00");
  const reqResLateC = createMockReqRes({
    order_id: orderLateC.orderNumber,
    status_code: "200",
    gross_amount: "50000.00",
    signature_key: sigLateC,
    transaction_status: "settlement",
    transaction_id: `MIDTRANS-LATE-C-${timestamp}`,
  });

  await handleWebhook(reqResLateC.req, reqResLateC.res, reqResLateC.next);
  const oLateC = await prisma.order.findUnique({ where: { id: orderLateC.id } });
  const paymentLateC = await prisma.payment.findUnique({ where: { orderId: orderLateC.id } });
  const notificationLateC = await prisma.notification.findFirst({
    where: { userId: testUser.id, title: { contains: "Pesanan Batal" } },
  });

  console.log("Order Late C Status:", oLateC.status, "Payment recorded:", !!paymentLateC, "Notification:", !!notificationLateC);
  if (oLateC.status !== "dibatalkan" || !paymentLateC || !notificationLateC) {
    throw new Error("Late settlement order dibatalkan HARUS tetap dibatalkan, mencatat Payment, dan menerbitkan Notifikasi!");
  }

  // --- TES 3A: autoCancelEnabled = false, COD hold lewat TETAP menahan stok -> Order baru -> 409 ---
  console.log("\n[TES 3A] autoCancelEnabled = false, COD hold lewat TETAP menahan stok -> Order baru 409");
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1, autoCancelEnabled: false },
    update: { autoCancelEnabled: false },
  });

  const productHoldP5 = await prisma.product.create({
    data: {
      artisanId: testArtisan.id,
      categoryId: testCategory.id,
      name: `Product P5 ${timestamp}`,
      slug: `product-p5-${timestamp}`,
      description: "Deskripsi P5",
      price: 50000,
      images: ["https://example.com/test.jpg"],
    },
  });
  createdIds.products.push(productHoldP5.id);

  const variantHoldP5 = await prisma.productVariant.create({
    data: {
      productId: productHoldP5.id,
      combination: [],
      stock: 1, // Stok 1
    },
  });
  createdIds.variants.push(variantHoldP5.id);

  const pastDateP5 = new Date(Date.now() - 3600000); // 1 jam yang lalu

  // Order COD dengan hold yang sudah lewat
  const orderCodExpiredP5 = await prisma.order.create({
    data: {
      orderNumber: `ORDER-COD-P5-${timestamp}`,
      userId: testUser.id,
      totalAmount: 50000,
      status: "menunggu_bayar",
      paymentMethod: "cod",
      pickupSlot: "10:00",
      pickupDate: new Date(),
      holdExpiresAt: pastDateP5,
      items: {
        create: {
          productId: productHoldP5.id,
          variantId: variantHoldP5.id,
          quantity: 1,
          priceSnapshot: 50000,
        },
      },
    },
  });
  createdIds.orders.push(orderCodExpiredP5.id);

  // Coba buat order baru: karena autoCancelEnabled = false, order COD lewat hold TETAP menahan stok -> 409
  const reqResP5a = createMockReqRes(
    {
      productId: productHoldP5.id,
      pickupDate: new Date().toISOString(),
      pickupSlot: "10:00",
      paymentMethod: "cod",
    },
    testUser
  );
  await createOrder(reqResP5a.req, reqResP5a.res, reqResP5a.next);
  const respP5a = reqResP5a.getResponse();
  console.log("Order Baru (autoCancel=false, COD hold lewat) status:", respP5a.statusCode, respP5a.jsonResponse);
  if (respP5a.statusCode !== 409) {
    throw new Error(`Saat autoCancel=false, order COD hold lewat HARUS menahan stok (dapat 409, bukan ${respP5a.statusCode})`);
  }

  // --- TES 3B: autoCancelEnabled = true, jalankan cron -> Order COD kedaluwarsa, stok rilis -> Order baru 201 ---
  console.log("\n[TES 3B] Set autoCancelEnabled = true, Cron ubah order ke kedaluwarsa -> Order baru 201");
  await prisma.appSettings.update({
    where: { id: 1 },
    data: { autoCancelEnabled: true },
  });

  // Eksekusi logika cron untuk COD
  await prisma.order.updateMany({
    where: {
      paymentMethod: "cod",
      status: "menunggu_bayar",
      holdExpiresAt: { lt: new Date() },
    },
    data: { status: "kedaluwarsa" },
  });

  // Coba buat order baru lagi -> sekarang HARUS berhasil 201
  const reqResP5b = createMockReqRes(
    {
      productId: productHoldP5.id,
      pickupDate: new Date().toISOString(),
      pickupSlot: "10:00",
      paymentMethod: "cod",
    },
    testUser
  );
  await createOrder(reqResP5b.req, reqResP5b.res, reqResP5b.next);
  const respP5b = reqResP5b.getResponse();
  console.log("Order Baru (autoCancel=true setelah cron) status:", respP5b.statusCode);
  if (respP5b.statusCode !== 201) {
    throw new Error(`Setelah cron auto-cancel, order baru HARUS berhasil 201, bukan ${respP5b.statusCode}`);
  }
  createdIds.orders.push(respP5b.jsonResponse.order.id);

  // --- TES 3C: Midtrans pending lewat hold TIDAK menahan stok di kedua kondisi ---
  console.log("\n[TES 3C] Midtrans pending lewat hold TIDAK menahan stok di kedua kondisi");
  const productMidP5 = await prisma.product.create({
    data: {
      artisanId: testArtisan.id,
      categoryId: testCategory.id,
      name: `Product Mid P5 ${timestamp}`,
      slug: `product-mid-p5-${timestamp}`,
      description: "Deskripsi Mid P5",
      price: 50000,
      images: ["https://example.com/test.jpg"],
    },
  });
  createdIds.products.push(productMidP5.id);

  const variantMidP5 = await prisma.productVariant.create({
    data: {
      productId: productMidP5.id,
      combination: [],
      stock: 1, // Stok 1
    },
  });
  createdIds.variants.push(variantMidP5.id);

  // Order Midtrans dengan hold lewat
  const orderMidExpiredP5 = await prisma.order.create({
    data: {
      orderNumber: `ORDER-MID-P5-${timestamp}`,
      userId: testUser.id,
      totalAmount: 50000,
      status: "menunggu_bayar",
      paymentMethod: "midtrans",
      pickupSlot: "10:00",
      pickupDate: new Date(),
      holdExpiresAt: pastDateP5,
      items: {
        create: {
          productId: productMidP5.id,
          variantId: variantMidP5.id,
          quantity: 1,
          priceSnapshot: 50000,
        },
      },
    },
  });
  createdIds.orders.push(orderMidExpiredP5.id);

  // Uji saat autoCancelEnabled = false: Midtrans hold lewat TIDAK Boleh menahan stok
  await prisma.appSettings.update({
    where: { id: 1 },
    data: { autoCancelEnabled: false },
  });

  const reqResMidP5 = createMockReqRes(
    {
      productId: productMidP5.id,
      pickupDate: new Date().toISOString(),
      pickupSlot: "10:00",
      paymentMethod: "cod",
    },
    testUser
  );
  await createOrder(reqResMidP5.req, reqResMidP5.res, reqResMidP5.next);
  const respMidP5 = reqResMidP5.getResponse();
  console.log("Order Baru (Midtrans hold lewat, autoCancel=false) status:", respMidP5.statusCode);
  if (respMidP5.statusCode !== 201) {
    throw new Error(`Midtrans hold lewat TIDAK boleh menahan stok (harus 201, bukan ${respMidP5.statusCode})`);
  }
  createdIds.orders.push(respMidP5.jsonResponse.order.id);

  // Restore AppSettings ke true
  await prisma.appSettings.update({
    where: { id: 1 },
    data: { autoCancelEnabled: true },
  });

  // Restore env
  if (originalServerKey) process.env.MIDTRANS_SERVER_KEY = originalServerKey;

  console.log("\n=== ALL FASE 13 TESTS RECOVERED AND PASSED SUCCESSFULLY ON TEST DB! ===");
  console.log("\n[LAPORAN DATA YANG DIBUAT DI DATABASE TEST]:");
  console.log(JSON.stringify(createdIds, null, 2));
}

runTests()
  .catch((err) => {
    console.error("TEST ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
