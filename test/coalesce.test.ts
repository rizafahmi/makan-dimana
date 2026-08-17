import assert from "node:assert/strict";
import { test } from "node:test";
import { coalescing } from "../src/lib/coalesce.ts";

test("a call while one is already running does not start a second", async () => {
  let started = 0;
  let finish = () => {};
  const gate = new Promise<void>((resolve) => {
    finish = () => resolve();
  });

  const run = coalescing(async () => {
    started += 1;
    await gate;
    return true;
  });

  const first = run();
  run();

  assert.equal(started, 1);
  finish();
  await first;
});

test("calls that arrive mid-run collapse into one run afterwards", async () => {
  let started = 0;
  let finish = () => {};
  const gate = new Promise<void>((resolve) => {
    finish = () => resolve();
  });
  const run = coalescing(async () => {
    started += 1;
    if (started === 1) await gate;
    return true;
  });
  const first = run();
  run();
  run();
  finish();
  await first;

  assert.equal(started, 2);
});

test("a call during the trailing run gets its own run too", async () => {
  let started = 0;
  const gates: Array<() => void> = [];
  const wait = () =>
    new Promise<void>((resolve) => {
      gates.push(() => resolve());
    });
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const run = coalescing(async () => {
    started += 1;
    if (started <= 2) await wait();
    return true;
  });
  const first = run();
  run();
  gates[0]();
  await tick();
  run();
  gates[1]();
  await first;
  assert.equal(started, 3);
});

test("a skipped call reports success so its not retried", async () => {
  let finish = () => {};
  const gate = new Promise<void>((resolve) => {
    finish = () => resolve();
  });
  const run = coalescing(async () => {
    await gate;
    return true;
  });
  const first = run();
  const skipped = await run();

  assert.equal(skipped, true);
  finish();
  await first;
});

test("a run that fails reports failure so its retried", async () => {
  const run = coalescing(async () => false);
  assert.equal(await run(), false);
});
