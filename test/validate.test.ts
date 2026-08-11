import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCreate } from "../src/lib/validate.ts";

test("validateCreate trims fields and compacts places into sequential slots", () => {
  const result = validateCreate({
    title: "  Makan siang  ",
    places: ["", "  Warteg  ", "", "Padang"],
  });

  assert.deepEqual(result, {
    ok: true,
    title: "Makan siang",
    places: ["Warteg", "Padang"],
  });
});

test("validateCreate rejects a missing or overlong title with an Indonesian field error", () => {
  const missing = validateCreate({
    title: "   ",
    places: ["Warteg", "Padang"],
  });

  assert.deepEqual(missing, {
    ok: false,
    errors: { title: "Judul wajib diisi" },
  });

  const overlong = validateCreate({
    title: "x".repeat(101),
    places: ["Warteg", "Padang"],
  });

  assert.deepEqual(overlong, {
    ok: false,
    errors: { title: "Judul maksimal 100 karakter" },
  });

  const exact = validateCreate({
    title: "x".repeat(100),
    places: ["Warteg", "Padang"],
  });
  assert.equal(exact.ok, true);
});

test("validateCreate requires at least two non-empty places", () => {
  const one = validateCreate({
    title: "Makan siang",
    places: ["Warteg", " ", "", ""],
  });
  assert.deepEqual(one, {
    ok: false,
    errors: { places: "Isi minimal 2 tempat" },
  });
});

test("validatCreate rejects on overlong place name against its original slot", () => {
  const overlong = validateCreate({
    title: "Makan siang",
    places: ["Warteg", "", "x".repeat(61), "Padang"],
  });
  assert.deepEqual(overlong, {
    ok: false,
    errors: { place3: "Nama tempat maksimal 60 karakter" },
  });

  const exact = validateCreate({
    title: "Makan siang",
    places: ["Warteg", "x".repeat(60)],
  });
  assert.equal(exact.ok, true);
});
