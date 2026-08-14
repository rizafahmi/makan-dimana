import { expect, test, type Page } from "@playwright/test";
import { createSession } from "./browser.ts";

const insecure = (page: Page) =>
  page.addInitScript(() => {
    Reflect.deleteProperty(Crypto.prototype, "randomUUID");
    Reflect.deleteProperty(Crypto.prototype, "subtle");
  });

test("a browser outside a secure context still creates a session", async ({
  page,
}) => {
  const complaints: string[] = [];
  page.on("pageerror", (error) => complaints.push(error.message));
  await insecure(page);

  await createSession(page, "Makan siang tim");

  await expect(
    page.getByRole("heading", { name: "Makan siang tim" }),
  ).toBeVisible();
  expect(complaints).toEqual([]);
});

const seedDevice = (id: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("makan", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("sessions", { keyPath: "id" });
      request.result.createObjectStore("meta");
    };
    request.onsuccess = () => {
      const tx = request.result.transaction("meta", "readwrite");
      tx.objectStore("meta").put(id, "device");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

test("a device that already minted a uuid announces that same uuid", async ({
  page,
}) => {
  const held = "0f2c1a58-6e3b-4a71-9c5d-8b4e2f6a0d13";
  const announced: string[] = [];
  page.on("request", (request) => {
    const body = request.postData();
    if (body === null) return;
    announced.push(new URLSearchParams(body).get("device") ?? "");
  });

  await page.goto("/new");
  await page.evaluate(seedDevice, held);
  await createSession(page, "Makan siang tim");

  await expect.poll(() => announced).toEqual([held]);
});
