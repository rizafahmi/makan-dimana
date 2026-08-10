import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

const entry = "dist/server/entry.mjs";
const startTimeout = 20_000;

let dir: string;
let child: ChildProcessWithoutNullStreams;
let origin: string;
let stdout = "";
let stderr = "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const startupError = (message: string) =>
  new Error(
    `${message}\n--- stdout: ---\n${stdout}\n--- stderr: ---\n${stderr}`,
  );

const waitForServer = async () => {
  const deadline = Date.now() + startTimeout;
  let port = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw startupError(`Server exited with code ${child.exitCode}`);
    }
    if (port === 0) {
      const match = stdout.match(/http:\/\/\S+?:(\d+)/);
      if (match?.[1]) port = Number(match[1]);
    } else {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`, {
          redirect: "manual",
        });
        await res.arrayBuffer();
        return `http://127.0.0.1:${port}`;
      } catch {}
    }
    await sleep(50);
  }
  throw startupError("timed out waiting for server to listen");
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "makan-e2e-"));
  const db = resolve(dir, "makan.db");
  assert.notEqual(db, resolve("data/makan.db"));

  child = spawn(process.execPath, [entry], {
    env: { ...process.env, MAKAN_DB: db, HOST: "127.0.0.1", PORT: "0" },
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  origin = await waitForServer();
});

after(async () => {
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("GET / returns 200 from the spawned production server", async () => {
  const res = await fetch(origin, { redirect: "manual" });
  assert.equal(res.status, 200);
});
