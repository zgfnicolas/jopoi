import assert from "node:assert/strict";
import { percentile } from "../../scripts/lib/s21-measurements";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { child, completed, stop } from "../support/process";
import { evidenceRevision } from "../../scripts/lib/evidence";
import lighthouse from "lighthouse";

async function freePort() {
  return new Promise<number>(resolvePort => {
    const server = createServer(); server.listen(0, "127.0.0.1", () => { const address = server.address(); if (!address || typeof address === "string") throw new Error("PORT_UNAVAILABLE"); server.close(() => resolvePort(address.port)); });
  });
}

const directory = resolve(".cache/s20-seo");
await mkdir(directory, { recursive: true });
const origin = "https://jopoi.example";
const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", APP_URL: origin,
  DATABASE_URL: "", DIRECT_URL: "", DATABASE_URL_UNPOOLED: "", SESSION_SECRET: "", CRON_SECRET: "",
  HEDERA_OPERATOR_ID: "", HEDERA_OPERATOR_KEY: "", HEDERA_TOPIC_ID: "", HCS_CONFIGURATION_GENERATION: "", HCS_DAILY_LIMIT: "",
  JOPOI_API_TEST_DIRECTORY: "", JOPOI_API_TEST_TOKEN: "", JOPOI_API_TEST_SOCKET: "", JOPOI_E2E_BUNDLER: "", NODE_OPTIONS: "", VERCEL: "1" };
const results: object[] = [];
const declaration = await readFile("next-env.d.ts", "utf8");
try {
  // Two normal production builds. The production runtime refuses all test-runtime aliases.
  for (const deployment of ["preview", "production"]) {
    const env = { ...environment, VERCEL_ENV: deployment };
    await completed(child(process.execPath, ["node_modules/next/dist/bin/next", "build"], env, resolve(directory, `${deployment}-build.log`)));
    const port = await freePort();
    const local = `http://127.0.0.1:${port}`;
    const server = child(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], env, resolve(directory, `${deployment}-server.log`));
    const browser = await chromium.launch();
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null) throw new Error("SEO_SERVER_EXITED");
        try { ready = (await fetch(local)).ok; } catch { /* bounded startup */ }
        if (ready) break;
        await new Promise(resolveWait => setTimeout(resolveWait, 200));
      }
      assert(ready, "Production server ready");
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(local);
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.match(await page.getByRole("heading", { level: 1 }).innerText(), /coordinación de materiales/);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      assert.equal(robots, deployment === "production" ? "index, follow" : "noindex, nofollow");
      assert.equal(await page.locator('link[rel="canonical"]').count(), deployment === "production" ? 1 : 0);
      if (deployment === "production") {
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), origin);
        const website = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
        assert.equal(website["@type"], "WebSite"); assert.equal(website.url, origin);
      }
      assert.equal(await page.locator('meta[property="og:title"]').count(), 1);
      const image = await page.locator('meta[property="og:image"]').getAttribute("content");
      assert(image && !image.includes("trazabilidad"));
      const photo = page.locator("main img").first();
      await photo.evaluate((element: HTMLImageElement) => element.decode());
      assert(await photo.evaluate((element: HTMLImageElement) => element.naturalWidth > 0));
      for (const path of ["/demo", "/trazabilidad/00000000-0000-4000-8000-000000000000"]) {
        await page.goto(local + path);
        assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
        assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
      }
      const sitemap = await (await fetch(local + "/sitemap.xml")).text();
      assert.equal((sitemap.match(/<loc>/g) ?? []).length, deployment === "production" ? 1 : 0);
      assert(!sitemap.includes("trazabilidad") && !sitemap.includes("/demo"));
      if (deployment === "production") assert(sitemap.includes(origin));
      const crawler = await (await fetch(local + "/robots.txt")).text();
      assert(crawler.includes("Allow: /")); assert(!crawler.includes("Disallow: /demo"));
      const api = await fetch(local + "/api/demo/session");
      assert.equal(api.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.equal(api.status, 503); // Sealed SESSION_SECRET: availability is not authenticated access.
      assert.equal((await api.json()).error.code, "CONFIGURATION_UNAVAILABLE");
      if (deployment === "production") {
        for (const colorScheme of ["light", "dark"] as const) {
          for (const width of [390, 1440]) {
            const visualContext = await browser.newContext({ colorScheme, viewport: { width, height: 900 } });
            try {
              const visual = await visualContext.newPage();
              await visual.goto(local);
              await visual.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
              assert(await visual.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
              await visual.screenshot({ path: resolve(directory, `inicio-${colorScheme}-${width}.png`), fullPage: true });
            } finally { await visualContext.close(); }
          }
        }
        const debugPort = await freePort();
        const measurementBrowser = await chromium.launch({ args: [`--remote-debugging-port=${debugPort}`] });
        try {
          const samples: Array<{ lcp: number; cls: number; tbt: number; score: number | null }> = [];
          for (let run = 1; run <= 3; run++) {
            const report = await lighthouse(local, { port: debugPort, onlyCategories: ["performance"], output: "json", logLevel: "error", formFactor: "mobile", throttlingMethod: "simulate" });
            assert(report && !report.lhr.runtimeError, "Lighthouse completed");
            await writeFile(resolve(directory, `lighthouse-mobile-${run}.json`), JSON.stringify(report.lhr, null, 2));
            const metric = (id: string) => {
              const value = report.lhr.audits[id]?.numericValue;
              assert.ok(value !== undefined && Number.isFinite(value) && value >= 0, `Lighthouse metric missing: ${id}`);
              return value;
            };
            const category = report.lhr.categories.performance;
            assert.ok(category, "Lighthouse performance category missing");
            samples.push({ lcp: metric("largest-contentful-paint"), cls: metric("cumulative-layout-shift"), tbt: metric("total-blocking-time"), score: category.score });
          }
          const median = (values: number[]) => percentile(values.sort((a, b) => a - b), 1);
          const measurements = { mode: "LOCAL_PRODUCTION_LAB", profile: "Lighthouse default mobile, simulated throttling, loopback, headless Chromium", samples,
            median: { lcp: median(samples.map(sample => sample.lcp)), cls: median(samples.map(sample => sample.cls)), tbt: median(samples.map(sample => sample.tbt)) },
            fieldINP: "PENDIENTE_DATOS_REALES", note: "TBT no equivale a INP. Sin CDN ni red móvil real; no acredita métricas de campo." };
          await writeFile(resolve(directory, "performance.json"), JSON.stringify(measurements, null, 2));
          console.log(JSON.stringify(measurements));
        } finally { await measurementBrowser.close(); }
      }
      results.push({ deployment, status: "APROBADO", serverRendered: true, credentials: "sealed", writes: false });
    } finally { await browser.close(); await stop(server); }
  }
  await writeFile(resolve(directory, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ...evidenceRevision(), results }, null, 2));
  console.log("S20 SEO: Production y Preview aprobados por HTTP/HTML, sin JavaScript ni escrituras.");
} finally { await writeFile("next-env.d.ts", declaration); }
