require("./helpers/requireTestDb")();

const assert = require("assert");
const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { listMyOrders, getOrderForUser } = require("../dist/dal/orders");
const { listMyNotifications, markNotificationRead } = require("../dist/dal/notifications");
const { listMyReviews, createReviewForUser } = require("../dist/dal/reviews");
const { getMyApplications, getMyArtisanProfile, updateMyArtisanProfile } = require("../dist/dal/artisanProfile");
const { getEditableProduct } = require("../dist/dal/productOwnership");

const expectError = async (promise, status, code) => {
  try {
    await promise;
    assert.fail("seharusnya gagal");
  } catch (error) {
    assert.strictEqual(error.status, status);
    assert.strictEqual(error.code, code);
  }
};

(async () => {
  const tag = Date.now();
  const users = await Promise.all([
    prisma.user.create({ data: { name: `DAL A ${tag}`, email: `dal-a-${tag}@test.local`, passwordHash: "hash", role: "buyer" } }),
    prisma.user.create({ data: { name: `DAL B ${tag}`, email: `dal-b-${tag}@test.local`, passwordHash: "hash", role: "buyer" } }),
    prisma.user.create({ data: { name: `DAL Admin ${tag}`, email: `dal-admin-${tag}@test.local`, passwordHash: "hash", role: "admin" } }),
  ]);
  const [userA, userB, admin] = users;
  const artisanA = await prisma.artisan.create({ data: { userId: userA.id, brandName: `DAL Artisan A ${tag}`, status: "aktif" } });
  const artisanB = await prisma.artisan.create({ data: { userId: userB.id, brandName: `DAL Artisan B ${tag}`, status: "aktif" } });
  const category = await prisma.category.create({ data: { name: `DAL Category ${tag}`, slug: `dal-category-${tag}` } });
  const productA = await prisma.product.create({ data: { artisanId: artisanA.id, categoryId: category.id, name: `DAL Product A ${tag}`, slug: `dal-product-a-${tag}`, description: "A", price: 1000, images: [], variants: { create: [{ combination: [], stock: 2 }] } } });
  const productB = await prisma.product.create({ data: { artisanId: artisanB.id, categoryId: category.id, name: `DAL Product B ${tag}`, slug: `dal-product-b-${tag}`, description: "B", price: 1000, images: [], variants: { create: [{ combination: [], stock: 2 }] } } });
  const variantB = await prisma.productVariant.findFirst({ where: { productId: productB.id } });
  const orderA = await prisma.order.create({ data: { orderNumber: `SDK-DAL-A-${tag}`, userId: userA.id, paymentMethod: "cod", totalAmount: 1000, pickupDate: new Date(), pickupSlot: "10:00" } });
  const orderB = await prisma.order.create({ data: { orderNumber: `SDK-DAL-B-${tag}`, userId: userB.id, paymentMethod: "cod", totalAmount: 1000, pickupDate: new Date(), pickupSlot: "10:00", items: { create: [{ productId: productB.id, variantId: variantB.id, priceSnapshot: 1000 }] } } });
  const notificationA = await prisma.notification.create({ data: { userId: userA.id, title: "A", body: "A" } });
  const notificationB = await prisma.notification.create({ data: { userId: userB.id, title: "B", body: "B" } });
  const applicationB = await prisma.artisanApplication.create({ data: { userId: userB.id, applicantName: "B", contact: "081", brandName: "B", description: "B" } });
  const reviewB = await prisma.review.create({ data: { userId: userB.id, productId: productB.id, rating: 5, comment: "B" } });

  try {
    const ordersA = await listMyOrders(userA);
    assert(ordersA.every((order) => order.userId === userA.id));
    await expectError(getOrderForUser(userA, orderB.id), 404, "NOT_FOUND");
    assert.strictEqual((await getOrderForUser(admin, orderB.id)).id, orderB.id);

    const notificationsA = await listMyNotifications(userA);
    assert(notificationsA.every((notification) => notification.userId === userA.id));
    await expectError(markNotificationRead(userA, notificationB.id), 404, "NOT_FOUND");
    await markNotificationRead(userA, notificationA.id);
    assert.strictEqual((await prisma.notification.findUnique({ where: { id: notificationB.id } })).isRead, false);

    assert((await listMyReviews(userA)).every((review) => review.userId === userA.id));
    await expectError(createReviewForUser(userA, { orderItemId: (await prisma.orderItem.findFirst({ where: { orderId: orderB.id } })).id, rating: 5, comment: "cross" }), 404, "NOT_FOUND");

    assert((await getMyApplications(userA)).every((application) => application.userId === userA.id));
    assert.strictEqual((await getMyArtisanProfile(userA)).id, artisanA.id);
    await prisma.artisan.update({ where: { id: artisanB.id }, data: { status: "nonaktif" } });
    await expectError(updateMyArtisanProfile(userB, { brandName: "B" }), 403, "FORBIDDEN");
    await expectError(getEditableProduct(userA, productB.id), 403, "FORBIDDEN");
    assert.strictEqual((await getEditableProduct(userA, productA.id)).id, productA.id);
    await prisma.artisan.update({ where: { id: artisanA.id }, data: { status: "nonaktif" } });
    await expectError(getEditableProduct(userA, productA.id), 403, "FORBIDDEN");
  } finally {
    await prisma.review.delete({ where: { id: reviewB.id } });
    await prisma.artisanApplication.delete({ where: { id: applicationB.id } });
    await prisma.notification.deleteMany({ where: { id: { in: [notificationA.id, notificationB.id] } } });
    await prisma.orderItem.deleteMany({ where: { orderId: orderB.id } });
    await prisma.order.deleteMany({ where: { id: { in: [orderA.id, orderB.id] } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: [productA.id, productB.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [productA.id, productB.id] } } });
    await prisma.artisan.deleteMany({ where: { id: { in: [artisanA.id, artisanB.id] } } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  }
  await prisma.$disconnect();
  console.log("LULUS  isolasi DAL untuk order, notifikasi, review, artisan, dan produk");
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
