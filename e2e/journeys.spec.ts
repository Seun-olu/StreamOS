import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const ADMIN = { name: "Ada Admin", email: "admin@streamos.test", password: "admin-password-1" };
const VIEWER = { name: "Vic", email: "viewer@streamos.test", password: "viewer-password-1" };

async function signUp(page: Page, u: typeof ADMIN, next = "/") {
  await page.goto(`/signup?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Name").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === next.split("?")[0]);
}

async function signIn(page: Page, u: typeof ADMIN) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("public discovery, detail, search and SEO work signed out", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Sintel" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Series" }).getByRole("link", { name: "Superman (1941)" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Animation" })).toBeVisible();

  await page.getByRole("region", { name: "Series" }).getByRole("link", { name: "Superman (1941)" }).click();
  await expect(page).toHaveURL("/title/superman-1941");
  await expect(page.getByRole("link", { name: "Play Electric Earthquake" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Licence and source" })).toContainText("Public domain (US)");
  await expect(page).toHaveTitle("Superman (1941) · StreamOS");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ "@type": "TVSeries", name: "Superman (1941)", numberOfEpisodes: 3 });

  await page.getByLabel("Search titles").first().fill("earthquake");
  await page.getByLabel("Search titles").first().press("Enter");
  await expect(page.getByRole("heading", { name: "1 result for “earthquake”" })).toBeVisible();
  await page.goto("/search?q=zzzz");
  await expect(page.getByText("No titles match")).toBeVisible();

  // Drafts are not public; signed-in areas redirect to login.
  expect((await request.get("/title/spring")).status()).toBe(404);
  await page.goto("/watch/sintel");
  await expect(page).toHaveURL("/login?next=%2Fwatch%2Fsintel");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/title/tears-of-steel");
  expect(sitemap).not.toContain("/title/spring");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /admin");
});

test("first account is admin: draft, validate, preview, publish, edit, republish, unpublish", async ({ page, browser }) => {
  page.on("dialog", (d) => d.accept());
  await signUp(page, ADMIN, "/admin");
  await expect(page.getByTestId("staff-role")).toHaveText("Signed in as admin");

  await page.getByRole("link", { name: "Spring" }).click();
  await expect(page.getByRole("note", { name: "Publish checks" })).toContainText("A movie needs a video asset");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Cannot publish: A movie needs a video asset")).toBeVisible();

  await page.getByLabel("Video (movies only)").selectOption({ label: "StreamOS test pattern (20 s) (CC0 1.0)" });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await expect(page.getByText("Ready to publish.")).toBeVisible();

  await page.getByRole("link", { name: "Preview draft" }).click();
  await expect(page.getByRole("note")).toContainText("Preview of the current draft");
  await expect(page.getByRole("region", { name: "Licence and source" })).toContainText("CC0 1.0");
  await page.getByRole("link", { name: "Back to editor" }).click();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published version 1")).toBeVisible();

  const anon = await browser.newPage();
  await anon.goto("/title/spring");
  await expect(anon.getByRole("heading", { level: 1, name: "Spring" })).toBeVisible();

  // Edits stay private until republished.
  await page.getByLabel("Name").fill("Spring (2019)");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  await anon.reload();
  await expect(anon.getByRole("heading", { level: 1, name: "Spring" })).toBeVisible();
  await page.getByRole("button", { name: "Republish" }).click();
  await expect(page.getByText("Published version 2")).toBeVisible();
  await anon.reload();
  await expect(anon.getByRole("heading", { level: 1, name: "Spring (2019)" })).toBeVisible();

  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await anon.reload();
  await expect(anon.getByRole("heading", { name: "Not found" })).toBeVisible();
  await anon.close();

  // A new series built from scratch, with one episode on the local test clip.
  await page.goto("/admin/titles/new");
  await page.getByLabel("Name").fill("Test Card Theatre");
  await page.getByLabel("Type").selectOption("series");
  await page.getByLabel("Synopsis").fill("A calibration series about colour bars.");
  await page.getByLabel("Genres (comma separated)").fill("Documentary");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("note", { name: "Publish checks" })).toContainText("A series needs at least one episode");
  await page.getByLabel("Episode name").fill("Colour Bars");
  await page.getByLabel("Video", { exact: true }).selectOption({ label: "StreamOS test pattern (20 s) (CC0 1.0)" });
  await page.getByRole("button", { name: "Add episode" }).click();
  await expect(page.getByText("Episode added")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published version 1")).toBeVisible();

  await page.goto("/admin/activity");
  await expect(page.getByRole("listitem").filter({ hasText: "Ada Admin unpublished Spring (2019)" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ada Admin published Test Card Theatre" })).toBeVisible();
});

test("viewer: play, save progress, resume, my list, per-profile data", async ({ page }) => {
  await signUp(page, VIEWER);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Staff only" })).toBeVisible();

  await page.goto("/title/test-card-theatre");
  await page.getByRole("button", { name: "+ My list" }).click();
  await expect(page.getByRole("button", { name: "✓ In my list" })).toBeVisible();

  await page.getByRole("link", { name: "▶ Play" }).click();
  await expect(page).toHaveURL(/\/watch\/test-card-theatre/);
  const video = page.getByLabel("Test Card Theatre: S1 · E1 Colour Bars");
  await video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play();
    v.currentTime = 8;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    v.pause();
  });
  await expect(page.getByTestId("progress-status")).toHaveText("Progress saved at 0:08");

  await page.reload();
  await expect(page.getByTestId("progress-status")).toHaveText("Resuming from 0:08");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.floor(v.currentTime))).toBe(8);

  await page.goto("/");
  const continuing = page.getByRole("region", { name: `Continue watching for ${VIEWER.name}` });
  await expect(continuing.getByRole("progressbar", { name: "Test Card Theatre progress" })).toHaveAttribute("aria-valuenow", "40");
  await expect(page.getByRole("region", { name: "My list" }).getByRole("link", { name: "Test Card Theatre" })).toBeVisible();
  await page.goto("/title/test-card-theatre");
  await expect(page.getByRole("link", { name: "▶ Resume Colour Bars" })).toBeVisible();

  // A second profile has its own list and history.
  await page.goto("/profiles");
  await page.getByLabel("New profile name").fill("Kids");
  await page.getByRole("button", { name: "Add profile" }).click();
  await expect(page.getByText("Profile created")).toBeVisible();
  await page.getByRole("button", { name: "Watch as Kids" }).click();
  await expect(page.getByTestId("active-profile")).toHaveText("Kids");
  await expect(page.getByRole("region", { name: /Continue watching/ })).toHaveCount(0);
  await page.goto("/my-list");
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
});

test("roles: admin makes the viewer an editor, who can draft and preview but not publish", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/admin/staff");
  await page.getByLabel("Account email").fill(VIEWER.email);
  await page.getByLabel("Role", { exact: true }).selectOption("editor");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Role set to editor")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await signIn(page, VIEWER);
  await page.goto("/admin");
  await expect(page.getByTestId("staff-role")).toHaveText("Signed in as editor");
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await page.getByRole("link", { name: "Tears of Steel" }).click();
  await expect(page.getByText("Editors can save drafts and preview; an admin publishes.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish/ })).toHaveCount(0);
  await page.getByLabel("Synopsis").fill("Edited by an editor.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Unpublished changes")).toBeVisible();
  await page.goto("/title/tears-of-steel");
  await expect(page.getByText("Edited by an editor.")).toHaveCount(0);
});
