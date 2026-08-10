import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let dir: string;
let file: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "makan-db-"));
  file = join(dir, "nested", "makan.db");
  process.env.MAKAN_DB = file;
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("first import creates the database in DELETE journal mode", async () => {
  const { db } = await import("../src/lib/db.ts");

  assert.ok(existsSync(file));
  assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
  assert.equal(existsSync(`${file}-shm`), false);
});

test("re-evaluating the module reuses the one connection", async () => {
  const reload = "../src/lib/db.ts?hmr";
  const first = await import("../src/lib/db.ts");
  const second = await import(reload);

  assert.equal(second.db, first.db);
});
