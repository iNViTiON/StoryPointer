import { expect, test, type Locator } from "@playwright/test";

const memberCount = (voteText: Locator): Promise<number> =>
  voteText
    .textContent()
    .then((text) => +((text ?? "").match(/\/ (.+) vote\(s\)/)?.[1] ?? NaN));

test.beforeEach(async ({ page }) => {
  await page.goto("/", {
    waitUntil: "commit",
  });
});

test("show 'connecting…' while connect to Firebase then hide", async ({
  page,
}) => {
  const isConnecting = page.locator('span:has-text("Connecting…")');
  await isConnecting
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => undefined);
  await isConnecting.waitFor({ state: "detached" });
  await expect(await isConnecting.isVisible()).toBe(false);
  await expect(page).toHaveTitle("Story Pointer");
});

test("can create new room", async ({ page }) => {
  const isConnecting = page.locator('span:has-text("Connecting…")');
  await isConnecting
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => undefined);
  await isConnecting.waitFor({ state: "detached" });
  const newRoomBtn = page.locator('button:has-text("New Room")');
  await newRoomBtn.waitFor();
  await newRoomBtn.click();

  const halfBtn = page.locator('button:has-text("½")');
  await halfBtn.waitFor();

  await expect(page).toHaveURL(/^http:\/\/.+\/#[0-9a-zA-Z]+$/);

  const vote = page.locator("text=0 / 1 vote(s) ½ 1 2 3 5 8 13");
  await vote.waitFor({ state: "attached" });
  await expect(await vote.isVisible()).toBe(true);
  await expect(await memberCount(vote)).toBe(1);
});

test("can join room, correctly count members", async ({ page, context }) => {
  test.slow();
  const adminConnecting = page.locator('span:has-text("Connecting…")');
  await adminConnecting
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => undefined);
  await adminConnecting.waitFor({ state: "detached" });
  const newRoomBtn = page.locator('button:has-text("New Room")');
  const adminVote = page.locator("text=/.+vote\\(s\\)/");
  await newRoomBtn.waitFor();
  await newRoomBtn.click();
  await adminVote.waitFor();
  await expect(await adminVote.isVisible()).toBe(true);
  await expect(await memberCount(adminVote)).toBe(1);

  const userPage = await context.newPage();
  await userPage.goto(page.url());

  const userConnecting = page.locator('span:has-text("Connecting…")');
  await userConnecting
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => undefined);
  await userConnecting.waitFor({ state: "detached" });
  const userVote = userPage.locator("text=/.+vote\\(s\\)/");
  const userReset = userPage.locator('button:has-text("Reset")');
  await userVote
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => userPage.reload().then(() => userVote.waitFor()));
  await expect(await userVote.isVisible()).toBe(true);
  await expect(await userReset.isVisible()).toBe(false);
  await expect(await memberCount(adminVote)).toBe(2);
  await expect(await memberCount(userVote)).toBe(2);

  await userPage.close();
  const adminVoteSingleMember = page.locator("text=/ 1 vote\\(s\\)/");
  await adminVoteSingleMember.waitFor();
  await expect(await memberCount(adminVote)).toBe(1);
});
