require("./helpers/requireTestDb")();
const assert = require("assert");
const { storyDraft } = require("../dist/controllers/aiController");

process.env.GEMINI_API_KEY = "kunci-uji-rahasia-123";
process.env.GEMINI_MODEL = "model-uji";

const originalFetch = global.fetch;
let counter = 0;
const newCreator = () => ({ id: `ai-v3-${Date.now()}-${++counter}`, role: "creator" });

function makeDraft({ judul = "Singa di Sore Kayutangan", isi, proses = "" } = {}) {
  const defaultIsi =
    "Aku menggambar singa dengan latar bangunan heritage Kayutangan yang tenang di kala senja. " +
    "Setiap garis lahir dari ingatan tentang kota lama yang bersahaja dan ramah bagi siapa saja. " +
    "Kami ingin karya kecil ini membawa kehangatan sudut Malang ke meja kerja atau ruangan rumahmu. " +
    "Cerita ini sederhana, dibuat perlahan dengan harapan bisa menemani hari-harimu dengan rasa nyaman.";
  return {
    judul,
    isi: isi || defaultIsi,
    proses,
  };
}

function geminiOk(obj) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
  };
}

function invoke(user, body) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(data) {
        resolve({ status, data });
        return this;
      },
    };
    storyDraft({ user, body }, res, reject).catch(reject);
  });
}

(async () => {
  try {
    // 1. M + P + I, Gemini membalas tiga field valid -> 200; draft.proses terisi
    {
      global.fetch = async () =>
        geminiOk(makeDraft({ proses: "Sketsa tangan dulu, lalu didigitalkan dan dicetak di kertas bertekstur." }));
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan",
        process: "Sketsa tangan pensil lalu digital printing",
        inspiration: "Suasana sore di jalan Basuki Rahmat",
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.draft.proses, "Sketsa tangan dulu, lalu didigitalkan dan dicetak di kertas bertekstur.");
      assert.strictEqual(r.data.draft.judul, "Singa di Sore Kayutangan");
      console.log("LULUS  1. M + P + I membalas tiga field valid");
    }

    // 2. M saja, Gemini membalas proses terisi (mengarang) -> 200; draft.proses === "" (dipaksa kosong)
    {
      global.fetch = async () =>
        geminiOk(makeDraft({ proses: "Mengarang proses yang tidak pernah diberikan oleh kreator." }));
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang yang ikonik",
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.draft.proses, "");
      console.log("LULUS  2. M saja dengan Gemini mengarang proses dipaksa proses = ''");
    }

    // 3. M + P, Gemini membalas proses kosong -> retry; setelah retry masih kosong -> 502 AI_BAD_RESPONSE
    {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        return geminiOk(makeDraft({ proses: "" }));
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang",
        process: "Sketsa manual pensil pada kertas gambar",
      });
      assert.strictEqual(r.status, 502);
      assert.strictEqual(r.data.code, "AI_BAD_RESPONSE");
      assert.strictEqual(callCount, 2);
      console.log("LULUS  3. M + P dengan proses kosong dari AI retry lalu 502 AI_BAD_RESPONSE");
    }

    // 4. M + P, Gemini membalas tanpa field proses -> diperlakukan kosong, retry lalu 502
    {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        const draftObj = makeDraft();
        delete draftObj.proses;
        return geminiOk(draftObj);
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang",
        process: "Sketsa manual pensil pada kertas gambar",
      });
      assert.strictEqual(r.status, 502);
      assert.strictEqual(r.data.code, "AI_BAD_RESPONSE");
      assert.strictEqual(callCount, 2);
      console.log("LULUS  4. M + P tanpa field proses retry lalu 502 AI_BAD_RESPONSE");
    }

    // 5. P saja (total >= 30 karakter) -> 422 VALIDATION_ERROR (pesan menyebut Motif atau Inspirasi)
    {
      const r = await invoke(newCreator(), {
        process: "Proses pembuatan pin enamel ini memakan waktu cukup panjang dengan ketelitian tinggi",
      });
      assert.strictEqual(r.status, 422);
      assert.strictEqual(r.data.code, "VALIDATION_ERROR");
      assert.ok(r.data.error.includes("Motif") || r.data.error.includes("Inspirasi"));
      console.log("LULUS  5. P saja ditolak 422 VALIDATION_ERROR menyebut Motif atau Inspirasi");
    }

    // 6. Semua kosong -> 422 VALIDATION_ERROR
    {
      const r = await invoke(newCreator(), {});
      assert.strictEqual(r.status, 422);
      assert.strictEqual(r.data.code, "VALIDATION_ERROR");
      console.log("LULUS  6. Semua input kosong ditolak 422 VALIDATION_ERROR");
    }

    // 7. M 5 karakter + P 40 karakter -> 422 (gabungan M+I < 15)
    {
      const r = await invoke(newCreator(), {
        motif: "Singa",
        process: "Sketsa tangan pensil lalu dicetak manual di atas kertas seni bertekstur",
      });
      assert.strictEqual(r.status, 422);
      assert.strictEqual(r.data.code, "VALIDATION_ERROR");
      console.log("LULUS  7. M < 15 tanpa I ditolak 422 VALIDATION_ERROR");
    }

    // 8. proses mengandung URL -> retry lalu 502
    {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        return geminiOk(makeDraft({ proses: "Bisa dilihat prosesnya di https://instagram.com/toko" }));
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang",
        process: "Sketsa manual pensil pada kertas gambar",
      });
      assert.strictEqual(r.status, 502);
      assert.strictEqual(r.data.code, "AI_BAD_RESPONSE");
      assert.strictEqual(callCount, 2);
      console.log("LULUS  8. proses mengandung URL retry lalu 502 AI_BAD_RESPONSE");
    }

    // 9. proses lebih dari 60 kata -> retry lalu 502
    {
      let callCount = 0;
      const longProses = new Array(65).fill("kata").join(" ");
      global.fetch = async () => {
        callCount++;
        return geminiOk(makeDraft({ proses: longProses }));
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang",
        process: "Sketsa manual pensil pada kertas gambar",
      });
      assert.strictEqual(r.status, 502);
      assert.strictEqual(r.data.code, "AI_BAD_RESPONSE");
      assert.strictEqual(callCount, 2);
      console.log("LULUS  9. proses > 60 kata retry lalu 502 AI_BAD_RESPONSE");
    }

    // 10. proses berisi dua paragraf (ada baris kosong) -> retry lalu 502
    {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        return geminiOk(makeDraft({ proses: "Paragraf pertama langkah pembuatan.\n\nParagraf kedua langkah pencetakan." }));
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang",
        process: "Sketsa manual pensil pada kertas gambar",
      });
      assert.strictEqual(r.status, 502);
      assert.strictEqual(r.data.code, "AI_BAD_RESPONSE");
      assert.strictEqual(callCount, 2);
      console.log("LULUS  10. proses ada baris kosong retry lalu 502 AI_BAD_RESPONSE");
    }

    // 11. alias proses dan inspirasi di request -> 200, input terbaca
    {
      let promptSent = "";
      global.fetch = async (_url, options) => {
        promptSent = JSON.parse(options.body).contents[0].parts[0].text;
        return geminiOk(makeDraft({ proses: "Pengerjaan secara bertahap dengan tangan." }));
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan",
        proses: "Dikerjakan teliti menggunakan cat minyak",
        inspirasi: "Sudut kota Malang tempo dulu yang syahdu",
      });
      assert.strictEqual(r.status, 200);
      assert.ok(promptSent.includes("Dikerjakan teliti menggunakan cat minyak"));
      assert.ok(promptSent.includes("Sudut kota Malang tempo dulu yang syahdu"));
      console.log("LULUS  11. alias proses dan inspirasi terbaca di prompt");
    }

    // 12. prompt yang dikirim ke Gemini untuk input M saja memuat Proses Pembuatan: -
    {
      let promptSent = "";
      global.fetch = async (_url, options) => {
        promptSent = JSON.parse(options.body).contents[0].parts[0].text;
        return geminiOk(makeDraft());
      };
      const r = await invoke(newCreator(), {
        motif: "Singa heritage Kayutangan Malang yang gagah",
      });
      assert.strictEqual(r.status, 200);
      assert.ok(promptSent.includes("Proses Pembuatan: -"));
      assert.ok(promptSent.includes("Inspirasi: -"));
      console.log("LULUS  12. input M saja memuat Proses Pembuatan: - di prompt");
    }

    console.log("\nSEMUA TES AI STORY DRAFT V3 LULUS (12 skenario)");
  } finally {
    global.fetch = originalFetch;
  }
})().catch((err) => {
  console.error("GAGAL", err);
  process.exit(1);
});
