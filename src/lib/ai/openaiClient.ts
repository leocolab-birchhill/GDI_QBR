import OpenAI from "openai";
import { env, hasOpenAi } from "../env";

let client: OpenAI | null = null;

export function getOpenAi(): OpenAI | null {
  if (!hasOpenAi()) return null;
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export const MODEL = env.OPENAI_MODEL;
export const REASONING_EFFORT = env.OPENAI_REASONING_EFFORT;

/**
 * Call the model and return parsed JSON text. Tries the Responses API first
 * (supports reasoning effort), then falls back to Chat Completions. Returns the
 * raw string content; callers validate with Zod.
 */
export async function completeJson(args: {
  system: string;
  user: string;
  /** Override the default reasoning effort (e.g. "low" for fast, structured tasks). */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}): Promise<string | null> {
  const openai = getOpenAi();
  if (!openai) return null;

  const effort = args.reasoningEffort ?? REASONING_EFFORT;

  // Prefer the Responses API (newer models + reasoning effort).
  try {
    const resp: any = await (openai as any).responses.create({
      model: MODEL,
      reasoning: { effort },
      input: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      text: { format: { type: "json_object" } },
    });
    const text = resp.output_text ?? extractResponsesText(resp);
    if (text) return text;
  } catch (err) {
    // Fall through to chat completions.
    console.warn("[ai] responses API failed, falling back to chat.completions:", (err as Error).message);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    });
    return completion.choices[0]?.message?.content ?? null;
  } catch (err) {
    console.error("[ai] chat.completions failed:", (err as Error).message);
    return null;
  }
}

function extractResponsesText(resp: any): string | null {
  try {
    const parts = resp?.output?.flatMap((o: any) => o?.content ?? []) ?? [];
    const textPart = parts.find((p: any) => typeof p?.text === "string");
    return textPart?.text ?? null;
  } catch {
    return null;
  }
}
