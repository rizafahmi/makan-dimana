import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { alphabet, normalizeSessionId } from "./id.ts";

const file = resolve(process.env.MAKAN_DB ?? "data/makan.db");

const open = () => {
  mkdirSync(dirname(file), { recursive: true });

  const connection = new DatabaseSync(file);
  const mode = connection
    .prepare("PRAGMA journal_mode = DELETE")
    .get()?.journal_mode;

  if (mode !== "delete") {
    throw new Error(
      `MAKAN_DB opened with journal_mode ${mode}, expected delete`,
    );
  }
  connection.exec(`
  CREATE TABLE IF NOT EXISTS vote_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK (length(title) > 0),
      is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
      place1_name TEXT NOT NULL CHECK (length(place1_name) > 0),
      place1_votes INTEGER NOT NULL DEFAULT 0 CHECK (place1_votes >= 0),
      place2_name TEXT NOT NULL CHECK (length(place2_name) > 0),
      place2_votes INTEGER NOT NULL DEFAULT 0 CHECK (place2_votes >= 0),
      place3_name TEXT CHECK (place3_name IS NULL OR length(place3_name) >
0),
      place3_votes INTEGER NOT NULL DEFAULT 0 CHECK (place3_votes >= 0),
      place4_name TEXT CHECK (place4_name IS NULL OR length(place4_name) >0),
      place4_votes INTEGER NOT NULL DEFAULT 0 CHECK (place4_votes >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return connection;
};

const store = globalThis as typeof globalThis & { makanDb?: DatabaseSync };

export const db = (store.makanDb ??= open());

const defaultGenerateId = () => {
  let id = "";
  for (const byte of randomBytes(7)) id += alphabet[byte % 32];
  return id;
};

type SessionInput = { title: string; places: string[] };

export const createSession = (
  input: SessionInput,
  generateId = defaultGenerateId,
) => {
  const insert = db.prepare(
    "INSERT INTO vote_sessions (id, title, place1_name, place2_name, place3_name, place4_name) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (let attempt = 0; ; attempt++) {
    const id = generateId();
    try {
      insert.run(
        id,
        input.title,
        input.places[0],
        input.places[1],
        input.places[2] ?? null,
        input.places[3] ?? null,
      );
      return id;
    } catch (err) {
      const collision =
        err instanceof Error &&
        (err as Error & { errcode?: number }).errcode === 1555;
      if (!collision || attempt >= 5) throw err;
    }
  }
};

export const getSession = (id: string) => {
  const normalized = normalizeSessionId(id);
  if (normalized === null) return undefined;

  return db.prepare("SELECT * FROM vote_sessions WHERE id = ?").get(normalized);
};

export const listSessions = () =>
  db
    .prepare(
      "SELECT * FROM vote_sessions ORDER BY created_at DESC, rowid DESC LIMIT 20",
    )
    .all();

type FailureReason = "not_found" | "closed" | "no_such_place";
const fail = (reason: FailureReason) => ({ ok: false as const, reason });
const voteUpdates = [
  "UPDATE vote_sessions SET place1_votes = MAX(0, place1_votes + ?) WHERE id = ? AND is_open = 1 AND place1_name IS NOT NULL",
  "UPDATE vote_sessions SET place2_votes = MAX(0, place2_votes + ?) WHERE id = ? AND is_open = 1 AND place2_name IS NOT NULL",
  "UPDATE vote_sessions SET place3_votes = MAX(0, place3_votes + ?) WHERE id = ? AND is_open = 1 AND place3_name IS NOT NULL",
  "UPDATE vote_sessions SET place4_votes = MAX(0, place4_votes + ?) WHERE id = ? AND is_open = 1 AND place4_name IS NOT NULL",
];

export const recordVote = (id: string, place: number, delta: number) => {
  const canonical = normalizeSessionId(id);
  if (canonical === null) return fail("not_found");
  const result = db.prepare(voteUpdates[place - 1]).run(delta, canonical);
  if (result.changes === 0) {
    const session = getSession(canonical);
    if (session === undefined) return fail("not_found");
    if (session[`place${place}_name`] === null) return fail("no_such_place");
    return fail("closed");
  }
  return { ok: true as const };
};

export const setSessionOpen = (id: string, isOpen: boolean) => {
  const canonical = normalizeSessionId(id);
  if (canonical === null) return fail("not_found");
  const result = db
    .prepare("UPDATE vote_sessions SET is_open = ? WHERE id = ?")
    .run(isOpen ? 1 : 0, canonical);
  if (result.changes === 0) return fail("not_found");
  return { ok: true as const };
};
