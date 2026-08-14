import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alphabet,
  generateSessionId,
  normalizeSessionId,
} from "../src/lib/id.ts";

test("generated ids are canonical and reach every letter of the alphabet", () => {
  const ids = Array.from({ length: 256 }, () => generateSessionId());

  for (const id of ids) assert.equal(normalizeSessionId(id), id);

  assert.equal(new Set(ids.join("")).size, alphabet.length);
});

test("normalizeSessionId canonicalizes valid ids and rejects malformed ones", () => {
  assert.equal(normalizeSessionId("ABCl2Ox"), "abc120x");
  assert.equal(normalizeSessionId("abc12qx"), "abc12qx");
  assert.equal(normalizeSessionId("abc12u3"), null);
  assert.equal(normalizeSessionId("short"), null);
  assert.equal(normalizeSessionId("toolong1"), null);
  assert.equal(normalizeSessionId("abc12!3"), null);
});
