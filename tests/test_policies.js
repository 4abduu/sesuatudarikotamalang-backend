const assert = require("assert");
const { assertAuthenticated, assertRole, isAdmin } = require("../dist/dal/policies");

const expectError = (fn, status, code) => {
  assert.throws(fn, (error) => error.status === status && error.code === code);
};

expectError(() => assertAuthenticated(undefined), 401, "UNAUTHORIZED");
expectError(() => assertRole({ id: "1", role: "buyer" }, "admin"), 403, "FORBIDDEN");
assert.doesNotThrow(() => assertRole({ id: "1", role: "admin" }, "admin"));
assert.strictEqual(isAdmin({ id: "1", role: "admin" }), true);
assert.strictEqual(isAdmin({ id: "1", role: "buyer" }), false);
console.log("LULUS  policy autentikasi, role, dan admin");
