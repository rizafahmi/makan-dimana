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

test("createSession round-trips a 2-place session with null unused slots", async () => {
  const { createSession, getSession } = await import("../src/lib/db.ts");

  const id = createSession({
    title: "Makan siang tim",
    places: ["Warteg", "Padang"],
  });

  assert.match(id, /^[0-9abcdefghjkmnpqrstvwxyz]{7}$/);

  const session = getSession(id);
  assert.equal(session?.title, "Makan siang tim");
  assert.equal(session?.is_open, 1);
  assert.equal(session?.place1_name, "Warteg");
  assert.equal(session?.place2_name, "Padang");
  assert.equal(session?.place3_name, null);
  assert.equal(session?.place4_name, null);
});

test("createSession retries id generation on a primary-key collision", async () => {
  const { createSession, getSession } = await import("../src/lib/db.ts");

  const taken = createSession({
    title: "Sesi pertama",
    places: ["Warteg", "Padang"],
  });
  const ids = [taken, taken, "fresh77"];
  const id = createSession(
    { title: "Sesi kedua", places: ["Bakso", "Sate"] },
    () => ids.shift() ?? "fresh77",
  );

  assert.equal(id, "fresh77");
  assert.equal(getSession(id)?.title, "Sesi kedua");
});

test("createSession propagates a non-collision database error without retrying", async () => {
  const { createSession } = await import("../src/lib/db.ts");

  let calls = 0;
  const generate = () => {
    calls++;
    return `propag${calls}`;
  };

  assert.throws(
    () => createSession({ title: "", places: ["Warteg", "Padang"] }, generate),
    /CHECK constraint failed/,
  );

  assert.equal(calls, 1);
});

test("createSession gives up after 5 retries on persistent collisions", async () => {
  const { createSession } = await import("../src/lib/db.ts");

  const taken = createSession({
    title: "Sesi penuh",
    places: ["Warteg", "Padang"],
  });

  let calls = 0;
  const generate = () => {
    calls++;
    return taken;
  };

  assert.throws(
    () =>
      createSession(
        { title: "Sesi gagal", places: ["Bakso", "Sate"] },
        generate,
      ),
    /UNIQUE constraint failed/,
  );

  assert.equal(calls, 6);
});

test("getSession finds a session through a lookalike-typo id", async () => {
  const { createSession, getSession } = await import("../src/lib/db.ts");

  createSession(
    { title: "Sesi mirip", places: ["Warteg", "Padang"] },
    () => "abc120x",
  );

  assert.equal(getSession("ABCl2Ox")?.title, "Sesi mirip");
  assert.equal(getSession("abci2ox")?.title, "Sesi mirip");
});

test("normalizeSessionId canonicalizes valid ids and rejects malformed ones", async () => {
  const { normalizeSessionId } = await import("../src/lib/id.ts");

  assert.equal(normalizeSessionId("ABCl2Ox"), "abc120x");
  assert.equal(normalizeSessionId("abc12qx"), "abc12qx");
  assert.equal(normalizeSessionId("abc12u3"), null);
  assert.equal(normalizeSessionId("short"), null);
  assert.equal(normalizeSessionId("toolong1"), null);
  assert.equal(normalizeSessionId("abc12!3"), null);
});

test("listSessions orders newest first, breaking created_at ties by rowid", async () => {
  const { db, listSessions } = await import("../src/lib/db.ts");
  db.exec("DELETE FROM vote_sessions");
  const seed = db.prepare(
    "INSERT INTO vote_sessions(id, title, place1_name, place2_name, created_at) VALUES (?, ?, 'A', 'B', ?)",
  );
  seed.run("older00", "Kemarin", "2026-08-10 09:00:00");
  seed.run("tiedaa0", "Seri A", "2026-08-11 09:00:00");
  seed.run("tiedbb0", "Seri B", "2026-08-11 09:00:00");

  const ids = listSessions().map((row) => row.id);
  assert.deepEqual(ids, ["tiedbb0", "tiedaa0", "older00"]);
});

test("listSessions returns at most 20 rows, dropping the oldest", async () => {
  const { db, listSessions } = await import("../src/lib/db.ts");

  db.exec("DELETE FROM vote_sessions");
  const seed = db.prepare(
    "INSERT INTO vote_sessions (id, title, place1_name, place2_name, created_at) values (?, ?,'A','B', '2026-08-12 09:00:00')",
  );
  for (let n = 1; n <= 21; n++) {
    seed.run(`sesi${String(n).padStart(3, "0")}`, `Sesi ${n}`);
  }
  const ids = listSessions().map((row) => row.id);
  assert.equal(ids.length, 20);
  assert.equal(ids.includes("sesi001"), false);
  assert.equal(ids[0], "sesi021");
});

test("recordVote increments only the voted place on an open session", async () => {
  const { createSession, getSession, recordVote } =
    await import("../src/lib/db.ts");

  const id = createSession({
    title: "Voting",
    places: ["Warteg", "Padang", "Sate"],
  });
  const result = recordVote(id, 2, 1);

  assert.equal(result.ok, true);
  const session = getSession(id);

  assert.equal(session?.place1_votes, 0);
  assert.equal(session?.place2_votes, 1);
  assert.equal(session?.place3_votes, 0);
});

test("recordVote clamps a downvote at zero", async () => {
  const { createSession, getSession, recordVote } =
    await import("../src/lib/db.ts");
  const id = createSession({ title: "Clamp", places: ["Warteg", "Padang"] });
  const result = recordVote(id, 1, -1);

  assert.equal(result.ok, true);
  assert.equal(getSession(id)?.place1_votes, 0);
});

test("recordVote reprts not_found for an unknown session", async () => {
  const { recordVote } = await import("../src/lib/db.ts");

  assert.deepEqual(recordVote("zzzzzzz", 1, 1), {
    ok: false,
    reason: "not_found",
  });
});

test("recordVote reports no_such_place for an empty optional slot", async () => {
  const { createSession, getSession, recordVote } =
    await import("../src/lib/db.ts");

  const id = createSession({
    title: "Dua tempat",
    places: ["Warteg", "Padang"],
  });
  const result = recordVote(id, 3, 1);
  assert.deepEqual(result, { ok: false, reason: "no_such_place" });
  assert.equal(getSession(id)?.place3_votes, 0);
});

test("setSessionOpen closes and reopens a session", async () => {
  const { createSession, getSession, setSessionOpen } =
    await import("../src/lib/db.ts");

  const id = createSession({ title: "Tutup", places: ["Warteg", "Padang"] });
  assert.equal(setSessionOpen(id, false).ok, true);
  assert.equal(getSession(id)?.is_open, 0);
  assert.equal(setSessionOpen(id, true).ok, true);
  assert.equal(getSession(id)?.is_open, 1);
});

test("setSession reports not_found for an unknown session", async () => {
  const { setSessionOpen } = await import("../src/lib/db.ts");
  assert.deepEqual(setSessionOpen("zzzzzzz", false), {
    ok: false,
    reason: "not_found",
  });
});

test("recordVote reports closed once the session is closed", async () => {
  const { createSession, getSession, recordVote, setSessionOpen } =
    await import("../src/lib/db.ts");
  const id = createSession({ title: "ditutup", places: ["Warteg", "Padang"] });
  recordVote(id, 1, 1);
  setSessionOpen(id, false);
  const result = recordVote(id, 1, 1);

  assert.deepEqual(result, { ok: false, reason: "closed" });
  assert.equal(getSession(id)?.place1_votes, 1);
});

test("recordVote and setSessionOpen return the updated session", async () => {
  const { createSession, recordVote, setSessionOpen } = await import(
    "../src/lib/db.ts"
  );

  const id = createSession({
    title: "Sesi kembali",
    places: ["Warteg", "Padang"],
  });

  const voted = recordVote(id, 1, 1);
  if (!voted.ok) throw new Error("expected the vote to succeed");
  assert.equal(voted.session.id, id);
  assert.equal(voted.session.place1_votes, 1);

  const closed = setSessionOpen(id, false);
  if (!closed.ok) throw new Error("expected the close to succeed");
  assert.equal(closed.session.is_open, 0);
  assert.equal(closed.session.place1_votes, 1);
});
