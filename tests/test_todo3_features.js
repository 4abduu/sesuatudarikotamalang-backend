require("./helpers/requireTestDb")();

const prisma = require("../dist/lib/prisma").default || require("../dist/lib/prisma");
const { upsertStory } = require("../dist/controllers/productsController");
const { applyConsignment } = require("../dist/controllers/artisansController");
const { changeEmailRequest } = require("../dist/controllers/authController");
const { search } = require("../dist/controllers/searchController");

const created = { users: [], artisans: [], categories: [], products: [], variants: [], applications: [], stories: [], otp: [] };

function mockResponse() {
  const response = { statusCode: 200, body: null };
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (data) => {
    response.body = data;
    return response;
  };
  return response;
}

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = mockResponse();
    handler(req, res, (error) => reject(error));
    const check = setInterval(() => {
      if (res.body !== null) {
        clearInterval(check);
        resolve(res);
      }
    }, 5);
    setTimeout(() => {
      clearInterval(check);
      reject(new Error("Controller tidak mengembalikan response"));
    }, 5000);
  });
}

async function cleanup() {
  await prisma.otpCode.deleteMany({ where: { id: { in: created.otp } } });
  await prisma.productStory.deleteMany({ where: { id: { in: created.stories } } });
  await prisma.artisanApplication.deleteMany({ where: { id: { in: created.applications } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: created.variants } } });
  await prisma.product.deleteMany({ where: { id: { in: created.products } } });
  await prisma.artisan.deleteMany({ where: { id: { in: created.artisans } } });
  await prisma.category.deleteMany({ where: { id: { in: created.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
}

(async () => {
  const tag = Date.now();
  try {
    const creatorUser = await prisma.user.create({
      data: { name: "TODO Creator", email: `todo3-creator-${tag}@test.local`, passwordHash: "hash", role: "creator" },
    });
    const googleUser = await prisma.user.create({
      data: { name: "TODO Google", email: `todo3-google-${tag}@test.local`, passwordHash: null, authProvider: "google", role: "buyer" },
    });
    const buyerUser = await prisma.user.create({
      data: { name: "TODO Buyer", email: `todo3-buyer-${tag}@test.local`, passwordHash: "hash", role: "buyer" },
    });
    created.users.push(creatorUser.id, googleUser.id, buyerUser.id);

    const artisan = await prisma.artisan.create({
      data: { userId: creatorUser.id, brandName: `TODO Artisan ${tag}`, status: "aktif" },
    });
    const category = await prisma.category.create({
      data: { name: `TODO Category ${tag}`, slug: `todo-category-${tag}` },
    });
    const product = await prisma.product.create({
      data: {
        artisanId: artisan.id,
        categoryId: category.id,
        name: `TODO Search Product ${tag}`,
        slug: `todo-search-product-${tag}`,
        description: "Produk tes TODO 3",
        price: 10000,
        images: [],
        isActive: true,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, combination: [], stock: 2 },
    });
    created.artisans.push(artisan.id);
    created.categories.push(category.id);
    created.products.push(product.id);
    created.variants.push(variant.id);

    const storyResponse = await invoke(upsertStory, {
      user: creatorUser,
      params: { id: product.id },
      body: { title: "Judul tes", content: "Isi tes", process: "Proses pembuatan tes", processImages: [] },
    });
    if (storyResponse.statusCode !== 200 || storyResponse.body.story.process !== "Proses pembuatan tes") {
      throw new Error("process story tidak dikembalikan");
    }
    created.stories.push(storyResponse.body.story.id);
    console.log("LULUS  story.process diterima dan dikembalikan");

    const applicationResponse = await invoke(applyConsignment, {
      user: buyerUser,
      body: {
        applicantName: "Applicant TODO",
        contact: "081234567890",
        brandName: "Brand TODO",
        description: "Deskripsi tes",
        samplePhotos: ["https://example.test/photo-1.jpg", "https://example.test/photo-2.jpg"],
      },
    });
    const application = applicationResponse.body.application;
    if (applicationResponse.statusCode !== 201 || application.sampleFileUrl !== "https://example.test/photo-1.jpg") {
      throw new Error("sampleFileUrl tidak diisi dari foto pertama");
    }
    if (JSON.stringify(application.samplePhotos) !== JSON.stringify(["https://example.test/photo-1.jpg", "https://example.test/photo-2.jpg"])) {
      throw new Error("samplePhotos tidak dikembalikan");
    }
    created.applications.push(application.id);
    console.log("LULUS  samplePhotos dikembalikan dan foto pertama menjadi sampleFileUrl");

    process.env.RESEND_API_KEY = "";
    const emailResponse = await invoke(changeEmailRequest, {
      user: { id: googleUser.id, email: googleUser.email, role: "buyer" },
      body: { newEmail: `todo3-new-${tag}@test.local` },
    });
    if (emailResponse.statusCode !== 200) {
      throw new Error(`ganti email akun Google gagal: ${emailResponse.statusCode}`);
    }
    const otp = await prisma.otpCode.findFirst({ where: { userId: googleUser.id, purpose: "ganti_email" } });
    if (!otp) throw new Error("OTP ganti email tidak dibuat");
    created.otp.push(otp.id);
    console.log("LULUS  akun Google dapat meminta ganti email tanpa password");

    const regularEmailResponse = await invoke(changeEmailRequest, {
      user: { id: buyerUser.id, email: buyerUser.email, role: "buyer" },
      body: { newEmail: `todo3-regular-new-${tag}@test.local` },
    });
    if (regularEmailResponse.statusCode !== 200) {
      throw new Error(`ganti email akun biasa tanpa password gagal: ${regularEmailResponse.statusCode}`);
    }
    console.log("LULUS  akun biasa juga dapat meminta ganti email tanpa password");

    const searchResponse = await invoke(search, { query: { q: `todo search product ${tag}` } });
    const searchedProduct = searchResponse.body.products.find((item) => item.id === product.id);
    if (!searchedProduct || searchedProduct.variants[0].effectiveStock !== 2) {
      throw new Error("effectiveStock tidak tersedia pada hasil search");
    }
    console.log("LULUS  search mengembalikan variants[].effectiveStock");

    console.log("SEMUA TES TODO 3 LULUS");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error("GAGAL", error.message);
  process.exit(1);
});
