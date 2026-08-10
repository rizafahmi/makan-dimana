import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

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

const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

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

export const normalizeSessionId = (raw: string) => {
  const id = raw
    .toLowerCase()
    .replaceAll("i", "1")
    .replaceAll("l", "1")
    .replaceAll("o", "0");
  return /^[0-9abcdefghjkmnpqrstvwxyz]{7}$/.test(id) ? id : null;
};
export const getSession = (id: string) => {
  const normalized = normalizeSessionId(id);
  if (normalized === null) return undefined;

  return db.prepare("SELECT * FROM vote_sessions WHERE id = ?").get(normalized);
};
