import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyClose,
  applyVote,
  creatorDoc,
  emptyDoc,
} from "../src/lib/merge.ts";

test("an empty document holds nothing but its device", () => {
  assert.deepEqual(emptyDoc("a3f1"), {
    device: "a3f1",
    title: null,
    places: null,
    created_at: null,
    closed: false,
    up: {},
    down: {},
  });
});

test("a creator document carries the session's identity", () => {
  assert.deepEqual(
    creatorDoc(
      "a3f1",
      "Makan siang Jumat",
      ["Warteg", "Padang"],
      "2026-08-14 03:00:00",
    ),
    {
      device: "a3f1",
      title: "Makan siang Jumat",
      places: ["Warteg", "Padang"],
      created_at: "2026-08-14 03:00:00",
      closed: false,
      up: {},
      down: {},
    },
  );
});

test("an up vote increments its own slot and leaves the rest alone", () => {
  assert.deepEqual(applyVote({ ...emptyDoc("a3f1"), up: { "1": 1, "2": 3 } }, 1, 1), {
    device: "a3f1",
    title: null,
    places: null,
    created_at: null,
    closed: false,
    up: { "1": 2, "2": 3 },
    down: {},
  });
});

test("a cancelling vote increments the slot's down counter", () => {
  assert.deepEqual(applyVote({ ...emptyDoc("a3f1"), down: { "1": 1 } }, 1, -1), {
    device: "a3f1",
    title: null,
    places: null,
    created_at: null,
    closed: false,
    up: {},
    down: { "1": 2 },
  });
});

test("applying a vote leaves the document it was given untouched", () => {
  const before = { ...emptyDoc("a3f1"), up: { "1": 1 }, down: { "2": 1 } };

  applyVote(before, 1, 1);
  applyVote(before, 2, -1);

  assert.deepEqual(before.up, { "1": 1 });
  assert.deepEqual(before.down, { "2": 1 });
});

test("closing a document sets its flag and returns a new one", () => {
  const before = creatorDoc(
    "a3f1",
    "Makan siang Jumat",
    ["Warteg", "Padang"],
    "2026-08-14 03:00:00",
  );

  assert.deepEqual(applyClose(before), {
    device: "a3f1",
    title: "Makan siang Jumat",
    places: ["Warteg", "Padang"],
    created_at: "2026-08-14 03:00:00",
    closed: true,
    up: {},
    down: {},
  });
  assert.equal(before.closed, false);
});
