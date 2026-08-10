import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

test("a second process importing the module leaves existing data intact", async () => {
  const { db } = await import("../src/lib/db.ts");

  db.prepare(
    "INSERT INTO vote_sessions (id, title, place1_name, place2_name) VALUES (?, ?, ?, ?)",
  ).run("noop001", "Makan malam", "Sate", "Bakso");

  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(pathToFileURL("src/lib/db.ts").href)})`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM vote_sessions WHERE id = ?")
      .get("noop001")?.n,
    1,
  );
});

test("re-evaluating the module reuses the one connection", async () => {
  const reload = "../src/lib/db.ts?hmr";
  const first = await import("../src/lib/db.ts");
  const second = await import(reload);

  assert.equal(second.db, first.db);
});

test("a minimal insert takes the documented defaults", async () => {
  const { db } = await import("../src/lib/db.ts");

  db.prepare(
    "INSERT INTO vote_sessions (id, title, place1_name, place2_name) VALUES (?, ?, ?, ?)",
  ).run("abc12qx", "Makan siang", "Warteg", "Padang");

  const row = db
    .prepare("SELECT * FROM vote_sessions WHERE id = ?")
    .get("abc12qx");

  assert.equal(row?.is_open, 1);
  assert.equal(row?.place1_votes, 0);
  assert.equal(row?.place2_votes, 0);
  assert.equal(row?.place3_name, null);
  assert.equal(row?.place3_votes, 0);
  assert.equal(row?.place4_name, null);
  assert.equal(row?.place4_votes, 0);
  assert.match(
    String(row?.created_at),
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  );
});

test("the CHECK constraints reject empty names and out-of-range numbers", async () => {
  const { db } = await import("../src/lib/db.ts");

  const insert = db.prepare(
    "INSERT INTO vote_sessions (id, title, is_open, place1_name, place1_votes, place2_name, place3_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const run = (
    id: string,
    title: string,
    isOpen: number,
    place1: string,
    votes1: number,
    place3: string | null,
  ) => insert.run(id, title, isOpen, place1, votes1, "Padang", place3);

  assert.throws(
    () => run("check01", "", 1, "Warteg", 0, null),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => run("check02", "Makan siang", 2, "Warteg", 0, null),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => run("check03", "Makan siang", 1, "", 0, null),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => run("check04", "Makan siang", 1, "Warteg", -1, null),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => run("check05", "Makan siang", 1, "Warteg", 0, ""),
    /CHECK constraint failed/,
  );

  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM vote_sessions WHERE id LIKE 'check%'")
      .get()?.n,
    0,
  );
});
