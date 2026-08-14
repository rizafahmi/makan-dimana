import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorDoc, emptyDoc } from "../src/lib/merge.ts";
import {
  applyPulled,
  localList,
  mergePulled,
  ownDoc,
  upsertDoc,
} from "../src/lib/store.ts";

test("a document replaces the one its device already wrote", () => {
  const held = [
    { ...emptyDoc("a3f1"), up: { "1": 1 } },
    { ...emptyDoc("b7c2"), up: { "2": 1 } },
  ];

  const next = upsertDoc(held, { ...emptyDoc("a3f1"), up: { "1": 2 } });

  assert.deepEqual(
    next.map((doc) => doc.device),
    ["a3f1", "b7c2"],
  );
  assert.deepEqual(next[0].up, { "1": 2 });
  assert.deepEqual(held[0].up, { "1": 1 });
});

test("a document from an unseen device is appended", () => {
  const held = [{ ...emptyDoc("a3f1"), up: { "1": 1 } }];

  const next = upsertDoc(held, { ...emptyDoc("c9d3"), up: { "3": 1 } });

  assert.deepEqual(
    next.map((doc) => doc.device),
    ["a3f1", "c9d3"],
  );
  assert.equal(held.length, 1);
});

test("a device is handed back its own document, never another's", () => {
  const held = [
    { ...emptyDoc("a3f1"), up: { "1": 1 } },
    { ...emptyDoc("b7c2"), closed: true },
  ];

  assert.deepEqual(ownDoc(held, "b7c2"), held[1]);
});

test("a device that has never written gets a fresh empty document", () => {
  const held = [{ ...emptyDoc("a3f1"), up: { "1": 1 } }];

  assert.deepEqual(ownDoc(held, "c9d3"), emptyDoc("c9d3"));
  assert.equal(held.length, 1);
});

test("a pulled document from another device joins the ones this device holds", () => {
  const held = [
    creatorDoc(
      "a3f1",
      "Makan siang Jumat",
      ["Warteg", "Padang"],
      "2026-08-14 03:00:00",
    ),
  ];

  const next = mergePulled(
    held,
    [JSON.stringify({ ...emptyDoc("b7c2"), up: { "1": 1 } })],
    "a3f1",
  );

  assert.deepEqual(
    next.map((doc) => doc.device),
    ["a3f1", "b7c2"],
  );
  assert.deepEqual(next[1], { ...emptyDoc("b7c2"), up: { "1": 1 } });
  assert.equal(held.length, 1);
});

test("a pulled document that will not parse is skipped, not fatal", () => {
  const next = mergePulled(
    [],
    [
      "not json at all {{{",
      JSON.stringify({ ...emptyDoc("b7c2"), up: { "1": 1 } }),
    ],
    "a3f1",
  );

  assert.deepEqual(
    next.map((doc) => doc.device),
    ["b7c2"],
  );
});

test("a pulled string that parses but is not a document is skipped too", () => {
  const junk = ['{"title":"Sesi palsu"}', '"sesi"', "null", "42", "[]"];

  assert.deepEqual(mergePulled([], junk, "a3f1"), []);
});

test("a pulled copy of this device's own document never overwrites it", () => {
  const own = { ...emptyDoc("a3f1"), up: { "1": 2 } };
  const stale = { ...emptyDoc("a3f1"), up: { "1": 1 } };
  const other = emptyDoc("b7c2");

  const next = mergePulled(
    [own],
    [JSON.stringify(stale), JSON.stringify(other)],
    "a3f1",
  );

  assert.deepEqual(next, [own, other]);
});

test("a pull that lands nothing hands back no session to store", () => {
  const own = { ...emptyDoc("a3f1"), up: { "1": 1 } };
  const held = { id: "abc1234", docs: [own] };

  assert.equal(applyPulled(held, [JSON.stringify(own), "junk"], "a3f1"), null);
});

test("a pull that repeats what this device already holds lands nothing either", () => {
  const own = creatorDoc(
    "a3f1",
    "Makan siang Jumat",
    ["Warteg", "Padang"],
    "2026-08-14 03:00:00",
  );
  const other = { ...emptyDoc("b7c2"), up: { "1": 1 } };
  const held = { id: "abc1234", docs: [own, other] };

  assert.equal(
    applyPulled(held, [own, other].map((doc) => JSON.stringify(doc)), "a3f1"),
    null,
  );
});

test("the local list holds every stored session that has a creator document", () => {
  const rows = localList([
    {
      id: "abc1234",
      docs: [
        creatorDoc(
          "a3f1",
          "Makan siang Jumat",
          ["Warteg", "Padang"],
          "2026-08-14 03:00:00",
        ),
        { ...emptyDoc("b7c2"), closed: true },
      ],
    },
    { id: "def5678", docs: [{ ...emptyDoc("b7c2"), up: { "1": 1 } }] },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "abc1234");
  assert.equal(rows[0].title, "Makan siang Jumat");
  assert.equal(rows[0].created_at, "2026-08-14 03:00:00");
  assert.equal(rows[0].is_open, 0);
});

test("the local list is newest first, and the session id breaks a tie", () => {
  const held = (id: string, createdAt: string) => ({
    id,
    docs: [creatorDoc("a3f1", id, ["Warteg", "Padang"], createdAt)],
  });

  const rows = localList([
    held("bbb1111", "2026-08-14 03:00:00"),
    held("ccc2222", "2026-08-14 05:00:00"),
    held("ddd3333", "2026-08-14 03:00:00"),
  ]);

  assert.deepEqual(
    rows.map((row) => row.id),
    ["ccc2222", "ddd3333", "bbb1111"],
  );
});
