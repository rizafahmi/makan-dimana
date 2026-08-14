import type { APIContext } from "astro";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { putDoc, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

const patience = 5_000;

const listen = async (path: string) => {
  const res = await fetch(`${server.origin}${path}`);
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let seen = "";

  const until = async (match: RegExp, timeout = patience) => {
    const deadline = Date.now() + timeout;
    while (!match.test(seen)) {
      if (reader === undefined) throw new Error("stream carried no body");
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`never saw ${match}, only:\n${seen}`);

      let timer: NodeJS.Timeout | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), left);
        }),
      ]);
      clearTimeout(timer);

      if (chunk === undefined) throw new Error(`never saw ${match}, only:\n${seen}`);
      if (chunk.done) throw new Error(`stream ended before ${match}, saw:\n${seen}`);
      seen += decoder.decode(chunk.value, { stream: true });
    }
    return seen;
  };

  return { res, until, close: () => reader?.cancel() };
};

before(async () => {
  server = await startServer({ MAKAN_BEAT: "200" });
});

after(async () => {
  await server.stop();
});

test("GET /api/sessions/[id]/events opens a stream and says so at once", async () => {
  const live = await listen("/api/sessions/str3am1/events");

  assert.equal(live.res.status, 200);
  assert.match(String(live.res.headers.get("content-type")), /text\/event-stream/);
  assert.match(String(live.res.headers.get("cache-control")), /no-store/);
  assert.match(await live.until(/\n\n/), /^event: ready\ndata: \S+\n\n/);

  await live.close();
});

test("GET /api/sessions/[id]/events refuses an id no session can have", async () => {
  for (const id of ["zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await fetch(`${server.origin}/api/sessions/${id}/events`);
    await res.body?.cancel();
    assert.equal(res.status, 404, `expected 404 for ${id}`);
  }
});

test("a document written for that session reaches an open stream, and says nothing about it", async () => {
  const live = await listen("/api/sessions/N0T1FLY/events");
  await live.until(/event: ready/);

  const stored = await putDoc(
    server.origin,
    "n0t1f1y",
    "a3f1",
    '{"device":"a3f1","title":"Sesi berdenting"}',
  );
  assert.equal(stored.status, 204);

  const seen = await live.until(/^data: changed\n\n/m);
  assert.doesNotMatch(seen, /a3f1|berdenting/);

  await live.close();
});

test("a stream nobody writes to is held open by a heartbeat", async () => {
  const live = await listen("/api/sessions/qw13tt0/events");
  await live.until(/event: ready/);

  assert.match(await live.until(/^:.*\n\n/m), /^:.*\n\n/m);

  await live.close();
});

const timers = () =>
  process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;

test("a device that goes away leaves the relay no subscriber and no timer", async () => {
  const { GET } = await import("../src/pages/api/sessions/[id]/events.ts");
  const { rooms } = await import("../src/lib/relay.ts");

  const context = {
    params: { id: "g0n3dev" },
    request: new Request(`${server.origin}/api/sessions/g0n3dev/events`),
  } as unknown as APIContext;

  const settled = { rooms: rooms(), timers: timers() };
  const res = await GET(context);
  const reader = (res as Response).body?.getReader();
  await reader?.read();

  assert.equal(rooms(), settled.rooms + 1);
  assert.equal(timers(), settled.timers + 1);

  await reader?.cancel();

  assert.equal(rooms(), settled.rooms);
  assert.equal(timers(), settled.timers);
});

test("a device that hangs up does not take the next one's stream with it", async () => {
  const gone = await listen("/api/sessions/dr0pp3d/events");
  await gone.until(/event: ready/);
  await gone.close();

  await putDoc(server.origin, "dr0pp3d", "gh0st", '{"device":"gh0st"}');

  const live = await listen("/api/sessions/dr0pp3d/events");
  await live.until(/event: ready/);

  await putDoc(server.origin, "dr0pp3d", "a3f1", '{"device":"a3f1"}');
  await live.until(/^data: changed\n\n/m);

  await live.close();
});
