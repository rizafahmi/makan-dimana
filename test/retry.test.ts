import assert from "node:assert/strict";
import { test } from "node:test";
import { retryDelay } from "../src/lib/retry.ts";

test("the first retry waits half a second", () => {
  assert.equal(retryDelay(1), 500);
});

test("every later retry waits twice as long as the one before it", () => {
  assert.deepEqual(
    [2, 3, 4, 5, 6].map(retryDelay),
    [1000, 2000, 4000, 8000, 16000],
  );
});

test("the schedule gives up rather than retrying forever", () => {
  assert.equal(retryDelay(7), null);
  assert.equal(retryDelay(70), null);
});

test("an attempt before the first one is not a retry", () => {
  assert.equal(retryDelay(0), null);
});
