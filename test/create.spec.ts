import { expect, test } from "@playwright/test";

test("an invalid form is answered in the browser, without leaving /new", async ({
  page,
}) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Bikin sesi" }).click();

  await expect(page).toHaveURL("/new");
  await expect(page.locator("#title-error")).toHaveText("Judul wajib diisi");
  await expect(page.locator(".km-form-error")).toHaveText("Isi minimal 2 tempat");
  await expect(page.getByLabel("Judul")).toHaveAttribute(
    "aria-describedby",
    "title-error",
  );
  await expect(
    page.locator(".km-field", { has: page.locator("#title") }),
  ).toHaveAttribute("data-invalid", "true");
});

test("every error links to an existing, unique id, however often it is submitted", async ({
  page,
}) => {
  await page.goto("/new");
  for (const slot of [1, 2, 3, 4]) {
    await page.getByLabel(`Tempat ${slot}`).fill("W".repeat(61));
  }

  const submit = page.getByRole("button", { name: "Bikin sesi" });
  await submit.click();
  await submit.click();

  const markup = await page.evaluate(() => ({
    ids: [...document.querySelectorAll("[id]")].map((node) => node.id),
    described: [...document.querySelectorAll("[aria-describedby]")].map(
      (node) => String(node.getAttribute("aria-describedby")),
    ),
  }));

  expect(markup.described.sort()).toEqual([
    "place1-error",
    "place2-error",
    "place3-error",
    "place4-error",
    "title-error",
  ]);
  for (const target of markup.described) {
    expect(markup.ids).toContain(target);
  }
  expect(new Set(markup.ids).size).toBe(markup.ids.length);
});

test("fixing a field drops its error, its mark and its dangling description", async ({
  page,
}) => {
  await page.goto("/new");
  const submit = page.getByRole("button", { name: "Bikin sesi" });
  await submit.click();
  await expect(page.locator("#title-error")).toBeVisible();

  await page.getByLabel("Judul").fill("Makan siang tim");
  await submit.click();

  await expect(page.locator("#title-error")).toHaveCount(0);
  await expect(page.getByLabel("Judul")).not.toHaveAttribute(
    "aria-describedby",
  );
  await expect(
    page.locator(".km-field", { has: page.locator("#title") }),
  ).not.toHaveAttribute("data-invalid");
});
