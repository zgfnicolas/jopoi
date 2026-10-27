import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/fixtures";

async function keyboardTo(page: Page, target: Locator) {
  await expect(target).toBeVisible(); await expect(target).toBeEnabled();
  for (let attempt = 0; attempt < 90; attempt++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("KEYBOARD_TARGET_UNREACHABLE");
}

test("E2E-10 · teclado de escritorio, uso táctil móvil y controles sin recorte", async ({ journey, page }, info) => {
  const mobile = info.project.name === "webkit-mobile";
  const activate = async (target: Locator) => {
    if (mobile) await target.tap();
    else { await keyboardTo(page, target); await page.keyboard.press("Enter"); }
  };
  await page.goto(journey.origin);
  if (!mobile) {
    await keyboardTo(page, page.getByRole("link", { name: "Saltar al contenido" }));
    await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused(); await page.keyboard.press("Enter");
    await keyboardTo(page, page.getByLabel("Nombre", { exact: true }));
  } else await page.getByLabel("Nombre", { exact: true }).tap();
  await page.keyboard.type("Persona teclado S18");
  if (mobile) await page.getByLabel("Email", { exact: true }).tap(); else await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused(); await page.keyboard.type("teclado@example.invalid");
  if (mobile) await page.getByLabel("Empresa", { exact: true }).tap(); else await page.keyboard.press("Tab");
  await expect(page.getByLabel("Empresa", { exact: true })).toBeFocused(); await page.keyboard.type("Empresa sintética");
  await activate(page.getByRole("button", { name: "Solicitar conocer el prototipo", exact: true }));
  await expect(page.getByText("Tu solicitud para conocer el prototipo quedó guardada.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toContain("Tu solicitud para conocer el prototipo quedó guardada.");
  const widths = info.project.name === "chromium-desktop" ? [320, 768, 1440] : [390];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await journey.screenshot(info, `contacto-teclado-${width}`);
  }
  await journey.start();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByLabel("Cantidad declarada (kg)")).toBeVisible();
    await journey.screenshot(info, `panel-${width}`);
  }
  // Desktop uses Tab/Enter and native select keys; mobile uses touch controls.
  const press = async (name: string | RegExp) => {
    await journey.action(name, activate);
  };
  const role = async (index: number) => {
    if (mobile) { await journey.role((["generator", "coordinator", "carrier", "buyer"] as const)[index]); return; }
    await keyboardTo(page, page.getByLabel("Rol que estás representando")); await page.keyboard.press("Home");
    for (let count = 0; count < index; count++) await page.keyboard.press("ArrowDown");
  };
  await press("Publicar lote"); await expect(page.getByRole("heading", { name: "Revisar el lote", exact: true })).toBeVisible();
  await role(1); await press("Aprobar lote"); await expect(page.getByRole("heading", { name: "Asignar un viaje", exact: true })).toBeVisible();
  await press(/^Asignar Retorno A/); await role(2); await press("Confirmar retiro"); await role(3);
  if (mobile) await page.getByLabel("Peso recibido (kg)").tap(); else await keyboardTo(page, page.getByLabel("Peso recibido (kg)"));
  await page.keyboard.type("12000"); await press("Confirmar recepción conforme");
  await expect(page.getByText("Recorrido cerrado con recepción conforme", { exact: true })).toBeVisible();
  await page.goto(await journey.shareUrl());
  await page.getByText("Ver detalle y contrastar publicación del lote", { exact: true }).click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByLabel("Payload público del hito").first()).toBeVisible();
    await journey.screenshot(info, `trazabilidad-detalle-${width}`);
  }
});
