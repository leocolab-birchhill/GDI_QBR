import { env, hasOpenAi } from "../env";
import { getOpenAi, MODEL } from "./openaiClient";

export type OpenAiConnectivityResult = {
  ok: boolean;
  configured: boolean;
  model: string;
  latencyMs: number | null;
  message: string;
  error?: string;
};

type Probe = (model: string) => Promise<void>;

export async function testOpenAiConnectivity(probe: Probe = defaultProbe): Promise<OpenAiConnectivityResult> {
  if (!hasOpenAi()) {
    return {
      ok: false,
      configured: false,
      model: env.OPENAI_MODEL,
      latencyMs: null,
      message: "OPENAI_API_KEY is not configured or appears to be a placeholder.",
    };
  }

  const started = Date.now();
  try {
    await probe(MODEL);
    return {
      ok: true,
      configured: true,
      model: MODEL,
      latencyMs: Date.now() - started,
      message: "OpenAI connectivity confirmed.",
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      model: MODEL,
      latencyMs: Date.now() - started,
      message: "OpenAI connectivity test failed.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function defaultProbe(model: string) {
  const openai = getOpenAi();
  if (!openai) throw new Error("OpenAI client is unavailable.");

  await (openai as any).responses.create({
    model,
    input: "Reply with exactly: ok",
    max_output_tokens: 8,
  });
}
