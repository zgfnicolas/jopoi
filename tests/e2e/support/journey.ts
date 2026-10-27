import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

/** Actions use the visitor's controls; no React state or business-module imports. */
export class Journey {
  constructor(readonly page: Page, readonly origin: string) {}
  async start() {
    await this.page.goto(this.origin + "/demo");
    await this.page.getByRole("button", { name: "Comenzar", exact: true }).click();
    await expect(this.page.getByLabel("Cantidad declarada (kg)")).toBeVisible();
  }
  async role(role: "generator" | "coordinator" | "carrier" | "buyer") {
    await expect(this.page.getByLabel("Rol que estás representando")).toBeEnabled();
    await this.page.getByLabel("Rol que estás representando").selectOption(role);
  }
  async action(name: string | RegExp, activate: (target: Locator) => Promise<void> = target => target.click()) {
    const button = this.page.getByRole("button", { name, exact: typeof name === "string" });
    const draft: Array<{ label: string; value: string; select: boolean }> = [];
    for (const label of ["Cantidad declarada (kg)", "Humedad (%)", "Peso recibido (kg)", "Motivo de ejemplo"]) {
      const field = this.page.getByLabel(label, { exact: true });
      if (await field.isVisible()) draft.push({ label, value: await field.inputValue(), select: label === "Motivo de ejemplo" });
    }
    await activate(button);
    const review = this.page.getByRole("button", { name: "Usar datos guardados", exact: true });
    await expect.poll(async () => await review.isVisible() || await this.page.getByLabel("Rol que estás representando").isEnabled()).toBe(true);
    if (await review.isVisible()) {
      await expect(this.page.getByText("Revisá los datos actualizados", { exact: true })).toBeVisible();
      await activate(review);
      for (const saved of draft) {
        const field = this.page.getByLabel(saved.label, { exact: true });
        if (await field.isVisible()) { if (saved.select) await field.selectOption(saved.value); else await field.fill(saved.value); }
      }
      // One explicit UI review and a new user action; uncertainty is never replayed here.
      await activate(button);
    }
    await expect(this.page.getByLabel("Rol que estás representando")).toBeEnabled();
  }
  async publish(humidity = "28,00") {
    await this.page.getByLabel("Cantidad declarada (kg)").fill("12000,000");
    await this.page.getByLabel("Humedad (%)").fill(humidity);
    await this.action("Publicar lote");
    await expect(this.page.getByRole("button", { name: /Representar a Coordinador/ })).toBeVisible();
  }
  async pickup() {
    await this.publish();
    await this.role("coordinator");
    await this.action("Aprobar lote");
    await this.action(/^Asignar Retorno A/);
    await this.role("carrier");
    await this.action("Confirmar retiro");
    await this.role("buyer");
    await expect(this.page.getByLabel("Peso recibido (kg)")).toBeVisible();
  }
  async shareUrl(): Promise<string> {
    const link = this.page.getByRole("link", { name: "Abrir trazabilidad pública", exact: true });
    await expect(link).toBeVisible();
    const value = await link.getAttribute("href");
    if (!value) throw new Error("PUBLIC_LINK_MISSING");
    return new URL(value, this.origin).href;
  }
  async refresh() { await this.action("Actualizar lectura"); }
  async screenshot(info: TestInfo, name: string) {
    await info.attach(name, { body: await this.page.screenshot({ fullPage: true }), contentType: "image/png" });
  }
}
