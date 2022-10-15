import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("http://localhost:4200/", {
    waitUntil: "commit",
  });
});

test("show 'connecting…' while connect to Firebase then hide", async ({
  page,
}) => {
  const isConnecting = page.locator('span:has-text("Connecting…")');
  await isConnecting.waitFor({ state: "attached" });
  await expect(await isConnecting.isVisible()).toBe(true);
  await isConnecting.waitFor({ state: "detached" });
  await expect(await isConnecting.isVisible()).toBe(false);
  await expect(page).toHaveTitle("Story Pointer");
});

test("can create new room", async ({ page }) => {
  const newRoomBtn = page.locator('button:has-text("New Room")');
  await newRoomBtn.waitFor({ state: "visible" });
  await newRoomBtn.click({
    modifiers: ["Control"],
  });

  const halfBtn = page.locator('button:has-text("½")');
  await halfBtn.waitFor({ state: "visible" });

  await expect(page).toHaveURL(/^http:\/\/localhost:4200\/#[0-9a-zA-Z]+$/);

  await page
    .locator("text=0 / 1 vote(s) ½ 1 2 3 5 8 13")
    .waitFor({ state: "attached" });
});
