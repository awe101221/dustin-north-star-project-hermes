import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Visual smoke test: renders every top-level route against a running dev/prod
 * server and stores screenshots under scripts/smoke/output. Fails if any page
 * throws, shows the Next error overlay, or returns a non-2xx status.
 *
 *   BASE_URL=http://localhost:3000 npm run smoke
 */
const ROUTES = ["/", "/research", "/research/new", "/pipeline", "/quant", "/quant?tab=guru", "/north-star", "/companies", "/companies/NAS:MU", "/personas", "/personas/brad-gerstner", "/knowledge", "/agents", "/activity", "/settings", "/playground"];

async function main() {
  const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const out = path.join(process.cwd(), "scripts", "smoke", "output");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const failures: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  if (process.env.HERMES_ACCESS_PASSWORD) {
    await page.goto(`${base}/login`);
    await page.fill("#password", process.env.HERMES_ACCESS_PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  for (const route of ROUTES) {
    const started = Date.now();
    const res = await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 90_000 }).catch((e) => {
      failures.push(`${route}: ${e.message}`);
      return null;
    });
    if (!res) continue;
    await page.waitForTimeout(400);
    const status = res.status();
    const overlay = await page.locator("nextjs-portal").count();
    const errorPanel = await page.getByText("Something broke on this page").count();
    const file = path.join(out, `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home"}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const ms = Date.now() - started;
    const ok = status < 400 && overlay === 0 && errorPanel === 0;
    console.log(`${ok ? "ok " : "FAIL"} ${status} ${String(ms).padStart(5)}ms ${route}`);
    if (!ok) failures.push(`${route}: status ${status}, overlay ${overlay}, errorPanel ${errorPanel}`);
  }
  await browser.close();
  if (consoleErrors.length) console.log("page errors:", consoleErrors.slice(0, 10));
  if (failures.length) {
    console.error("FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log(`all ${ROUTES.length} routes rendered → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
