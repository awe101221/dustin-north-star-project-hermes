import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { chromium, type Page } from "playwright";

/**
 * Authenticated production smoke test: renders 24 meaningful route states at
 * desktop and 390px mobile widths, stores screenshots, and fails on HTTP/UI/
 * runtime errors or document-level horizontal overflow.
 *
 *   BASE_URL=https://example.vercel.app npm run smoke
 *
 * The script loads .env.local, so HERMES_ACCESS_PASSWORD can remain local and
 * must never be placed on the command line or sent through chat.
 */
loadEnvConfig(process.cwd());

const BASE_ROUTES = [
  "/",
  "/best-ideas",
  "/learnings",
  "/research",
  "/research/new",
  "/pipeline",
  "/north-star",
  "/companies",
  "/companies/MELI",
  "/quant",
  "/quant?tab=guru",
  "/personas",
  "/personas/brad-gerstner",
  "/knowledge",
  "/agents",
  "/evaluation",
  "/system",
  "/activity",
  "/settings",
  "/portfolio",
  "/playground",
] as const;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

function pathnameWithSearch(href: string) {
  const url = new URL(href, "https://hermes.invalid");
  return `${url.pathname}${url.search}`;
}

async function firstHref(page: Page, route: string, accept: (href: string) => boolean) {
  await page.goto(route, { waitUntil: "networkidle", timeout: 90_000 });
  const hrefs = await page.locator("a[href]").evaluateAll((links) => (
    links.map((link) => link.getAttribute("href")).filter((href): href is string => href !== null)
  ));
  return hrefs.map(pathnameWithSearch).find(accept) ?? null;
}

async function discoverDataBackedRoutes(page: Page, base: string) {
  const research = await firstHref(page, `${base}/research`, (href) => /^\/research\/[0-9a-f-]{36}$/i.test(href));
  const knowledge = await firstHref(page, `${base}/knowledge`, (href) => /^\/knowledge\/[^/?]+$/i.test(href));

  await page.goto(`${base}/personas/brad-gerstner`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.getByRole("tab", { name: /^Artifacts/ }).click();
  const artifactHrefs = await page.locator('a[href^="/personas/brad-gerstner/artifact?key="]').evaluateAll((links) => (
    links.map((link) => link.getAttribute("href")).filter((href): href is string => href !== null)
  ));
  const artifact = artifactHrefs[0] ? pathnameWithSearch(artifactHrefs[0]) : null;

  const missing = [
    ["research detail", research],
    ["knowledge detail", knowledge],
    ["persona artifact", artifact],
  ].filter((entry) => entry[1] === null).map((entry) => entry[0]);
  if (missing.length > 0) {
    throw new Error(`Could not discover live routes for: ${missing.join(", ")}.`);
  }

  return [...BASE_ROUTES, research!, knowledge!, artifact!];
}

async function authenticate(page: Page, base: string) {
  const password = process.env.HERMES_ACCESS_PASSWORD?.trim();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (new URL(page.url()).pathname !== "/login") return;
  if (!password || /\[SENSITIVE\]|PLACEHOLDER|CHANGEME|REPLACE/i.test(password)) {
    throw new Error("Authenticated smoke test requires the current HERMES_ACCESS_PASSWORD in local .env.local.");
  }
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}

function screenshotName(viewport: string, route: string) {
  const slug = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home";
  return `${viewport}_${slug}.png`;
}

async function main() {
  const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const out = path.join(process.cwd(), "scripts", "smoke", "output");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const failures: string[] = [];
  let routes: string[] | null = null;

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: "dark",
      });
      const page = await context.newPage();
      let runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      });

      await authenticate(page, base);
      routes ??= await discoverDataBackedRoutes(page, base);
      if (routes.length !== 24) throw new Error(`Smoke route contract drifted: expected 24 routes, found ${routes.length}.`);

      for (const route of routes) {
        const started = Date.now();
        runtimeErrors = [];
        const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 90_000 }).catch((error: Error) => {
          failures.push(`${viewport.name} ${route}: ${error.message}`);
          return null;
        });
        if (!response) continue;
        await page.waitForTimeout(400);
        const status = response.status();
        const landedOnLogin = new URL(page.url()).pathname === "/login";
        const overlay = await page.locator("nextjs-portal").count();
        const errorPanel = await page.getByTestId("error-panel").count();
        const horizontalOverflow = await page.evaluate(() => Math.max(
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
          document.body.scrollWidth - document.body.clientWidth,
        ));
        await page.screenshot({ path: path.join(out, screenshotName(viewport.name, route)), fullPage: true });

        const issues = [
          status >= 400 ? `status ${status}` : null,
          landedOnLogin ? "redirected to login" : null,
          overlay > 0 ? `Next overlay ${overlay}` : null,
          errorPanel > 0 ? `ErrorPanel ${errorPanel}` : null,
          runtimeErrors.length > 0 ? `${runtimeErrors.length} runtime error(s)` : null,
          horizontalOverflow > 1 ? `${horizontalOverflow}px document overflow` : null,
        ].filter((issue): issue is string => issue !== null);
        const ok = issues.length === 0;
        const ms = Date.now() - started;
        console.log(`${ok ? "ok " : "FAIL"} ${viewport.name.padEnd(7)} ${status} ${String(ms).padStart(5)}ms ${route}`);
        if (!ok) failures.push(`${viewport.name} ${route}: ${issues.join(", ")}${runtimeErrors[0] ? ` — ${runtimeErrors[0].slice(0, 300)}` : ""}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`FAILURES:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`all ${routes?.length ?? 0} routes rendered at ${VIEWPORTS.length} viewports (${(routes?.length ?? 0) * VIEWPORTS.length} checks) → ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
