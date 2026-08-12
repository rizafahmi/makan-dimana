import assert from "node:assert/strict";
import { test } from "node:test";
import { relativeTime } from "../src/lib/time.ts";

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
