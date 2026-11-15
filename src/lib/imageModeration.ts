import OpenAI from "openai";
import { HttpError } from "./httpError";
import { logger } from "../logger";

const blockedCategories = new Set([
  "sexual", "sexual/minors", "violence", "violence/graphic",
  "self-harm", "self-harm/intent", "self-harm/instructions",
  "hate", "hate/threatening", "illicit", "illicit/violent",
]);

function getFailMode(): "open" | "closed" {
  if (process.env.MODERATION_FAIL_MODE === "closed") return "closed";
  if (process.env.MODERATION_FAIL_MODE === "open") return "open";
  return process.env.NODE_ENV === "production" ? "closed" : "open";
}

function moderationUnavailable(): never {
  throw new HttpError(503, "Moderasi gambar sedang tidak tersedia", "MODERATION_UNAVAILABLE");
}

let warnedMissingKey = false;

function failClosed(): boolean {
  return (process.env.MODERATION_FAIL_MODE ?? "open") === "closed";
}

export async function moderateImage(buffer: Buffer, mimetype: string): Promise<{ allowed: boolean; categories: string[] }> {
  if (process.env.MODERATION_ENABLED === "false") return { allowed: true, categories: [] };

  const apiKey = process.env.OPENAI_API_KEY;
  const failMode = getFailMode();
  if (!apiKey) {
    // Cukup sekali per proses agar log tidak banjir.
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn({ reason: "missing_api_key", failMode }, "Moderasi gambar dilewati karena OPENAI_API_KEY belum tersedia");
    }
    if (failMode === "closed") moderationUnavailable();
    return { allowed: true, categories: [] };
  }

  try {
    const client = new OpenAI({ apiKey, timeout: 8000 });
    const result: any = await client.moderations.create({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: `data:${mimetype};base64,${buffer.toString("base64")}` } }],
    });
    const firstResult = result?.results?.[0];
    if (!firstResult || !firstResult.categories || typeof firstResult.categories !== "object") {
      throw new Error("Respons moderasi gambar tidak valid");
    }
    const scores = firstResult.categories;
    const matched = Object.entries(scores).filter(([category, value]) => value === true && blockedCategories.has(category)).map(([category]) => category);
    return { allowed: matched.length === 0, categories: matched };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.warn({ reason: "provider_error", errorType: error instanceof Error ? error.constructor.name : typeof error, failMode }, "Moderasi gambar gagal diproses");
    if (failMode === "closed") moderationUnavailable();
    return { allowed: true, categories: [] };
  }
}
