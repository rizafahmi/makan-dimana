import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listPlaces,
  tallyView,
  winnerView,
  winningSlots,
} from "../src/lib/session.ts";

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

const slots = (places: { slot: number }[]) => places.map((place) => place.slot);

test("winnerView splits the winners off the list with their Indonesian copy", () => {
  const leader = winnerView(
    listPlaces(row({ place1_votes: 4, place2_votes: 2 })),
    false,
  );
  assert.deepEqual(slots(leader.winners), [1]);
  assert.deepEqual(slots(leader.others), [2]);
  assert.equal(leader.kicker, "Pemenang");
  assert.equal(leader.sub, "4 dari 6 suara");
  assert.equal(leader.note, null);

  const tie = winnerView(
    listPlaces(
      row({
        place1_votes: 3,
        place2_votes: 3,
        place3_name: "Sate",
        place3_votes: 1,
      }),
    ),
    false,
  );
  assert.deepEqual(slots(tie.winners), [1, 2]);
  assert.deepEqual(slots(tie.others), [3]);
  assert.equal(tie.kicker, "Seri");
  assert.equal(tie.sub, "3 suara masing-masing");
  assert.equal(tie.note, null);

  const allZero = winnerView(listPlaces(row({})), false);
  assert.deepEqual(allZero.winners, []);
  assert.deepEqual(slots(allZero.others), [1, 2]);
  assert.equal(allZero.kicker, null);
  assert.equal(allZero.sub, null);
  assert.equal(allZero.note, "Belum ada pemenang");

  const open = winnerView(
    listPlaces(row({ place1_votes: 2, place2_votes: 1 })),
    true,
  );
  assert.deepEqual(open.winners, []);
  assert.deepEqual(slots(open.others), [1, 2]);
  assert.equal(open.kicker, null);
  assert.equal(open.note, null);
});

test("tallyView carries the total, the Indonesian tally line and each share", () => {
  const counted = tallyView(
    listPlaces(row({ place1_votes: 5, place2_votes: 2 })),
  );
  assert.equal(counted.total, 7);
  assert.equal(counted.text, "7 suara masuk · 2 tempat");
  assert.deepEqual(
    counted.places.map((place) => place.share),
    [71, 29],
  );

  const three = tallyView(
    listPlaces(
      row({
        place1_votes: 4,
        place2_votes: 2,
        place3_name: "Sate",
        place3_votes: 0,
      }),
    ),
  );
  assert.equal(three.text, "6 suara masuk · 3 tempat");
  assert.deepEqual(
    three.places.map((place) => place.share),
    [67, 33, 0],
  );

  const empty = tallyView(listPlaces(row({})));
  assert.equal(empty.total, 0);
  assert.equal(empty.text, "0 suara masuk · 2 tempat");
  assert.deepEqual(
    empty.places.map((place) => place.share),
    [0, 0],
  );
});
