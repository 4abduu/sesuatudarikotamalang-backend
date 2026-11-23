require("./helpers/requireTestDb")();

const assert = require("assert");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const tag = `ZZ-TEST-CART-${Date.now()}`;
  let user;
  let artisan;
  let category;
  let product;
  try {
    user = await prisma.user.create({ data: { name: tag, email: `${tag}@example.test` } });
    artisan = await prisma.artisan.create({ data: { brandName: tag } });
    category = await prisma.category.create({ data: { name: tag, slug: tag.toLowerCase() } });
    product = await prisma.product.create({ data: { artisanId: artisan.id, categoryId: category.id, name: tag, slug: tag.toLowerCase(), description: tag, price: 10000, images: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, combination: [], stock: 10 } });
    const item = await prisma.cartItem.create({ data: { userId: user.id, productId: product.id, variantId: variant.id } });
    assert.strictEqual(item.quantity, 1);
    await assert.rejects(() => prisma.cartItem.create({ data: { userId: user.id, productId: product.id, variantId: variant.id } }));
    await prisma.productVariant.delete({ where: { id: variant.id } });
    assert.strictEqual(await prisma.cartItem.count({ where: { userId: user.id } }), 0);
    console.log("PASS  cart_items default, unique user/variant, dan cascade deletion");
  } finally {
    if (product) await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
    if (category) await prisma.category.delete({ where: { id: category.id } }).catch(() => {});
    if (artisan) await prisma.artisan.delete({ where: { id: artisan.id } }).catch(() => {});
    if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
})().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
