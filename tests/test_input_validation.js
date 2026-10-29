const assert = require("assert");
const { register, login, changePassword } = require("../dist/controllers/authController");
const { createProduct, upsertStory } = require("../dist/controllers/productsController");
const { applyConsignment } = require("../dist/controllers/artisansController");
const { listOrders, extendOrderHold, rejectApplication, updateSettings } = require("../dist/controllers/adminController");

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const response = { statusCode: 200, body: null };
    response.status = (code) => { response.statusCode = code; return response; };
    response.json = (body) => { response.body = body; resolve(response); return response; };
    const next = (error) => {
      if (error?.status) {
        response.status(error.status).json({ error: error.message });
      } else {
        reject(error);
      }
    };
    Promise.resolve(handler(req, response, next)).catch(reject);
  });
}

async function expect400(handler, req, label) {
  const response = await invoke(handler, req);
  assert.strictEqual(response.statusCode, 400, `${label}: status ${response.statusCode}`);
}

const req = (body, extra = {}) => ({ body, params: {}, query: {}, user: { id: "validation-user", role: "buyer" }, ...extra });

(async () => {
  await expect400(register, req({ name: {}, email: "valid@test.local", password: "Valid123" }), "register tipe name");
  await expect400(register, req({ name: "Valid Name", email: "not-an-email", password: "Valid123" }), "register format email");
  await expect400(register, req({ name: "Valid Name", email: "valid@test.local", password: "A".repeat(73) }), "register password 72 byte");
  await expect400(login, req({ email: {}, password: "Valid123" }), "login tipe email");
  await expect400(changePassword, req({ oldPassword: {}, newPassword: "Valid123" }), "changePassword tipe oldPassword");
  await expect400(createProduct, req({ name: "x".repeat(192), description: "deskripsi", categoryId: "cat", price: 1 }), "createProduct name");
  await expect400(createProduct, req({ name: "Produk", description: "deskripsi", categoryId: "cat", price: 2147483648 }), "createProduct price overflow");
  await expect400(upsertStory, req({ title: "Judul", content: "isi", coverImageUrl: "http://bad.test/image.jpg" }, { params: { id: "product" }, user: { id: "creator", role: "creator" } }), "story URL");
  await expect400(applyConsignment, req({ applicantName: "A", contact: "0812", brandName: "Brand", description: "desc", samplePhotos: ["https://a.test/1.jpg","https://a.test/2.jpg","https://a.test/3.jpg","https://a.test/4.jpg","https://a.test/5.jpg","https://a.test/6.jpg","https://a.test/7.jpg","https://a.test/8.jpg","https://a.test/9.jpg","https://a.test/10.jpg","https://a.test/11.jpg"] }), "apply foto");
  await expect400(listOrders, req({}, { query: { status: "status-salah" }, user: { id: "admin", role: "admin" } }), "admin status order");
  await expect400(extendOrderHold, req({ additionalMinutes: 2881 }, { params: { id: "order" }, user: { id: "admin", role: "admin" } }), "admin additionalMinutes");
  await expect400(rejectApplication, req({ reason: "x".repeat(501) }, { params: { id: "application" }, user: { id: "admin", role: "admin" } }), "admin reject reason");
  await expect400(updateSettings, req({ notificationEmail: "not-an-email" }, { user: { id: "admin", role: "admin" } }), "admin notificationEmail");
  console.log("LULUS  validasi tipe, panjang, URL, email, dan batas numerik 4b");
})().catch((error) => {
  console.error("GAGAL", error);
  process.exitCode = 1;
});
