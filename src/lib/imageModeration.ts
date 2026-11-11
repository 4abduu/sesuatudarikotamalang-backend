import OpenAI from "openai";
import { HttpError } from "./httpError";

const blockedCategories = new Set(["sexual", "violence", "violence/graphic", "self-harm", "self-harm/intent", "self-harm/instructions"]);

export async function moderateImage(buffer: Buffer, mimetype: string): Promise<{ allowed: boolean; categories: string[] }> {
  if (process.env.MODERATION_ENABLED === "false") return { allowed: true, categories: [] };
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if ((process.env.MODERATION_FAIL_MODE ?? "open") === "closed") throw new HttpError(503, "Moderasi gambar sedang tidak tersedia", "MODERATION_UNAVAILABLE");
    return { allowed: true, categories: [] };
  }
  try {
    const client = new OpenAI({ apiKey, timeout: 8000 });
    const result: any = await client.moderations.create({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: `data:${mimetype};base64,${buffer.toString("base64")}` } }],
    });
    const scores = result.results?.[0]?.categories ?? {};
    const matched = Object.entries(scores).filter(([category, value]) => value === true && blockedCategories.has(category)).map(([category]) => category);
    return { allowed: matched.length === 0, categories: matched };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if ((process.env.MODERATION_FAIL_MODE ?? "open") === "closed") throw new HttpError(503, "Moderasi gambar sedang tidak tersedia", "MODERATION_UNAVAILABLE");
    return { allowed: true, categories: [] };
  }
}
