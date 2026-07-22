import { POST as collaboratePost } from "../route";

const encoder = new TextEncoder();

function event(name: string, data: unknown) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Forward identity headers so collaborate auth still sees the Databricks SSO user. */
function forwardHeaders(req: Request): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  for (const key of [
    "cookie",
    "x-forwarded-email",
    "x-forwarded-user",
    "x-forwarded-preferred-username",
    "x-forwarded-host",
  ]) {
    const value = req.headers.get(key);
    if (value) headers[key] = value;
  }
  return headers;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.text();
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/\/stream\/?$/, "");

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(event("stage", { stage: "understanding" }));
        controller.enqueue(event("stage", { stage: "preparing" }));
        controller.enqueue(event("stage", { stage: "checking_safety" }));
        const response = await collaboratePost(
          new Request(url, {
            method: "POST",
            headers: forwardHeaders(req),
            body,
          }),
          { params },
        );
        const result = await response.json();
        controller.enqueue(event("stage", {
          stage: result.changed ? "updating_deck" : "reviewing_slide",
        }));
        controller.enqueue(event(response.ok ? "result" : "error", result));
      } catch (error) {
        controller.enqueue(event("error", { error: (error as Error).message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
