import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    qbrCycle: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { enrichWithEditorLink } from "@/lib/email/outboundEnrichment";
import { editorUrl } from "@/lib/email/branding";

describe("enrichWithEditorLink", () => {
  it("adds a hyperlink block before the email footer (French default)", async () => {
    const qbrCycleId = "test-qbr-id";
    const url = editorUrl(qbrCycleId);
    const html = `<p>Hello</p><hr style="border:none;border-top:1px solid #eee"/>`;
    const result = await enrichWithEditorLink({
      qbrCycleId,
      text: "Hello",
      html,
      locale: "fr",
    });
    expect(result.html).toContain('href="' + url + '"');
    expect(result.html).toContain("Ouvrir l'éditeur");
    expect(result.html?.indexOf("Ouvrir")).toBeLessThan(
      result.html!.indexOf("<hr"),
    );
    expect(result.text).toContain("éditeur collaboratif");
    expect(result.text).toContain("/collaborate");
  });
});
