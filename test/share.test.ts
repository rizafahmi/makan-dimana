import assert from "node:assert/strict";
import { test } from "node:test";
import { qrSvg } from "../src/lib/share.ts";

test("qrSvg renders an svg and returns null when encoding fails", async () => {
  const svg = await qrSvg("http://127.0.0.1:4321/s/abc12qx");
  assert.match(String(svg), /<svg/);

  assert.equal(await qrSvg("x".repeat(5000)), null);
});
