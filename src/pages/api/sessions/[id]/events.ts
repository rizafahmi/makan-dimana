import type { APIRoute } from "astro";
import { normalizeSessionId } from "../../../../lib/id.ts";
import { subscribe } from "../../../../lib/relay.ts";

const greeting = "event: ready\ndata: ok\n\n";
const change = "data: changed\n\n";
const beat = ": beat\n\n";

const interval = Number(process.env.MAKAN_BEAT ?? 15_000);

export const GET: APIRoute = ({ params, request }) => {
  const id = normalizeSessionId(params.id ?? "");
  if (id === null) return Response.json({ error: "not_found" }, { status: 404 });

  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let live = true;

      const send = (frame: string) => {
        if (!live) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          stop();
        }
      };

      const drop = subscribe(id, () => send(change));
      const timer = setInterval(() => send(beat), interval);

      stop = () => {
        if (!live) return;
        live = false;
        drop();
        clearInterval(timer);
        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener("abort", stop, { once: true });
      send(greeting);
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
};
