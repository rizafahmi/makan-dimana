import assert from "node:assert/strict";
import { test } from "node:test";
import { publish, rooms, subscribe } from "../src/lib/relay.ts";

test("a publish reaches the subscribers of that session and nobody else", () => {
  const heard: string[] = [];
  subscribe("here111", () => heard.push("here"));
  subscribe("here111", () => heard.push("here too"));
  subscribe("e1sewh3", () => heard.push("elsewhere"));

  publish("here111");

  assert.deepEqual(heard, ["here", "here too"]);
});

test("dropping the last subscriber leaves the relay nothing to remember", () => {
  const heard: string[] = [];
  const settled = rooms();
  const drop = subscribe("g0n3111", () => heard.push("gone"));
  assert.equal(rooms(), settled + 1);

  drop();
  publish("g0n3111");

  assert.deepEqual(heard, []);
  assert.equal(rooms(), settled);
});
