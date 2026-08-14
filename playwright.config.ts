import { defineConfig, devices } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const host = "127.0.0.1";
const port = 4329;
const origin = `http://${host}:${port}`;

const inherited = process.env.MAKAN_PW_DIR;
const dir = inherited ?? mkdtempSync(join(tmpdir(), "makan-pw-"));

if (!inherited) {
  process.env.MAKAN_PW_DIR = dir;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
}

const db = resolve(dir, "makan.db");
assert.notEqual(db, resolve("data/makan.db"));

export default defineConfig({
  testDir: "test",
  testMatch: "*.spec.ts",
  use: { baseURL: origin },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: "node dist/server/entry.mjs",
    url: origin,
    env: { MAKAN_DB: db, HOST: host, PORT: String(port) },
    reuseExistingServer: false,
  },
});
