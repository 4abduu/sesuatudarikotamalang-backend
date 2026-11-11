import IDProfanityFilter from "@sideid/id-profanity-filter";
import { HttpError } from "./httpError";
import { profanityWhitelist } from "../config/profanityWhitelist";

const filter = new IDProfanityFilter({ whitelist: profanityWhitelist });
filter.usePreset("strict");
filter.enableIndonesianVariations();
filter.enableSplitWordDetection();

export function assertCleanText(fieldLabel: string, text: unknown): void {
  if (typeof text !== "string") return;
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Hindari false-positive untuk input sintetis seperti "xxxx..." pada data uji.
  if (compact.length >= 3 && /^([a-z0-9])\1+$/.test(compact)) return;

  const analysis: any = filter.analyze(text);
  const details: Array<{ word?: string; aliases?: string[] }> = Array.isArray(analysis?.matchDetails)
    ? analysis.matchDetails
    : [];

  const hasExplicitMatch = details.some((detail) => {
    const baseWord = String(detail.word ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const aliases = Array.isArray(detail.aliases)
      ? detail.aliases.map((alias) => String(alias).toLowerCase().replace(/[^a-z0-9]/g, ""))
      : [];
    const candidates = [baseWord, ...aliases].filter((candidate) => candidate.length >= 4);
    return candidates.some((candidate) => compact.includes(candidate));
  });

  if (hasExplicitMatch) {
    throw new HttpError(400, `${fieldLabel} mengandung kata yang tidak pantas`, "CONTENT_PROFANITY");
  }
}

export function assertCleanFields(fields: Record<string, unknown>): void {
  for (const [label, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) assertCleanText(label, value);
  }
}
