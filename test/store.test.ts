import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorDoc, emptyDoc } from "../src/lib/merge.ts";
import { localList, ownDoc, upsertDoc } from "../src/lib/store.ts";

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
