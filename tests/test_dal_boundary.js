const assert = require("assert");
const fs = require("fs");

const source = (file) => fs.readFileSync(file, "utf8");
const functionBody = (text, name) => {
  const start = text.indexOf(`export const ${name}`);
  assert(start >= 0, `${name} tidak ditemukan`);
  const next = text.indexOf("\nexport const ", start + 1);
  return text.slice(start, next >= 0 ? next : text.length);
};

const forbiddenByController = ["prisma.order.", "prisma.notification.", "prisma.review.", "prisma.artisanApplication.", "prisma.artisan."];
const checks = [
  ["src/controllers/ordersController.ts", ["listOrders", "getOrderById", "cancelOrder", "repayOrder"]],
  ["src/controllers/notificationsController.ts", ["getNotifications", "markAsRead", "markAllAsRead"]],
  ["src/controllers/reviewsController.ts", ["createReview", "listMyReviews"]],
  ["src/controllers/artisansController.ts", ["getMyApplications", "updateMyProfile", "getMyArtisanProfile", "applyConsignment"]],
];

for (const [file, functions] of checks) {
  const text = source(file);
  for (const name of functions) {
    const body = functionBody(text, name);
    for (const forbidden of forbiddenByController) {
      assert(!body.includes(forbidden), `${file}:${name} masih mengakses ${forbidden}`);
    }
  }
}

for (const name of ["updateProduct", "upsertStory"]) {
  const body = functionBody(source("src/controllers/productsController.ts"), name);
  assert(!body.includes("prisma.artisan."), `productsController:${name} masih mengakses prisma.artisan`);
}

console.log("LULUS  boundary controller: akses resource berpemilik berada di DAL");
