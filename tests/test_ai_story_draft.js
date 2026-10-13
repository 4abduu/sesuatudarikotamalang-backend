require("./helpers/requireTestDb")();

const { storyDraft } = require("../dist/controllers/aiController");

function invoke(req) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        resolve(this);
        return this;
      },
    };
    Promise.resolve(storyDraft(req, res, reject)).catch(reject);
  });
}

(async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  try {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "test-model";
    const mockDraft = JSON.stringify({
      judul: "Jejak Kota",
      isi: `Cerita ini lahir dari perjalanan kecil menyusuri sudut Kayutangan Heritage. Setiap garis dan warna menangkap suasana sore, ketika bangunan tua, jendela kayu, dan langkah warga bertemu dalam satu pemandangan yang akrab. Produk ini membawa pulang ingatan tentang kota dengan cara yang sederhana dan hangat.

Prosesnya dikerjakan perlahan dengan perhatian pada detail. Inspirasi datang dari kebiasaan melihat kembali sudut-sudut Malang yang sering dilewati, lalu menerjemahkannya menjadi karya yang bisa dinikmati setiap hari. Tidak ada cerita besar yang dibuat-buat, hanya jejak kecil yang ingin dibagikan kepada siapa saja yang membawanya pulang.`,
    });
    let mockResponse = {
      candidates: [{ content: { parts: [{ text: mockDraft }] } }],
    };
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const valid = await invoke({
      user: { id: `ai-test-${Date.now()}`, role: "creator" },
      body: {
        motif: "Jendela tua Kayutangan",
        process: "Digambar manual dengan pensil dan cat air",
        inspiration: "Suasana sore di kawasan heritage Malang",
      },
    });
    if (valid.statusCode !== 200 || valid.body.draft.judul !== "Jejak Kota") {
      throw new Error(`draft valid gagal: ${valid.statusCode} ${JSON.stringify(valid.body)}`);
    }
    console.log("LULUS  draft AI mengembalikan judul dan isi terstruktur");

    const buyer = await invoke({ user: { id: `ai-buyer-${Date.now()}`, role: "buyer" }, body: {} });
    if (buyer.statusCode !== 403) throw new Error(`role buyer seharusnya 403, aktual ${buyer.statusCode}`);
    console.log("LULUS  buyer tidak dapat memakai endpoint AI");

    const unauthenticated = await invoke({ body: {} });
    if (unauthenticated.statusCode !== 401) {
      throw new Error(`user tanpa login seharusnya 401, aktual ${unauthenticated.statusCode}`);
    }
    console.log("LULUS  user belum login ditolak 401");

    const savedApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "";
    const unavailable = await invoke({
      user: { id: `ai-unavailable-${Date.now()}`, role: "creator" },
      body: {
        motif: "Motif bangunan tua yang khas",
        process: "Dikerjakan perlahan dengan tangan",
        inspiration: "Kenangan berjalan sore di Malang",
      },
    });
    if (unavailable.statusCode !== 503 || unavailable.body.code !== "AI_UNAVAILABLE") {
      throw new Error(`API key kosong seharusnya 503 AI_UNAVAILABLE, aktual ${unavailable.statusCode} ${unavailable.body.code}`);
    }
    process.env.GEMINI_API_KEY = savedApiKey;
    console.log("LULUS  API key kosong menghasilkan 503 AI_UNAVAILABLE");

    const savedSetTimeout = global.setTimeout;
    const savedFetch = global.fetch;
    global.setTimeout = (callback, _delay, ...args) => savedSetTimeout(callback, 0, ...args);
    global.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("timeout");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
    const timedOut = await invoke({
      user: { id: `ai-timeout-${Date.now()}`, role: "creator" },
      body: {
        motif: "Motif bangunan tua yang khas",
        process: "Dikerjakan perlahan dengan tangan",
        inspiration: "Kenangan berjalan sore di Malang",
      },
    });
    global.setTimeout = savedSetTimeout;
    global.fetch = savedFetch;
    if (timedOut.statusCode !== 504 || timedOut.body.code !== "AI_TIMEOUT") {
      throw new Error(`timeout seharusnya 504 AI_TIMEOUT, aktual ${timedOut.statusCode} ${timedOut.body.code}`);
    }
    console.log("LULUS  timeout Gemini menghasilkan 504 AI_TIMEOUT");

    const admin = await invoke({
      user: { id: `ai-admin-${Date.now()}`, role: "admin" },
      body: {
        motif: "Motif bangunan tua yang khas",
        process: "Dikerjakan perlahan dengan tangan",
        inspiration: "Kenangan berjalan sore di Malang",
      },
    });
    if (admin.statusCode !== 200) throw new Error(`admin seharusnya dapat memakai AI, aktual ${admin.statusCode}`);
    console.log("LULUS  admin dapat memakai endpoint AI");

    const invalid = await invoke({
      user: { id: `ai-invalid-${Date.now()}`, role: "creator" },
      body: { motif: "pendek", process: "pendek", inspiration: "pendek" },
    });
    if (invalid.statusCode !== 422) throw new Error(`input invalid seharusnya 422, aktual ${invalid.statusCode}`);
    console.log("LULUS  input singkat ditolak 422");

    mockResponse = { candidates: [{ finishReason: "SAFETY" }] };
    const blocked = await invoke({
      user: { id: `ai-blocked-${Date.now()}`, role: "creator" },
      body: {
        motif: "Motif bangunan tua yang khas",
        process: "Dikerjakan perlahan dengan tangan",
        inspiration: "Kenangan berjalan sore di Malang",
      },
    });
    if (blocked.statusCode !== 422 || blocked.body.code !== "AI_CONTENT_BLOCKED") {
      throw new Error(`safety seharusnya AI_CONTENT_BLOCKED, aktual ${blocked.statusCode} ${blocked.body.code}`);
    }
    console.log("LULUS  safety filter dibedakan dari respons AI rusak");

    mockResponse = { candidates: [{ content: { parts: [{ text: "{rusak" }] } }] };
    const malformed = await invoke({
      user: { id: `ai-malformed-${Date.now()}`, role: "creator" },
      body: {
        motif: "Motif bangunan tua yang khas",
        process: "Dikerjakan perlahan dengan tangan",
        inspiration: "Kenangan berjalan sore di Malang",
      },
    });
    if (malformed.statusCode !== 502 || malformed.body.code !== "AI_BAD_RESPONSE") {
      throw new Error(`JSON rusak seharusnya AI_BAD_RESPONSE, aktual ${malformed.statusCode} ${malformed.body.code}`);
    }
    console.log("LULUS  JSON AI rusak menghasilkan AI_BAD_RESPONSE");

    mockResponse = { candidates: [{ content: { parts: [{ text: mockDraft }] } }] };

    const rateUser = { id: `ai-rate-${Date.now()}`, role: "creator" };
    const rateBody = {
      motif: "Motif bangunan tua yang khas",
      process: "Dikerjakan perlahan dengan tangan",
      inspiration: "Kenangan berjalan sore di Malang",
    };
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await invoke({ user: rateUser, body: rateBody });
      if (response.statusCode !== 200) throw new Error(`rate limit terlalu cepat pada percobaan ${attempt + 1}`);
    }
    const limited = await invoke({ user: rateUser, body: rateBody });
    if (limited.statusCode !== 429) throw new Error(`percobaan ke-21 seharusnya 429, aktual ${limited.statusCode}`);
    console.log("LULUS  rate limit AI diterapkan per user");

    console.log("SEMUA TES AI STORY DRAFT LULUS");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  }
})().catch((error) => {
  console.error("GAGAL", error.message);
  process.exit(1);
});
