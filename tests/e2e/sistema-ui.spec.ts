import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./support/fixtures";
import type { Page, TestInfo } from "@playwright/test";

async function accessible(page: Page, info: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  await info.attach(`axe-${label}`, { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  expect(results.violations, label).toEqual([]);
}

test("S20-01 · temas, semántica y accesibilidad del inicio, formulario, operación y traza", async ({ page, journey }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text()); });
  await page.goto(journey.origin);
  await expect(page.getByLabel("Apariencia")).toHaveValue("system");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const photo = page.getByRole("main").locator("img").first();
  await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await accessible(page, info, "inicio");
  const widths = info.project.use.isMobile ? [360, 390] : [320, 768, 1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `ancho ${width}`).toBe(true);
  }
  await journey.screenshot(info, "s20-inicio");
  await page.getByRole("button", { name: "Solicitar conocer el prototipo" }).click();
  await expect(page.getByLabel("Nombre", { exact: true })).toBeFocused();
  await accessible(page, info, "formulario-invalido");
  await page.getByLabel("Apariencia").selectOption("dark");
  await page.reload();
  await expect(page.getByLabel("Apariencia")).toHaveValue("dark");
  expect(await page.locator("html").evaluate(element => getComputedStyle(element).colorScheme)).toBe("dark");
  await page.getByLabel("Apariencia").selectOption("light");
  expect(await page.locator("html").evaluate(element => getComputedStyle(element).colorScheme)).toBe("light");
  await page.getByLabel("Apariencia").selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await page.locator("html").evaluate(element => getComputedStyle(element).colorScheme)).toBe("dark");
  await page.emulateMedia({ colorScheme: info.project.use.colorScheme ?? null });
  await journey.start();
  await accessible(page, info, "panel-borrador");
  await journey.pickup();
  await journey.screenshot(info, "s20-panel-recepcion");
  await page.goto(await journey.shareUrl());
  await expect(page.getByRole("heading", { name: "Historial y evidencia" })).toBeVisible();
  await page.getByText("Ver detalle y contrastar publicación del lote", { exact: true }).click();
  await accessible(page, info, "traza-detalle");
  await journey.screenshot(info, "s20-traza");
  expect(errors).toEqual([]);
});

test("S20-02 · sistema sin JavaScript, almacenamiento bloqueado y preferencias entre pestañas", async ({ browser, page, journey }, info) => {
  const fallback = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark" });
  try {
    const read = await fallback.newPage();
    await read.goto(journey.origin);
    await expect(read.getByRole("heading", { level: 1 })).toContainText("coordinación de materiales");
    // Playwright excluye NOSCRIPT del selector por texto, incluso con JavaScript desactivado.
    const notice = read.locator("#book-a-demo noscript");
    await expect(notice).toBeVisible();
    await expect.poll(() => notice.textContent()).toBe("Para enviar una solicitud, activá JavaScript. Podés seguir leyendo la propuesta sin habilitarlo.");
    await expect(read.getByLabel("Identificador del recorrido")).toBeDisabled();
    expect(await read.locator("html").evaluate(element => getComputedStyle(element).colorScheme)).toBe("dark");
  } finally { await fallback.close(); }
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", { value() { throw new DOMException("Blocked", "SecurityError"); } });
    Object.defineProperty(Storage.prototype, "setItem", { value() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await page.goto(journey.origin);
  await page.getByLabel("Apariencia").selectOption("dark");
  expect(await page.locator("html").evaluate(element => getComputedStyle(element).colorScheme)).toBe("dark");
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await expect(page.getByRole("main").getByRole("link", { name: "Probar demo" })).toBeVisible();
  await journey.screenshot(info, "s20-colores-forzados");
  const tabs = await browser.newContext();
  try {
    const a = await tabs.newPage(), b = await tabs.newPage();
    await a.goto(journey.origin); await b.goto(journey.origin);
    await a.getByLabel("Apariencia").selectOption("dark");
    await expect(b.getByLabel("Apariencia")).toHaveValue("dark");
    await a.getByLabel("Apariencia").selectOption("system");
    await expect(b.getByLabel("Apariencia")).toHaveValue("system");
    await a.getByLabel("Apariencia").selectOption("light");
    const early = await tabs.newPage();
    await early.emulateMedia({ colorScheme: "dark" });
    // Block hydration: stored light must already be applied by the static bootstrap.
    await early.route(/\/_next\/.*\.js(?:\?|$)/, route => route.abort());
    await early.goto(journey.origin);
    expect(await early.locator("html").evaluate(element => getComputedStyle(element).colorScheme)).toBe("light");
  } finally { await tabs.close(); }
});
