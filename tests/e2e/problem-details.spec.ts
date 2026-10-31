import { randomUUID } from "node:crypto";
import { test, expect } from "./support/fixtures";
import { problemType } from "../../src/shared/problem-details";

test("S22-UI-09 · contacto conserva datos y bytes ante 429 nuevo y 503 anterior", async ({ journey, page }) => {
  await page.goto(journey.origin + "/#book-a-demo");
  await page.getByLabel("Nombre", { exact: true }).fill("Persona sintética S22");
  await page.getByLabel("Email", { exact: true }).fill("s22@example.invalid");
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa sintética");
  const captured: string[] = [];
  await page.route("**/api/demo-requests", async route => {
    captured.push(route.request().postData() ?? "");
    expect(route.request().headers().accept).toContain("application/problem+json");
    if (captured.length === 1) await route.fulfill({ status: 429, contentType: "application/problem+json", headers: { "Retry-After": "12" },
      body: JSON.stringify({ type: problemType("RATE_LIMITED"), title: "Límite alcanzado", status: 429, detail: "Esperá antes de intentar.", code: "RATE_LIMITED", requestId: randomUUID(), traceId: "1".repeat(32) }) });
    else if (captured.length === 2) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "DATABASE_UNAVAILABLE", requestId: randomUUID() } }) });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Solicitar conocer el prototipo", exact: true }).click();
  await expect(page.getByText(/Podés volver a intentar en 12 segundos/)).toBeVisible();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Persona sintética S22");
  await expect(page.getByLabel("Nombre", { exact: true })).toBeDisabled();
  expect(captured).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByText(/El servicio de datos no está disponible/)).toBeVisible();
  expect(captured).toHaveLength(2);
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByText("Tu solicitud para conocer el prototipo quedó guardada.", { exact: true })).toBeVisible();
  expect(captured).toHaveLength(3); expect(new Set(captured).size).toBe(1);
});

test("S22-UI-09 · respuesta desconocida de comando conserva intención hasta reintento manual", async ({ journey, page }) => {
  await journey.start();
  await page.getByLabel("Cantidad declarada (kg)").fill("13000");
  const captured: string[] = [];
  await page.route("**/api/demo/runs/*/commands", async route => {
    captured.push(route.request().postData() ?? "");
    if (captured.length === 1) await route.fulfill({ status: 200, contentType: "application/problem+json", body: JSON.stringify({ code: "FUTURE_CODE", saved: true }) });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reintentar la misma acción", exact: true })).toBeVisible();
  await expect(page.getByLabel("Cantidad declarada (kg)")).toHaveValue("13000");
  expect(captured).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar la misma acción", exact: true }).click();
  await expect(page.getByText(/Versión guardada 2/)).toBeVisible();
  expect(captured).toHaveLength(2); expect(captured[0]).toBe(captured[1]);
});
