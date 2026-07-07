import { describe, it, expect } from "vitest";
import { assertCanFinalize, FinalizationBlockedError } from "@/lib/qbr/service";

describe("finalization rules", () => {
  it("is blocked without VP approval", () => {
    expect(() =>
      assertCanFinalize({ hasVpApproval: false, unconfirmedMetricLabels: [] }),
    ).toThrow(FinalizationBlockedError);
  });

  it("is blocked with unconfirmed metrics unless overridden", () => {
    expect(() =>
      assertCanFinalize({ hasVpApproval: true, unconfirmedMetricLabels: ["Outstanding invoices"] }),
    ).toThrow(/Unconfirmed metrics/);
  });

  it("allows override of unconfirmed metrics", () => {
    expect(() =>
      assertCanFinalize({
        hasVpApproval: true,
        unconfirmedMetricLabels: ["Outstanding invoices"],
        allowOverride: true,
      }),
    ).not.toThrow();
  });

  it("succeeds with approval and all metrics confirmed", () => {
    expect(() => assertCanFinalize({ hasVpApproval: true, unconfirmedMetricLabels: [] })).not.toThrow();
  });
});
