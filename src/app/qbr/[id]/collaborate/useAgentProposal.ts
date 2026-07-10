"use client";

import { useCallback, useState } from "react";

export interface ProposalView {
  id: string;
  status: string;
  section?: string | null;
  confidence: number;
  explanation?: string | null;
  fieldChanges: Array<{ field: string; before?: unknown; after?: unknown }>;
  review?: { isClientSafe: boolean; issues: string[]; suggestedRewrite?: string | null } | null;
}

export type AgentStage =
  | "idle"
  | "understanding"
  | "preparing"
  | "checking_safety"
  | "updating_deck"
  | "reviewing_slide";

async function readEventStream(
  response: Response,
  onStage: (stage: AgentStage) => void,
): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error("Streaming response was unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: Record<string, unknown> | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const eventName = chunk.match(/^event:\s*(.+)$/m)?.[1];
      const raw = chunk.match(/^data:\s*(.+)$/m)?.[1];
      if (!raw) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (eventName === "stage" && typeof data.stage === "string") {
        onStage(data.stage as AgentStage);
      } else if (eventName === "result") {
        final = data;
      } else if (eventName === "error") {
        throw new Error(String(data.error ?? "Agent request failed"));
      }
    }
    if (done) break;
  }
  if (!final) throw new Error("The agent did not return a result");
  return final;
}

export function useAgentProposal(qbrId: string) {
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [stage, setStage] = useState<AgentStage>("idle");
  const [activity, setActivity] = useState<string[]>([]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/qbr/${qbrId}/collaborate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? response.statusText);
    return data as Record<string, unknown>;
  }, [qbrId]);

  const propose = useCallback(async (message: string, activeSection: string) => {
    setStage("understanding");
    setActivity([]);
    try {
      let data: Record<string, unknown>;
      try {
        const response = await fetch(`/api/qbr/${qbrId}/collaborate/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, action: "propose", activeSection }),
        });
        if (!response.ok || !response.body) throw new Error(response.statusText);
        data = await readEventStream(response, (next) => {
          setStage(next);
          setActivity((items) => [...items, next]);
        });
      } catch {
        data = await post({ message, action: "propose", activeSection });
      }
      setProposal((data.proposal as ProposalView | null) ?? null);
      return data;
    } finally {
      setStage("idle");
    }
  }, [post, qbrId]);

  const accept = useCallback(async () => {
    if (!proposal) throw new Error("No proposal is ready");
    setStage("updating_deck");
    try {
      const data = await post({ action: "accept", changeSetId: proposal.id, activeSection: proposal.section });
      setProposal(null);
      return data;
    } finally {
      setStage("idle");
    }
  }, [post, proposal]);

  const reject = useCallback(async () => {
    if (!proposal) return null;
    const data = await post({ action: "reject", changeSetId: proposal.id });
    setProposal(null);
    return data;
  }, [post, proposal]);

  const undo = useCallback(async () => {
    setStage("updating_deck");
    try {
      setProposal(null);
      return await post({ action: "undo" });
    } finally {
      setStage("idle");
    }
  }, [post]);

  const clearProposal = useCallback(() => setProposal(null), []);
  return { proposal, stage, activity, propose, accept, reject, undo, clearProposal };
}
