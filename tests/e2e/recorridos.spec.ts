import { test, expect } from "./support/fixtures";

test("E2E-03 · recepción conforme con los cuatro roles simulados", async ({ journey, page }, info) => {
  await journey.start();
  await journey.pickup();
  await page.getByLabel("Peso recibido (kg)").fill("12000,000");
  await journey.action("Confirmar recepción conforme");
  await expect(page.getByText("Recorrido cerrado", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Peso recibido (kg)")).toHaveCount(0);
  await journey.screenshot(info, "recepcion-conforme");
});

test("E2E-04 · humedad alta bloquea aprobación y cierra con rechazo", async ({ journey, page }, info) => {
  await journey.start(); await journey.publish("35,01"); await journey.role("coordinator");
  await expect(page.getByRole("button", { name: "Aprobar lote", exact: true })).toBeDisabled();
  await page.getByLabel("Motivo de ejemplo").selectOption("HUMIDITY_ABOVE_LIMIT");
  await journey.action("Rechazar lote y cerrar recorrido");
  await expect(page.getByText("Recorrido cerrado por rechazo", { exact: true })).toBeVisible();
  await expect(page.getByText("Humedad superior al requisito de ejemplo", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Recorrido cerrado por rechazo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar lote", exact: true })).toHaveCount(0);
  await journey.screenshot(info, "rechazo-terminal");
});

test("E2E-05 · diferencia de peso exige incidencia y conserva ambos valores", async ({ journey, page }, info) => {
  await journey.start(); await journey.pickup();
  await page.getByLabel("Peso recibido (kg)").fill("11900");
  await expect(page.getByRole("button", { name: "Confirmar recepción conforme", exact: true })).toBeDisabled();
  await page.getByLabel("Motivo de ejemplo").selectOption("WEIGHT_MISMATCH");
  await journey.action("Registrar incidencia y cerrar recorrido");
  await expect(page.getByText("Recorrido cerrado con incidencia", { exact: true })).toBeVisible();
  const context = page.getByRole("complementary", { name: "Contexto guardado del recorrido" });
  await expect(context).toContainText("12.000"); await expect(context).toContainText("11.900");
  await expect(context).toContainText("Peso recibido, separado de la declaración");
  await journey.screenshot(info, "incidencia-con-pesos-separados");
});

test("E2E-06 · recargar recupera y dos reinicios agotan tres exploraciones", async ({ journey, page }) => {
  await journey.start();
  await page.getByLabel("Humedad (%)").fill("30,50");
  await journey.action("Guardar borrador");
  const original = await journey.shareUrl();
  await page.reload();
  await expect(page.getByLabel("Humedad (%)")).toHaveValue("30.50");
  expect(await journey.shareUrl()).toBe(original);
  for (const count of [2, 3]) {
    await journey.action("Nuevo recorrido"); await journey.action("Confirmar nuevo recorrido");
    await expect(page.getByText(new RegExp(`Recorridos usados: ${count} de 3`))).toBeVisible();
    expect(await journey.shareUrl()).not.toBe(original);
  }
  await expect(page.getByText("Usaste las tres exploraciones", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo recorrido", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Recorridos usados: 3 de 3/)).toBeVisible();
});
