import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { postForm, putDoc, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

const tunnelHost = "demo.tailnet.ts.net";

const proxiedPost = (
  id: string,
  headers: Record<string, string>,
  fields: Record<string, string>,
) =>
  fetch(`${server.origin}/api/sessions/${id}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
    redirect: "manual",
  });

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("POST /api/sessions/[id] takes a device's document and answers 204", async () => {
  const res = await putDoc(
    server.origin,
    "abc12qx",
    "a3f1",
    '{"device":"a3f1","title":"Sesi API"}',
  );

  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
});

test("GET /api/sessions/[id] hands back a document the server cannot parse", async () => {
  const doc = 'not json at all {{{ "kutipan" \\ ünïcode\nbaris kedua';
  await putDoc(server.origin, "0paqe70", "a3f1", doc);

  const res = await fetch(`${server.origin}/api/sessions/0paqe70`);
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("content-type")), /application\/json/);
  assert.deepEqual(await res.json(), [doc]);
});

test("GET /api/sessions/[id] resolves the id it was given, or 404s it", async () => {
  const doc = '{"device":"a3f1","title":"Sesi mirip"}';
  await putDoc(server.origin, "abc120x", "a3f1", doc);

  const typo = await fetch(`${server.origin}/api/sessions/ABCl2Ox`);
  assert.equal(typo.status, 200);
  assert.deepEqual(await typo.json(), [doc]);

  const unknown = await fetch(`${server.origin}/api/sessions/zzzzzzz`);
  assert.equal(unknown.status, 200);
  assert.deepEqual(await unknown.json(), []);

  for (const id of ["zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await fetch(`${server.origin}/api/sessions/${id}`);
    assert.equal(res.status, 404, `expected 404 for ${id}`);
  }
});

test("POST /api/sessions/[id] stores a document under the canonical id", async () => {
  const doc = '{"device":"a3f1","title":"Sesi non-kanonik"}';
  const res = await putDoc(server.origin, "ABCl23x", "a3f1", doc);
  assert.equal(res.status, 204);

  const canonical = await fetch(`${server.origin}/api/sessions/abc123x`);
  assert.deepEqual(await canonical.json(), [doc]);
});

test("POST /api/sessions/[id] refuses a malformed id and a body it cannot read", async () => {
  const doc = '{"device":"a3f1"}';
  for (const id of ["zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await putDoc(server.origin, id, "a3f1", doc);
    assert.equal(res.status, 404, `expected 404 for ${id}`);
  }

  const partial: Record<string, string>[] = [{}, { device: "a3f1" }, { doc }];
  for (const fields of partial) {
    const res = await postForm(server.origin, "/api/sessions/re1ect0", fields);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(fields)}`);
  }

  const upload = new FormData();
  upload.set("device", "a3f1");
  upload.set("doc", new Blob([doc]), "doc.json");

  for (const body of [upload, "{not json at all"]) {
    const res = await fetch(`${server.origin}/api/sessions/re1ect0`, {
      method: "POST",
      headers:
        typeof body === "string"
          ? { origin: server.origin, "content-type": "application/json" }
          : { origin: server.origin },
      body,
      redirect: "manual",
    });
    assert.equal(res.status, 400, `expected 400 for ${typeof body}`);
  }

  const stored = await fetch(`${server.origin}/api/sessions/re1ect0`);
  assert.deepEqual(await stored.json(), []);
});

test("POST /api/sessions/[id] takes a document from behind an HTTPS proxy", async () => {
  const doc = '{"device":"a3f1","title":"Sesi lewat terowongan"}';
  const res = await proxiedPost(
    "f0rwrd1",
    {
      "x-forwarded-proto": "https",
      "x-forwarded-host": tunnelHost,
      origin: `https://${tunnelHost}`,
    },
    { device: "a3f1", doc },
  );

  assert.equal(res.status, 204);

  const stored = await fetch(`${server.origin}/api/sessions/f0rwrd1`);
  assert.deepEqual(await stored.json(), [doc]);
});

test("POST /api/sessions/[id] still refuses a genuinely cross-site request", async () => {
  const doc = '{"device":"a3f1","title":"Sesi curian"}';
  const forged: Record<string, string>[] = [
    {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "demo.tailnet.example.com",
      origin: "https://demo.tailnet.example.com",
    },
    {
      "x-forwarded-proto": "https",
      "x-forwarded-host": tunnelHost,
      origin: "https://jahat.example.com",
    },
    {
      "x-forwarded-proto": "https",
      "x-forwarded-host": `${tunnelHost}.jahat.example.com`,
      origin: `https://${tunnelHost}.jahat.example.com`,
    },
  ];

  for (const headers of forged) {
    const res = await proxiedPost("f0rg3d1", headers, { device: "a3f1", doc });
    assert.equal(res.status, 403, `expected 403 for ${JSON.stringify(headers)}`);
  }

  const stored = await fetch(`${server.origin}/api/sessions/f0rg3d1`);
  assert.deepEqual(await stored.json(), []);
});

test("GET /api/sessions is gone, because the landing list is local", async () => {
  const res = await fetch(`${server.origin}/api/sessions`);
  assert.equal(res.status, 404);
});
