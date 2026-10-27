import { test, expect } from "./support/fixtures";

test("E2E-01 · beneficio, material y coordinación preceden a los detalles técnicos", async ({ journey, page }, info) => {
  await page.goto(journey.origin);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Un lote disponible.Un retorno que puede llevarlo.");
  await expect(page.getByText(/Jopói conecta material, comprador y transporte compatible/)).toBeVisible();
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  const technical = await page.getByRole("heading", { name: "La acción y su evidencia, conectadas." }).boundingBox();
  expect(h1!.y).toBeLessThan(technical!.y);
  await journey.screenshot(info, "landing-beneficio-y-accesos");
});

test("E2E-02 · probar y solicitar demo son accesos independientes", async ({ journey, page }) => {
  await page.goto(journey.origin);
  await page.getByRole("main").getByRole("link", { name: "Probar demo" }).click();
  await expect(page).toHaveURL(journey.origin + "/demo");
  await expect(page.getByRole("button", { name: "Comenzar", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await page.goto(journey.origin);
  await page.getByRole("main").getByRole("link", { name: "Book a demo", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByText("Este formulario guarda una solicitud real. No reserva una fecha ni envía correos automáticos.")).toBeVisible();
});

test("E2E-07 · error conserva campos y el guardado se confirma solo después de persistir", async ({ journey, page, runtime }, info) => {
  const submit = () => info.project.name === "webkit-mobile"
    ? page.getByRole("button", { name: "Solicitar conocer el prototipo", exact: true }).tap()
    : page.getByRole("button", { name: "Solicitar conocer el prototipo", exact: true }).click();
  await page.goto(journey.origin + "/#book-a-demo");
  const ids: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/demo-requests") ids.push((request.postDataJSON() as { requestId: string }).requestId);
  });
  await page.getByLabel("Nombre", { exact: true }).fill("Persona sintética S18");
  await page.getByLabel("Email", { exact: true }).fill("incorrecto");
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa sintética");
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Persona sintética S18");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("incorrecto");
  await submit();
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Persona sintética S18");
  await page.getByLabel("Email", { exact: true }).fill("s18@example.invalid");
  await runtime.database("stop");
  try {
    await submit();
    await expect(page.getByText("El guardado sigue sin confirmar", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Persona sintética S18");
    await expect(page.getByLabel("Nombre", { exact: true })).toBeDisabled();
    await expect(page.getByText("Tu solicitud para conocer el prototipo quedó guardada.", { exact: true })).toHaveCount(0);
    await journey.screenshot(info, "contacto-sql-no-disponible");
  } finally { await runtime.database("start"); }
  await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
  await expect(page.getByText("Tu solicitud para conocer el prototipo quedó guardada.", { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  await expect(page.getByText("No se reservó un horario ni se envió un correo automático.", { exact: true })).toBeVisible();
  const csv = await runtime.exportContacts();
  expect(csv.split("s18@example.invalid")).toHaveLength(2);
  await journey.screenshot(info, "contacto-real-guardado");
});

test("E2E-15 · contenido identifica supuestos, roles y límites del prototipo", async ({ journey, page }, info) => {
  await page.goto(journey.origin);
  await expect(page.getByText(/Sin cuenta. Un escenario ficticio/)).toBeVisible();
  await expect(page.getByText(/Empresas y roles simulados/)).toBeVisible();
  await expect(page.getByText(/no define el modelo comercial definitivo/)).toBeVisible();
  await expect(page.getByText(/El registro no certifica la carga física/)).toBeVisible();
  await expect(page.getByText(/operación sin conexión completa queda para una evolución posterior/)).toBeVisible();
  await journey.screenshot(info, "contenido-honesto");
});
