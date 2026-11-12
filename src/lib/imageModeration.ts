import OpenAI from "openai";
import { HttpError } from "./httpError";
import { logger } from "../logger";

const blockedCategories = new Set(["sexual", "violence", "violence/graphic", "self-harm", "self-harm/intent", "self-harm/instructions"]);

let warnedMissingKey = false;

function failClosed(): boolean {
  return (process.env.MODERATION_FAIL_MODE ?? "open") === "closed";
}

export async function moderateImage(buffer: Buffer, mimetype: string): Promise<{ allowed: boolean; categories: string[] }> {
  if (process.env.MODERATION_ENABLED === "false") return { allowed: true, categories: [] };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (failClosed()) throw new HttpError(503, "Moderasi gambar sedang tidak tersedia", "MODERATION_UNAVAILABLE");
    // Cukup sekali per proses agar log tidak banjir.
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn("OPENAI_API_KEY kosong: moderasi gambar dilewati (mode open)");
    }
    return { allowed: true, categories: [] };
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 8000 });
    const result: any = await client.moderations.create({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: `data:${mimetype};base64,${buffer.toString("base64")}` } }],
    });
    const flags = result.results?.[0]?.categories ?? {};
    const matched = Object.entries(flags)
      .filter(([category, value]) => value === true && blockedCategories.has(category))
      .map(([category]) => category);
    return { allowed: matched.length === 0, categories: matched };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Hanya pesan dan status; jangan mencatat isi gambar atau objek error mentah.
    const e = error as { message?: string; status?: number };
    logger.warn({ status: e?.status, message: e?.message, failMode: failClosed() ? "closed" : "open" }, "moderasi gambar gagal");
    if (failClosed()) throw new HttpError(503, "Moderasi gambar sedang tidak tersedia", "MODERATION_UNAVAILABLE");
    return { allowed: true, categories: [] };
  }
}
