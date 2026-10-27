import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { test, expect } from "./support/fixtures";

test("E2E-08 · QR decodificable comparte lectura entre contextos sin credenciales", async ({ journey, page, browser }, info) => {
  await journey.start(); await journey.publish();
  const url = await journey.shareUrl();
  const qr = page.getByRole("img", { name: /QR de la consulta pública/ });
  await expect(qr).toBeVisible();
  const pixels = await qr.evaluate(image => {
    const img = image as HTMLImageElement;
    const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  });
  const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  expect(decoded?.data).toBe(url);
  const parsed = new URL(decoded!.data);
  expect(parsed.origin).toBe(journey.origin); expect(parsed.search).toBe(""); expect(parsed.hash).toBe("");
  const ownerCookie = (await page.context().cookies()).find(cookie => cookie.name === "jopoi_session")!;
  expect(url).not.toContain(ownerCookie.value);
  await page.getByRole("button", { name: "Copiar enlace", exact: true }).click();
  await expect(page.getByText(/Enlace público copiado. No incluye tu sesión.|No pudimos copiarlo. Usá el enlace textual/)).toBeVisible();
  const other = await browser.newContext({ locale: "es-AR" });
  try {
    const reader = await other.newPage(); await reader.goto(url);
    await expect(reader.getByRole("heading", { name: "Historial y evidencia" })).toBeVisible();
    await expect(reader.getByRole("heading", { name: "Chips forestales sin tratar" })).toBeVisible();
    await expect(reader.getByLabel("Rol que estás representando")).toHaveCount(0);
    await expect(reader.getByRole("button", { name: "Confirmar retiro", exact: true })).toHaveCount(0);
    expect((await other.cookies()).some(cookie => cookie.name === "jopoi_session")).toBe(false);
    expect((await other.request.get(`${journey.origin}/api/demo/runs/${parsed.pathname.split("/").at(-1)}`)).status()).toBe(401);
    await info.attach("consulta-compartida", { body: await reader.screenshot({ fullPage: true }), contentType: "image/png" });
  } finally { await other.close(); }
});

test("E2E-09 · pendiente, incertidumbre, confirmación y discrepancia son estados distintos", async ({ journey, page, runtime }, info) => {
  await runtime.network("prepare-hold");
  await journey.start(); await journey.publish();
  await page.getByText(/^Ver \d+ hitos y su publicación$/).click();
  await expect(page.getByText("Pendiente de envío", { exact: true })).toBeVisible();
  await journey.screenshot(info, "pendiente-sql-guardado");
  await runtime.network("unknown", true);
  await expect.poll(async () => { await journey.refresh(); return page.getByText("Resultado de red incierto", { exact: true }).isVisible(); }).toBe(true);
  await expect(page.getByText("Confirmado en testnet", { exact: true })).toHaveCount(0);
  await journey.screenshot(info, "resultado-incierto");
  await runtime.network("confirmed"); await runtime.advance(60001); await runtime.cron();
  await expect.poll(async () => { await journey.refresh(); return page.getByText("Hash remoto coincidente", { exact: true }).isVisible(); }).toBe(true);
  await expect(page.getByText("Confirmado en testnet", { exact: true })).toBeVisible();
  await runtime.network("mirror-lag"); await journey.role("coordinator"); await journey.action("Aprobar lote");
  await expect.poll(async () => { await journey.refresh(); return page.getByText("Contraste remoto pendiente", { exact: true }).isVisible(); }).toBe(true);
  const url = await journey.shareUrl(); await page.goto(url);
  await expect(page.getByRole("heading", { name: "Historial y evidencia" })).toBeVisible();
  await page.getByText("Ver detalle y contrastar aprobación del lote", { exact: true }).click();
  await runtime.network("altered");
  const section = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Aprobación del lote", exact: true }) });
  await section.getByRole("button", { name: "Contrastar con testnet", exact: true }).click();
  await expect(section.getByText("Discrepancia remota", { exact: true })).toBeVisible();
  await expect(section.getByText("Detalle íntegro en la aplicación", { exact: true })).toBeVisible();
  await journey.screenshot(info, "discrepancia-sin-reescribir-detalle");
});

test("E2E-09 · cupo agotado conserva el guardado y pausa la publicación", async ({ journey, page, runtime }, info) => {
  await runtime.restart({ HCS_DAILY_LIMIT: "1" });
  await journey.start(); await journey.publish();
  await page.getByText(/^Ver \d+ hitos y su publicación$/).click();
  await expect.poll(async () => { await journey.refresh(); return page.getByText("Hash remoto coincidente", { exact: true }).isVisible(); }).toBe(true);
  await journey.role("coordinator"); await journey.action("Aprobar lote");
  await expect.poll(async () => { await journey.refresh(); return page.getByText("Envío pausado por cupo", { exact: true }).isVisible(); }).toBe(true);
  await expect(page.getByText("El cupo está agotado. La acción SQL sigue guardada; el envío espera recursos disponibles.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asignar un viaje", exact: true })).toBeVisible();
  await journey.screenshot(info, "cupo-agotado-accion-guardada");
});

test("E2E-11 · vencimientos retiran la vista privada y la consulta guardada", async ({ journey, page, runtime }, info) => {
  await journey.start(); await journey.publish(); const url = await journey.shareUrl();
  await runtime.advance(86401000); await page.clock.fastForward(86401000);
  await expect(page.getByText("Tu sesión venció", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Rol que estás representando")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "El lote guardado" })).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Chips forestales sin tratar" })).toBeVisible();
  await runtime.advance(6 * 86400000); await page.clock.fastForward(6 * 86400000);
  await expect(page.getByRole("heading", { name: "Chips forestales sin tratar" })).toHaveCount(0);
  await page.goto(journey.origin); await page.goBack();
  await expect(page.getByText("La consulta venció", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR de la consulta pública/ })).toHaveCount(0);
  await journey.screenshot(info, "consulta-vencida");
});

test("E2E-14 · mantenimiento protegido y política diaria local", async ({ journey, page, runtime }, info) => {
  await page.goto(journey.origin);
  expect((await page.context().request.get(journey.origin + "/api/cron")).status()).toBe(401);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  expect(config.crons).toEqual([{ path: "/api/cron", schedule: "0 3 * * *" }]);
  expect((await runtime.cron()).status).toBe(200);
  expect((await runtime.cron()).body).toMatchObject({ skipped: true });
  await info.attach("operacion-local", { body: "Endpoint protegido y política diaria comprobados localmente. Programador publicado pendiente de evidencia externa.", contentType: "text/plain" });
});
