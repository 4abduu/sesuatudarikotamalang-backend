require("./helpers/requireTestDb")();

process.env.JWT_SECRET = process.env.JWT_SECRET || "secret-khusus-tes";

const assert = require("assert");
const jwt = require("jsonwebtoken");
const { HttpError } = require("../dist/lib/httpError");
const { errorHandler } = require("../dist/app");
const { requireAuth } = require("../dist/middleware/authMiddleware");
const { requireRole } = require("../dist/middleware/requireRole");

const invokeMiddleware = (middleware, req) => new Promise((resolve, reject) => {
  let statusCode = 200;
  let body;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { body = data; resolve({ statusCode, body }); return this; },
  };
  middleware(req, res, (error) => error ? reject(error) : resolve({ statusCode: 200, next: true }));
});

const invokeErrorHandler = (error) => {
  let statusCode = 200;
  let body;
  errorHandler(
    error,
    { method: "GET", path: "/test", body: {} },
    {
      status(code) { statusCode = code; return this; },
      json(data) { body = data; return this; },
    },
    () => {}
  );
  return { statusCode, body };
};

(async () => {
  const missing = await invokeMiddleware(requireAuth, { headers: {} });
  assert.deepStrictEqual(missing, {
    statusCode: 401,
    body: { error: "Token tidak ditemukan", code: "UNAUTHORIZED" },
  });

  const invalid = await invokeMiddleware(requireAuth, { headers: { authorization: "Bearer bukan-token" } });
  assert.deepStrictEqual(invalid, {
    statusCode: 401,
    body: { error: "Token tidak valid atau kadaluarsa", code: "UNAUTHORIZED" },
  });

  const unknownUserToken = jwt.sign({ id: "user-tidak-ada", role: "buyer" }, process.env.JWT_SECRET);
  const unknown = await invokeMiddleware(requireAuth, { headers: { authorization: `Bearer ${unknownUserToken}` } });
  assert.deepStrictEqual(unknown, {
    statusCode: 401,
    body: { error: "User sudah tidak terdaftar di sistem", code: "UNAUTHORIZED" },
  });

  const noRole = await invokeMiddleware(requireRole("admin"), { user: undefined });
  assert.deepStrictEqual(noRole, {
    statusCode: 401,
    body: { error: "Belum login", code: "UNAUTHORIZED" },
  });

  const wrongRole = await invokeMiddleware(requireRole("admin"), { user: { id: "buyer-1", role: "buyer" } });
  assert.deepStrictEqual(wrongRole, {
    statusCode: 403,
    body: { error: "Tidak punya akses untuk resource ini", code: "FORBIDDEN" },
  });

  const allowed = await invokeMiddleware(requireRole("admin"), { user: { id: "admin-1", role: "admin" } });
  assert.strictEqual(allowed.next, true);

  assert.deepStrictEqual(invokeErrorHandler(new HttpError(403, "Tidak boleh", "FORBIDDEN")), {
    statusCode: 403,
    body: { error: "Tidak boleh", code: "FORBIDDEN" },
  });
  assert.deepStrictEqual(invokeErrorHandler(new HttpError(400, "Input salah", "VALIDATION_ERROR")), {
    statusCode: 400,
    body: { error: "Input salah", code: "VALIDATION_ERROR" },
  });
  assert.deepStrictEqual(invokeErrorHandler(new HttpError(500, "Detail internal", "SECRET_INTERNAL")), {
    statusCode: 500,
    body: { error: "Detail internal" },
  });
  assert.deepStrictEqual(invokeErrorHandler({ status: 400, message: "Error biasa", code: "INTERNAL_CODE" }), {
    statusCode: 400,
    body: { error: "Error biasa" },
  });

  console.log("LULUS  error 401/403 bertipe dan handler HttpError 4xx/5xx");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
