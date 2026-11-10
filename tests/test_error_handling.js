require("./helpers/requireTestDb")();
process.env.JWT_SECRET = process.env.JWT_SECRET || "secret-khusus-tes";

const assert = require("assert");
const http = require("http");
const app = require("../dist/app").default;

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const notFound = await request(port, "/api/rute-tidak-ada", { "x-request-id": "uji-request-01" });
    assert.strictEqual(notFound.status, 404);
    assert.strictEqual(notFound.headers["x-request-id"], "uji-request-01");
    assert.deepStrictEqual(notFound.body, {
      error: "Rute tidak ditemukan",
      code: "NOT_FOUND",
      requestId: "uji-request-01",
    });

    const invalidRequestId = await request(port, "/api/rute-tidak-ada", { "x-request-id": "spasi tidak valid" });
    assert.strictEqual(invalidRequestId.status, 404);
    assert.match(invalidRequestId.headers["x-request-id"], /^[0-9a-f-]{36}$/);
    assert.strictEqual(invalidRequestId.body.requestId, invalidRequestId.headers["x-request-id"]);

    const genericError = await new Promise((resolve, reject) => {
      const errorApp = require("express")();
      const { requestId } = require("../dist/middleware/requestId");
      const { errorHandler } = require("../dist/middleware/errorHandler");
      errorApp.use(requestId);
      errorApp.get("/error", () => { throw new Error("rahasia internal"); });
      errorApp.use(errorHandler);
      const errorServer = errorApp.listen(0);
      const address = errorServer.address();
      request(address.port, "/error").then((result) => { errorServer.close(); resolve(result); }).catch((err) => { errorServer.close(); reject(err); });
    });
    assert.strictEqual(genericError.status, 500);
    assert.strictEqual(genericError.body.error, "Terjadi kesalahan pada server.");
    assert.strictEqual(genericError.body.code, "INTERNAL_ERROR");
    assert.ok(!JSON.stringify(genericError.body).includes("rahasia internal"));
    assert.strictEqual(genericError.body.requestId, genericError.headers["x-request-id"]);

    console.log("LULUS  request ID, 404, dan error 500 tanpa kebocoran detail");
  } finally {
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
