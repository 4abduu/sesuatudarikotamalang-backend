const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const limiterSource = read("src/middleware/rateLimiter.ts");
const appSource = read("src/app.ts");
const authRoutes = read("src/routes/authRoutes.ts");
const searchRoutes = read("src/routes/searchRoutes.ts");
const uploadRoutes = read("src/routes/uploadRoutes.ts");
const paymentRoutes = read("src/routes/paymentsRoutes.ts");

assert.match(limiterSource, /export const apiLimiter/);
assert.match(limiterSource, /windowMs: 15 \* 60 \* 1000/);
assert.match(limiterSource, /max: apiLimit/);
assert.match(limiterSource, /req\.path === "\/payments\/webhook"/);
assert.match(appSource, /app\.use\("\/api", apiLimiter\)/);
assert.match(authRoutes, /googleLoginLimiter, authController\.googleLogin/);
assert.match(authRoutes, /requireAuth, changePasswordLimiter, authController\.changePassword/);
assert.match(searchRoutes, /searchLimiter, searchController\.search/);
assert.match(uploadRoutes, /requireAuth,\s*uploadLimiter/);
assert.doesNotMatch(paymentRoutes.replace(/\/\/.*$/gm, ""), /apiLimiter|requireAuth/);
console.log("LULUS  limiter API, Google, search, change-password, upload, dan pengecualian webhook terpasang");
