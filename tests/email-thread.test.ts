import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockEmailProvider } from "@/lib/email/providers/MockEmailProvider";

// Mock Graph auth so the provider can run without a real token/DB connection.
vi.mock("@/lib/email/providers/graphAuth", () => ({
  getValidAccessToken: async () => "test-token",
  isGraphConfigured: () => true,
  getConnectedAccount: async () => ({
    email: "bot@outlook.com",
    refreshToken: "x",
  }),
}));

describe("Mock provider thread & reply metadata", () => {
  const provider = new MockEmailProvider();

  it("preserves the provided thread id on outbound sends", async () => {
    const res = await provider.sendEmail({
      to: "user@x.com",
      subject: "Re: McGill Q1",
      text: "hi",
      threadId: "conv-123",
      replyToProviderMessageId: "msg-1",
    });
    expect(res.threadId).toBe("conv-123");
  });

  it("parses provider threading/reply metadata from inbound payloads", () => {
    const inbound = provider.parseInboundPayload({
      fromEmail: "user@x.com",
      subject: "Re: McGill Q1",
      bodyText: "thanks",
      conversationId: "conv-123",
      providerMessageId: "msg-9",
      internetMessageId: "<abc@mail>",
      inReplyTo: "<prev@mail>",
      references: "<root@mail> <prev@mail>",
    });
    expect(inbound.conversationId).toBe("conv-123");
    expect(inbound.providerMessageId).toBe("msg-9");
    expect(inbound.internetMessageId).toBe("<abc@mail>");
    expect(inbound.inReplyTo).toBe("<prev@mail>");
    expect(inbound.references).toContain("<root@mail>");
  });

  it("derives a stable thread id from a normalized subject", () => {
    const a = provider.getThreadId({ subject: "McGill Q1 deck" });
    const b = provider.getThreadId({ subject: "Re: McGill Q1 deck" });
    expect(a).toBe(b);
  });
});

describe("Microsoft Graph reply preserves the conversation thread", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses createReply on the original message id and threads via conversationId", async () => {
    const { MicrosoftGraphEmailProvider } =
      await import("@/lib/email/providers/MicrosoftGraphEmailProvider");
    const provider = new MicrosoftGraphEmailProvider();

    // Real Graph message ids contain URL-unsafe characters (/, +, =) — the draft
    // id must be encoded on the PATCH/send calls or threading breaks.
    const draftId = "AAMkAGI2/Reply+abc=";
    fetchMock
      .mockResolvedValueOnce(
        jsonRes({ id: draftId, conversationId: "conv-abc" }),
      ) // createReply
      .mockResolvedValueOnce(jsonRes({ body: { content: "" } })) // GET draft quoted body
      .mockResolvedValueOnce(jsonRes({})) // PATCH body
      .mockResolvedValueOnce(okRes()); // send

    const res = await provider.sendEmail({
      to: "user@x.com",
      subject: "Re: McGill Q1",
      text: "Here's your answer",
      replyToProviderMessageId: "original/msg=id",
      threadId: "conv-abc",
    });

    // First call must hit createReply on the ORIGINAL message id (encoded).
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain(
      `/messages/${encodeURIComponent("original/msg=id")}/createReply`,
    );
    // The send must go through the (encoded) draft, not /sendMail.
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain(`/messages/${encodeURIComponent(draftId)}/send`);
    expect(lastUrl).not.toContain("/sendMail");
    // Raw unencoded id must NOT appear in the URL (would 400/404 and break threading).
    expect(lastUrl).not.toContain(draftId);
    // Result threadId is the provider conversation id → same Outlook conversation.
    expect(res.threadId).toBe("conv-abc");
  });

  it("falls back to a fresh send when no original message id is available", async () => {
    const { MicrosoftGraphEmailProvider } =
      await import("@/lib/email/providers/MicrosoftGraphEmailProvider");
    const provider = new MicrosoftGraphEmailProvider();
    fetchMock.mockResolvedValueOnce(okRes()); // sendMail

    await provider.sendEmail({
      to: "user@x.com",
      subject: "Re: McGill Q1",
      text: "hi",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/sendMail");
  });
});

function jsonRes(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
function okRes() {
  return {
    ok: true,
    status: 202,
    json: async () => ({}),
    text: async () => "",
  };
}
