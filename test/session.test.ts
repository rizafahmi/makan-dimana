import assert from "node:assert/strict";
import { test } from "node:test";
import { listPlaces, winningSlots } from "../src/lib/session.ts";

const row = (fields: Record<string, unknown>) => ({
  place1_name: "Warteg",
  place1_votes: 0,
  place2_name: "Padang",
  place2_votes: 0,
  place3_name: null,
  place3_votes: 0,
  place4_name: null,
  place4_votes: 0,
  ...fields,
});

test("winningSlots marks leaders only when votes are positive", () => {
  const leader = listPlaces(row({ place1_votes: 2, place2_votes: 1 }));
  assert.deepEqual(winningSlots(leader), [1]);
  const tie = listPlaces(row({ place1_votes: 3, place2_votes: 3 }));
  assert.deepEqual(winningSlots(tie), [1, 2]);
  const allZero = listPlaces(row({}));
  assert.deepEqual(winningSlots(allZero), []);
  const emptySlotAhead = listPlaces(row({ place3_votes: 9 }));
  assert.deepEqual(winningSlots(emptySlotAhead), []);
});
