import { describe, expect, it } from "vitest";
import { testOpenAiConnectivity } from "@/lib/ai/connectivity";

describe("OpenAI connectivity test", () => {
  it("reports an unconfigured key without calling OpenAI", async () => {
    const result = await testOpenAiConnectivity(async () => {
      throw new Error("probe should not run without a configured key");
    });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.message).toMatch(/OPENAI_API_KEY/);
  });
});
