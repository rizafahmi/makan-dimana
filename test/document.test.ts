import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDoc } from "../src/lib/merge.ts";

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
