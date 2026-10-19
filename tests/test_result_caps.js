const assert = require("assert");
const prisma = require("../dist/lib/prisma").default;
const { listProducts } = require("../dist/controllers/productsController");
const { search } = require("../dist/controllers/searchController");
const { listOrders } = require("../dist/controllers/adminController");

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; resolve(res); return res; };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

async function main() {
  const original = {
    productFind: prisma.product.findMany,
    productCount: prisma.product.count,
    orderFind: prisma.order.findMany,
    orderCount: prisma.order.count,
    artisanFind: prisma.artisan.findMany,
    reviewGroup: prisma.review.groupBy,
    reviewFind: prisma.review.findMany,
  };
  let productArgs;
  let orderArgs;
  let artisanArgs;
  try {
    prisma.product.findMany = async (args) => { productArgs = args; return []; };
    prisma.product.count = async () => 0;
    prisma.order.findMany = async (args) => { orderArgs = args; return []; };
    prisma.order.count = async () => 0;
    prisma.artisan.findMany = async (args) => { artisanArgs = args; return []; };
    prisma.review.groupBy = async () => [];
    prisma.review.findMany = async () => [];

    await invoke(listProducts, { query: { page: "1", limit: "150" } });
    assert.strictEqual(productArgs.take, 100, "GET /products memotong limit menjadi 100");

    await invoke(listOrders, { query: { page: "1", limit: "150" } });
    assert.strictEqual(orderArgs.take, 100, "GET /admin/orders memotong limit menjadi 100");

    const longQuery = await invoke(search, { query: { q: "x".repeat(101) } });
    assert.strictEqual(longQuery.statusCode, 400, "GET /search menolak q lebih dari 100 karakter");

    await invoke(search, { query: { q: "produk" } });
    assert.strictEqual(productArgs.take, 50, "GET /search membatasi produk menjadi 50");
    assert.strictEqual(artisanArgs.take, 50, "GET /search membatasi kreator menjadi 50");
    console.log("LULUS  batas limit produk/order dan hasil pencarian");
  } finally {
    prisma.product.findMany = original.productFind;
    prisma.product.count = original.productCount;
    prisma.order.findMany = original.orderFind;
    prisma.order.count = original.orderCount;
    prisma.artisan.findMany = original.artisanFind;
    prisma.review.groupBy = original.reviewGroup;
    prisma.review.findMany = original.reviewFind;
  }
}

main().catch((error) => {
  console.error("GAGAL", error);
  process.exitCode = 1;
});
