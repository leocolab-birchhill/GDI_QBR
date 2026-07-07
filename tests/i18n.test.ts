import { describe, it, expect } from "vitest";
import { DEFAULT_LOCALE, getStrings, parseLocale, toConfirmLabel } from "@/lib/i18n";

describe("i18n", () => {
  it("defaults to French for Quebec launch", () => {
    expect(DEFAULT_LOCALE).toBe("fr");
    expect(parseLocale(null)).toBe("fr");
    expect(parseLocale(undefined)).toBe("fr");
    expect(parseLocale("invalid")).toBe("fr");
  });

  it("provides French deck strings by default", () => {
    const s = getStrings("fr");
    expect(s.deck.titleHeading).toContain("Revue");
    expect(s.deck.agendaItems.length).toBe(5);
    expect(toConfirmLabel("fr")).toBe("À confirmer");
  });

  it("provides English deck strings when requested", () => {
    const s = getStrings("en");
    expect(s.deck.titleHeading).toBe("Quarterly Business Review");
    expect(toConfirmLabel("en")).toBe("To confirm");
  });
});
