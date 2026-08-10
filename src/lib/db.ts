import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const file = resolve(process.env.MAKAN_DB ?? "data/makan.db");

mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

const mode = db.prepare("PRAGMA journal_mode = DELETE").get()?.journal_mode;

if (mode !== "delete") {
  throw new Error(`MAKAN_DB opened with journal_mode ${mode}, expected delete`);
}
