import { test, expect } from "./support/fixtures";

const commands = /\/api\/demo\/runs\/[a-f0-9-]{36}\/commands$/;
const runRead = /\/api\/demo\/runs\/[a-f0-9-]{36}$/;

test("S22-UI-01 · un conflicto conserva la edición y exige revisión explícita", async ({ journey, page, context }) => {
  await journey.start();
  await page.getByLabel("Cantidad declarada (kg)").fill("13000");
  const other = await context.newPage();
  try {
    await other.goto(journey.origin + "/demo");
    await other.getByLabel("Cantidad declarada (kg)").fill("14000");
    await other.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await expect(other.getByText(/Versión guardada 2/)).toBeVisible();
    const captured: string[] = [];
    page.on("request", request => {
      if (commands.test(request.url()) && request.method() === "POST") {
        const body = request.postData();
        if (body === null) throw new Error("MISSING_COMMAND_BODY");
        captured.push(body);
      }
    });
    await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await expect(page.getByText("Revisá los datos actualizados", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Cantidad declarada (kg)")).toHaveValue("13000");
    await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Actualizar lectura", exact: true }).click();
    await expect(page.getByRole("button", { name: "Conservar edición para volver a enviar", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
    expect(captured).toHaveLength(1);
    await page.getByRole("button", { name: "Conservar edición para volver a enviar", exact: true }).click();
    await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await expect(page.getByText(/Versión guardada 3/)).toBeVisible();
    expect(captured).toHaveLength(2);
    const original: unknown = JSON.parse(captured[0] ?? "null"), reviewed: unknown = JSON.parse(captured[1] ?? "null");
    expect(original).toMatchObject({ quantityKg: "13000.000", expectedVersion: 1 });
    expect(reviewed).toMatchObject({ quantityKg: "13000.000", expectedVersion: 2 });
    expect(original).not.toEqual(reviewed);
    await page.getByLabel("Cantidad declarada (kg)").fill("15000");
    await page.reload();
    await expect(page.getByLabel("Cantidad declarada (kg)")).toHaveValue("13000.000");
    expect(captured).toHaveLength(2);
  } finally { await other.close(); }
});

for (const saved of [false, true]) {
  test(`S22-UI-02 · respuesta perdida ${saved ? "después" : "antes"} de guardar conserva bytes y clave`, async ({ journey, page, runtime }) => {
    await journey.start();
    const captured: string[] = [];
    page.on("request", request => {
      if (commands.test(request.url()) && request.method() === "POST") {
        const body = request.postData();
        if (body === null) throw new Error("MISSING_COMMAND_BODY");
        captured.push(body);
      }
    });
    let intercepted = 0;
    await page.route(commands, async route => {
      if (++intercepted === 1) {
        if (saved) expect((await route.fetch()).status()).toBe(200);
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Publicar lote", exact: true }).click();
    await expect(page.getByText("Conservamos la intención original", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Rol que estás representando")).toBeDisabled();
    await page.getByRole("button", { name: "Actualizar lectura", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reintentar la misma acción", exact: true })).toBeEnabled();
    await expect(page.getByText(new RegExp(`Versión guardada ${saved ? 2 : 1}`))).toBeVisible();
    await expect(page.getByLabel("Rol que estás representando")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Nuevo recorrido", exact: true })).toBeDisabled();
    expect(captured).toHaveLength(1);
    await page.getByRole("button", { name: "Reintentar la misma acción", exact: true }).click();
    await expect(page.getByLabel("Rol que estás representando")).toBeEnabled();
    await expect(page.getByText(/Versión guardada 2/)).toBeVisible();
    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
    await expect.poll(async () => (await runtime.ledger()).submissions.length).toBe(1);
    // Routing deshabilita la caché del navegador; retiralo al terminar el fallo, pero seguí observando POSTs.
    await page.unroute(commands);
    await page.reload();
    await expect(page.getByText(/Versión guardada 2/)).toBeVisible();
    await expect(page.getByText("Conservamos la intención original", { exact: true })).toHaveCount(0);
    expect(captured).toHaveLength(2);
    await expect(page.getByText("Ver 1 hitos y su publicación", { exact: true })).toBeVisible();
  });
}

test("S22-UI-03 · un POST confirmado no se repite cuando falla su lectura posterior", async ({ journey, page }) => {
  await journey.start();
  let posts = 0, rejectRead = true;
  page.on("request", request => { if (commands.test(request.url()) && request.method() === "POST") posts++; });
  await page.route(runRead, route => rejectRead ? route.abort("failed") : route.continue());
  await page.getByLabel("Humedad (%)").fill("30,50");
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await expect(page.getByText("La acción quedó guardada en SQL. El estado de red se muestra por separado.", { exact: true })).toBeVisible();
  await expect(page.getByText("Falta actualizar el detalle. El guardado confirmado no se volverá a enviar por este fallo de lectura.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Rol que estás representando")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reintentar la misma acción", exact: true })).toHaveCount(0);
  expect(posts).toBe(1);
  rejectRead = false;
  await page.getByRole("button", { name: "Actualizar lectura", exact: true }).click();
  await expect(page.getByLabel("Humedad (%)")).toHaveValue("30.50");
  await expect(page.getByLabel("Rol que estás representando")).toBeEnabled();
  expect(posts).toBe(1);
});

test("S22-UI-04 · el reintento de publicación incierto conserva hito e intención", async ({ journey, page, runtime }) => {
  await runtime.network("unknown");
  await journey.start(); await journey.publish();
  await page.getByText(/^Ver \d+ hitos y su publicación$/).click();
  await expect.poll(async () => { await journey.refresh(); return page.getByText("Resultado de red incierto", { exact: true }).isVisible(); }).toBe(true);
  const captured: Array<{ path: string; body: string }> = [];
  await page.route(/\/api\/demo\/runs\/[a-f0-9-]{36}\/events\/[a-f0-9-]{36}\/retry$/, async route => {
    const body = route.request().postData();
    if (body === null) throw new Error("MISSING_RETRY_BODY");
    captured.push({ path: new URL(route.request().url()).pathname, body });
    if (captured.length === 1) {
      expect((await route.fetch()).status()).toBe(202);
      await route.abort("failed");
    } else await route.continue();
  });
  const submissions = (await runtime.ledger()).submissions;
  await page.getByRole("button", { name: "Comprobar envío incierto", exact: true }).click();
  await expect(page.getByText("Conservamos la intención original", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actualizar lectura", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reintentar la misma acción", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Comprobar envío incierto", exact: true })).toBeDisabled();
  expect(captured).toHaveLength(1);
  await page.getByRole("button", { name: "Reintentar la misma acción", exact: true }).click();
  await expect(page.getByText("Se solicitó comprobar el envío incierto; no se autorizó otro envío.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Rol que estás representando")).toBeEnabled();
  expect(captured).toHaveLength(2);
  expect(captured[0]).toEqual(captured[1]);
  expect((await runtime.ledger()).submissions).toEqual(submissions);
});
