// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentTaskCard from "@/app/qbr/[id]/collaborate/AgentTaskCard";
import type { SectionReviewSummary } from "@/lib/qbr/sectionGuidance";

const review: SectionReviewSummary = {
  status: "needs_input",
  missing: ["Inspection score"],
  unconfirmed: [],
  warnings: [],
  nextTask: {
    id: "dashboard:Inspection score",
    section: "dashboard",
    question: "What is the confirmed inspection score?",
    rationale: "Metrics remain structured.",
    fields: [{ key: "dashboard.metrics.Inspection score", label: "Inspection score", inputType: "metric", required: true }],
    priority: 100,
    complete: false,
  },
};

describe("AgentTaskCard", () => {
  it("presents one question, deterministic fields, and a natural-language alternative", () => {
    const onAnswerChange = vi.fn();
    render(
      <AgentTaskCard
        review={review}
        locale="en"
        answer=""
        onAnswerChange={onAnswerChange}
        onSubmit={vi.fn()}
        onConfirmSection={vi.fn()}
        onAcceptProposal={vi.fn()}
        onRejectProposal={vi.fn()}
        onUndo={vi.fn()}
        proposal={null}
        stage="idle"
        busy={false}
      >
        <input aria-label="Inspection score exact field" />
      </AgentTaskCard>,
    );
    expect(screen.getByRole("heading", { name: review.nextTask?.question })).toBeInTheDocument();
    expect(screen.getByLabelText("Inspection score exact field")).toBeInTheDocument();
    expect(screen.getByLabelText("Answer in your own words")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Answer in your own words"), { target: { value: "92%" } });
    expect(onAnswerChange).toHaveBeenCalledWith("92%");
  });

  it("announces agent processing stages to assistive technology", () => {
    render(
      <AgentTaskCard
        review={review}
        locale="en"
        answer="92%"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmSection={vi.fn()}
        onAcceptProposal={vi.fn()}
        onRejectProposal={vi.fn()}
        onUndo={vi.fn()}
        proposal={null}
        stage="checking_safety"
        busy
      >
        <div />
      </AgentTaskCard>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checking client-ready language");
  });

  it("requires an explicit action on an unsafe proposal", () => {
    render(
      <AgentTaskCard
        review={review}
        locale="en"
        answer=""
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onConfirmSection={vi.fn()}
        onAcceptProposal={vi.fn()}
        onRejectProposal={vi.fn()}
        onUndo={vi.fn()}
        proposal={{
          id: "proposal-1",
          status: "proposed",
          confidence: 0.8,
          fieldChanges: [{ field: "Priority", before: "Old", after: "New" }],
          review: { isClientSafe: false, issues: ["Contains internal blame"] },
        }}
        stage="idle"
        busy={false}
      >
        <div />
      </AgentTaskCard>,
    );
    expect(screen.getByText("Client-safety review required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept with warning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });
});
