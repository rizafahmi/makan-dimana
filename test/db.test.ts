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
  const { listDocs, putDoc } = await import("../src/lib/db.ts");

  putDoc("n00p001", "a3f1", '{"device":"a3f1","title":"Makan malam"}');

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
  assert.deepEqual(listDocs("n00p001"), [
    '{"device":"a3f1","title":"Makan malam"}',
  ]);
});

test("re-evaluating the module reuses the one connection", async () => {
  const reload = "../src/lib/db.ts?hmr";
  const first = await import("../src/lib/db.ts");
  const second = await import(reload);

  assert.equal(second.db, first.db);
});

test("putDoc stores a document listDocs hands back byte-identical", async () => {
  const { listDocs, putDoc } = await import("../src/lib/db.ts");

  const doc = '{"device":"a3f1","title":"Makan siang","up":{"1":1}}';
  putDoc("abc12qx", "a3f1", doc);

  assert.deepEqual(listDocs("abc12qx"), [doc]);
});

test("a device's second document replaces its first rather than joining it", async () => {
  const { listDocs, putDoc } = await import("../src/lib/db.ts");

  putDoc("rep1ac0", "a3f1", '{"up":{}}');
  putDoc("rep1ac0", "a3f1", '{"up":{"1":1}}');

  assert.deepEqual(listDocs("rep1ac0"), ['{"up":{"1":1}}']);
});

test("two devices in one session are two documents", async () => {
  const { listDocs, putDoc } = await import("../src/lib/db.ts");

  putDoc("tw0d3v0", "a3f1", '{"device":"a3f1"}');
  putDoc("tw0d3v0", "b7c2", '{"device":"b7c2"}');

  assert.deepEqual(listDocs("tw0d3v0").toSorted(), [
    '{"device":"a3f1"}',
    '{"device":"b7c2"}',
  ]);
});

test("a session nobody has written to holds no documents", async () => {
  const { listDocs, putDoc } = await import("../src/lib/db.ts");

  putDoc("kn0wn00", "a3f1", '{"device":"a3f1"}');

  assert.deepEqual(listDocs("unkn0wn"), []);
});

test("every stored document is stamped with the time it was written", async () => {
  const { db, putDoc } = await import("../src/lib/db.ts");

  putDoc("stamp3d", "a3f1", '{"device":"a3f1"}');
  const row = db
    .prepare("SELECT updated_at FROM session_docs WHERE session_id = ?")
    .get("stamp3d");

  assert.match(
    String(row?.updated_at),
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  );
});
