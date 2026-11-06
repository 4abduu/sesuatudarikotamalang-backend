require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const products = require("../dist/controllers/productsController");
const admin = require("../dist/controllers/adminController");

function mock(body = {}, user = null, params = {}, query = {}) {
  let statusCode = 200;
  let response = null;
  return {
    req: { body, user, params, query },
    res: {
      status(code) { statusCode = code; return this; },
      json(payload) { response = payload; return this; },
    },
    next(error) { if (error) throw error; },
    result() { return { statusCode, response }; },
  };
}

(async () => {
  const stamp = Date.now();
  const user = await prisma.user.create({ data: { name: `Approval ${stamp}`, email: `approval-${stamp}@test.local`, passwordHash: "test" } });
  const artisan = await prisma.artisan.create({ data: { userId: user.id, brandName: `Approval ${stamp}`, status: "aktif" } });
  const category = await prisma.category.create({ data: { name: `Approval ${stamp}`, slug: `approval-${stamp}` } });
  let productId;
  try {
    const create = mock({ name: "Produk Menunggu", categoryId: category.id, description: "Deskripsi produk approval", price: 15000, images: ["https://example.com/approval.jpg"], stock: 3 }, { id: user.id, role: "creator" });
    await products.createProduct(create.req, create.res, create.next);
    assert.strictEqual(create.result().statusCode, 201);
    productId = create.result().response.product.id;
    assert.strictEqual(create.result().response.product.approvalStatus, "menunggu");
    assert.strictEqual(create.result().response.product.displayStatus, "menunggu");

    const mine = mock({}, { id: user.id, role: "creator" });
    await products.listMyProducts(mine.req, mine.res, mine.next);
    assert.strictEqual(mine.result().response.products.find((item) => item.id === productId).displayStatus, "menunggu");

    const publicList = mock({}, null, {}, { search: "Produk Menunggu" });
    await products.listProducts(publicList.req, publicList.res, publicList.next);
    assert.strictEqual(publicList.result().response.products.some((item) => item.id === productId), false);

    const approve = mock({}, { id: "admin", role: "admin" }, { id: productId });
    await admin.approveProduct(approve.req, approve.res, approve.next);
    assert.strictEqual(approve.result().statusCode, 200);
    assert.strictEqual(approve.result().response.product.displayStatus, "aktif");

    const hide = mock({ reason: "Perlu perbaikan sementara" }, { id: "admin", role: "admin" }, { id: productId });
    await admin.hideProduct(hide.req, hide.res, hide.next);
    assert.strictEqual(hide.result().statusCode, 200);
    assert.strictEqual(hide.result().response.product.displayStatus, "disembunyikan");

    const withdraw = mock({}, { id: "admin", role: "admin" }, { id: productId });
    await admin.withdrawProduct(withdraw.req, withdraw.res, withdraw.next);
    assert.strictEqual(withdraw.result().statusCode, 200);
    assert.strictEqual(withdraw.result().response.product.displayStatus, "ditarik");

    const locked = mock({}, { id: user.id, role: "creator" }, { id: productId });
    let lockedError;
    try { await products.deleteProduct(locked.req, locked.res, locked.next); } catch (error) { lockedError = error; }
    assert.strictEqual(lockedError.status, 403);
    assert.strictEqual(lockedError.code, "PRODUCT_LOCKED");
    console.log("LULUS product approvals: pending, publikasi, hide, withdraw, dan lock kreator");
  } finally {
    if (productId) await prisma.product.delete({ where: { id: productId } });
    await prisma.artisan.delete({ where: { id: artisan.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
})().catch((error) => {
  console.error("GAGAL", error);
  process.exit(1);
});
