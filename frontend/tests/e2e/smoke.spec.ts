import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test("login is usable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("service creation form renders without clipping", async ({ page }) => {
  await page.goto("/projects/new");
  await expect(page.getByRole("heading", { name: "New project" })).toBeVisible();
  await expect(page.getByLabel("Project name *")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create & open project" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test("protected service routes render a stable shell", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  await expect(page.getByPlaceholder("Filter by name, repository, or branch")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("project sub-pages keep navigation usable on mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile navigation coverage");
  await page.goto("/projects/1/deployments");
  await expect(page.getByRole("navigation", { name: "Service sections" }).getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deployments" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("global breadcrumbs link each route segment", async ({ page }) => {
  await page.goto("/projects/2/deployments/135");
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/");
  await expect(breadcrumb.getByRole("link", { name: "projects" })).toHaveAttribute("href", "/projects");
  await expect(breadcrumb.getByRole("link", { name: "2" })).toHaveAttribute("href", "/projects/2");
  await expect(breadcrumb.getByRole("link", { name: "deployments" })).toHaveAttribute("href", "/projects/2/deployments");
  await expect(breadcrumb.getByText("135", { exact: true })).toHaveAttribute("aria-current", "page");
});
