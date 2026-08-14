process.env.TZ = "Asia/Jakarta";

import assert from "node:assert/strict";
import { test } from "node:test";
import { relativeTime, utcTimestamp } from "../src/lib/time.ts";

const at = (iso: string) => new Date(iso);

test("relativeTime pins each Indonesian boundary", () => {
  const now = at("2026-08-12T12:00:00Z");

  assert.equal(relativeTime(at("2026-08-12T11:59:30Z"), now), "baru saja");
  assert.equal(relativeTime(at("2026-08-12T11:59:00Z"), now), "1 menit lalu");
  assert.equal(relativeTime(at("2026-08-12T11:01:00Z"), now), "59 menit lalu");
  assert.equal(relativeTime(at("2026-08-12T11:00:00Z"), now), "1 jam lalu");
  assert.equal(relativeTime(at("2026-08-11T12:00:00Z"), now), "kemarin");

  assert.equal(relativeTime(at("2026-08-10T12:00:00Z"), now), "2 hari lalu");
});

test("utcTimestamp writes datetime('now') format, in UTC and zero-padded", () => {
  assert.equal(utcTimestamp(at("2026-08-14T03:07:09Z")), "2026-08-14 03:07:09");
  assert.equal(utcTimestamp(at("2026-01-02T00:00:00Z")), "2026-01-02 00:00:00");
  assert.equal(
    utcTimestamp(at("2026-12-31T23:59:59.987Z")),
    "2026-12-31 23:59:59",
  );
  assert.equal(utcTimestamp(at("2026-08-13T21:30:00Z")), "2026-08-13 21:30:00");
});
