const assert = require("assert");
const { shouldCountView, clearViewDedupeForTests } = require("../dist/lib/viewDedupe");

const req = (ip, userAgent) => ({ ip, get: (name) => name === "user-agent" ? userAgent : undefined });
const originalNow = Date.now;
try {
  clearViewDedupeForTests();
  Date.now = () => 1_000;
  assert.strictEqual(shouldCountView("product-1", req("127.0.0.1", "agent")), true);
  assert.strictEqual(shouldCountView("product-1", req("127.0.0.1", "agent")), false);
  assert.strictEqual(shouldCountView("product-1", req("127.0.0.2", "agent")), true);
  Date.now = () => 1_000 + 30 * 60 * 1000;
  assert.strictEqual(shouldCountView("product-1", req("127.0.0.1", "agent")), true);
  console.log("LULUS  dedupe viewCount per produk/pengunjung selama 30 menit");
} finally {
  Date.now = originalNow;
  clearViewDedupeForTests();
}
