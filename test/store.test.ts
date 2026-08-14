import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDoc } from "../src/lib/merge.ts";
import { ownDoc, upsertDoc } from "../src/lib/store.ts";

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
