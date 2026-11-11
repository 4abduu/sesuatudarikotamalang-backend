const assert = require("assert");
const { parsePagination, buildPagination } = require("../dist/lib/pagination");
const { assertCleanText } = require("../dist/lib/contentFilter");
const { moderateImage } = require("../dist/lib/imageModeration");

(async () => {
  assert.deepStrictEqual(parsePagination({}, { defaultLimit: 12, maxLimit: 50 }), undefined);
  assert.deepStrictEqual(parsePagination({ page: "2", limit: "100" }, { defaultLimit: 12, maxLimit: 50 }), { page: 2, limit: 50 });
  assert.deepStrictEqual(buildPagination(2, 10, 21), { page: 2, limit: 10, total: 21, totalPages: 3 });
  assert.doesNotThrow(() => assertCleanText("Nama", "Kerajinan kayu Malang"));
  assert.throws(() => assertCleanText("Nama", "dasar anjing kamu"), (error) => error.status === 400 && error.code === "CONTENT_PROFANITY" && !error.message.includes("anjing"));
  process.env.MODERATION_ENABLED = "false";
  assert.deepStrictEqual(await moderateImage(Buffer.from("not-an-image"), "image/jpeg"), { allowed: true, categories: [] });
  process.env.MODERATION_ENABLED = "true";
  delete process.env.OPENAI_API_KEY;
  process.env.MODERATION_FAIL_MODE = "closed";
  await assert.rejects(() => moderateImage(Buffer.from("not-an-image"), "image/jpeg"), (error) => error.status === 503 && error.code === "MODERATION_UNAVAILABLE");
  console.log("LULUS moderation dan pagination");
})().catch((error) => { console.error("GAGAL", error); process.exit(1); });
