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

test("tallies sum every document's ups minus downs, unclamped", () => {
  const session = mergeDocs([
    {
      device: "a3f1",
      title: "Makan siang Jumat",
      places: ["Warteg", "Padang"],
      created_at: "2026-08-14 03:00:00",
      closed: false,
      up: { "1": 2 },
      down: {},
    },
    {
      device: "b7c2",
      title: null,
      places: null,
      created_at: null,
      closed: false,
      up: { "1": 1 },
      down: { "1": 1, "2": 1 },
    },
  ]);

  assert.equal(session.place1_votes, 2);
  assert.equal(session.place2_votes, -1);
});

test("a session is closed when any document closed it", () => {
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
    {
      device: "b7c2",
      title: null,
      places: null,
      created_at: null,
      closed: true,
      up: {},
      down: {},
    },
  ]);

  assert.equal(session.is_open, 0);
});

test("the lower device id wins when two documents claim a title", () => {
  const session = mergeDocs([
    {
      device: "b7c2",
      title: "Sesi kedua",
      places: ["Sate", "Bakso"],
      created_at: "2026-08-14 04:00:00",
      closed: false,
      up: {},
      down: {},
    },
    {
      device: "a3f1",
      title: "Sesi pertama",
      places: ["Warteg", "Padang"],
      created_at: "2026-08-14 03:00:00",
      closed: false,
      up: {},
      down: {},
    },
  ]);

  assert.equal(session.title, "Sesi pertama");
  assert.equal(session.place1_name, "Warteg");
  assert.equal(session.created_at, "2026-08-14 03:00:00");
});
