import assert from "node:assert/strict";
import { test } from "node:test";
import { listPlaces, winnerView, winningSlots } from "../src/lib/session.ts";

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

test("listPlaces orders by votes, with ties keeping slot order", () => {
  const ranked = listPlaces(
    row({
      place1_votes: 1,
      place2_votes: 5,
      place3_name: "Sate",
      place3_votes: 3,
    }),
  );

  assert.deepEqual(
    ranked.map((place) => place.slot),
    [2, 3, 1],
  );
  const tied = listPlaces(
    row({
      place1_votes: 2,
      place2_votes: 2,
      place3_name: "Sate",
      place3_votes: 2,
    }),
  );
  assert.deepEqual(
    tied.map((place) => place.slot),
    [1, 2, 3],
  );
});

test("winnerView carries the Indonesian winner copy for each outcome", () => {
  const leader = winnerView(
    listPlaces(row({ place1_votes: 2, place2_votes: 1 })),
    false,
  );
  assert.deepEqual(leader.winners, [1]);
  assert.equal(leader.label, "Pemenang");
  assert.equal(leader.note, null);

  const tie = winnerView(
    listPlaces(row({ place1_votes: 3, place2_votes: 3 })),
    false,
  );
  assert.deepEqual(tie.winners, [1, 2]);
  assert.equal(tie.note, "Seri!");

  const allZero = winnerView(listPlaces(row({})), false);
  assert.deepEqual(allZero.winners, []);
  assert.equal(allZero.note, "Belum ada pemenang");

  const open = winnerView(
    listPlaces(row({ place1_votes: 2, place2_votes: 1 })),
    true,
  );
  assert.deepEqual(open.winners, []);
  assert.equal(open.note, null);
});
