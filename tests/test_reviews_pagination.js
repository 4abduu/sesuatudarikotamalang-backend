const assert = require("assert");
const prisma = require("../dist/lib/prisma").default;
const { listReviews } = require("../dist/controllers/reviewsController");
const { listAdminReviews } = require("../dist/controllers/adminController");

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
    findMany: prisma.review.findMany,
    count: prisma.review.count,
    aggregate: prisma.review.aggregate,
    groupBy: prisma.review.groupBy,
  };
  const rows = [
    { rating: 5, status: "tampil", user: null, product: null },
    { rating: 3, status: "tampil", user: null, product: null },
  ];
  try {
    prisma.review.findMany = async () => rows;
    prisma.review.count = async () => 5;
    prisma.review.aggregate = async () => ({ _avg: { rating: 4 } });
    prisma.review.groupBy = async () => [
      { status: "tampil", _count: { _all: 4 } },
      { status: "disembunyikan", _count: { _all: 1 } },
    ];

    const oldPublic = await invoke(listReviews, { query: {} });
    assert.strictEqual(oldPublic.body.pagination, undefined, "tanpa parameter pagination respons publik tetap lama");

    const publicPage = await invoke(listReviews, { query: { page: "1", limit: "150" } });
    assert.deepStrictEqual(publicPage.body.pagination, { page: 1, limit: 100, total: 5, totalPages: 1 });

    const adminPage = await invoke(listAdminReviews, { query: { page: "1", limit: "150" } });
    assert.deepStrictEqual(adminPage.body.pagination, { page: 1, limit: 100, total: 5, totalPages: 1 });
    assert.strictEqual(adminPage.body.summary.totalReviews, 5);
    console.log("LULUS  paginasi ulasan opsional dan cap limit 100");
  } finally {
    prisma.review.findMany = original.findMany;
    prisma.review.count = original.count;
    prisma.review.aggregate = original.aggregate;
    prisma.review.groupBy = original.groupBy;
  }
}

main().catch((error) => {
  console.error("GAGAL", error);
  process.exitCode = 1;
});
