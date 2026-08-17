import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDoc, mergeDocs, votesCast } from "../src/lib/merge.ts";

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

  assert.ok(session);
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

  assert.ok(session);
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

  assert.ok(session);
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

  assert.ok(session);
  assert.equal(session.title, "Sesi pertama");
  assert.equal(session.place1_name, "Warteg");
  assert.equal(session.created_at, "2026-08-14 03:00:00");
});

test("a session with no creator document is not held at all", () => {
  const votesOnly = mergeDocs([
    {
      device: "b7c2",
      title: null,
      places: null,
      created_at: null,
      closed: false,
      up: { "1": 1 },
      down: {},
    },
  ]);

  assert.equal(votesOnly, null);
  assert.equal(mergeDocs([]), null);
});

test("a device's own standing votes for a slot are its ups minus its downs", () => {
  const doc = {
    ...emptyDoc("a3f1"),
    up: { "1": 3, "2": 1 },
    down: { "1": 1 },
  };

  assert.equal(votesCast(doc, 1), 2);
  assert.equal(votesCast(doc, 2), 1);
  assert.equal(votesCast(doc, 3), 0);
});
