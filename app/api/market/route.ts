import { runMarketPipeline } from "@/lib/server/market/pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url || typeof url !== "string" || !url.includes("amazon")) {
    return Response.json({ error: "Invalid Amazon URL" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const report = await runMarketPipeline(url, (progress) => send({ type: "progress", ...progress }));
        send({ type: "result", report });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Pipeline failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
