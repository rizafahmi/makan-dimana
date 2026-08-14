import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDocs } from "../src/lib/merge.ts";

test("a lone creator document becomes a session row", () => {
  const session = mergeDocs([
    {
      device: "a3f1",
      title: "Makan siang Jumat",
      places: ["Warteg", "Padang"],
      created_at: "2026-08-14 03:00:00",
      closed: false,
      up: {},
      down: {},
    },
  ]);

  assert.equal(session.title, "Makan siang Jumat");
  assert.equal(session.created_at, "2026-08-14 03:00:00");
  assert.equal(session.is_open, 1);
  assert.equal(session.place1_name, "Warteg");
  assert.equal(session.place2_name, "Padang");
  assert.equal(session.place3_name, null);
  assert.equal(session.place4_name, null);
  assert.equal(session.place1_votes, 0);
});
