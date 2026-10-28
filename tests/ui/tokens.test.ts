import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("src/app/globals.css", "utf8");
const design = readFileSync("DESIGN.md", "utf8");
function tokens(block: string) { return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]+);/gi)].map(match => [match[1], match[2]])); }
const light = tokens(css.match(/:root \{([\s\S]*?)\n\}/)![1]);
const dark = { ...light, ...tokens(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)![1]) };
function luminance(color: string) {
  const values = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05); }

test("S20: contraste de texto, acciones, avisos, foco y controles en ambos temas", () => {
  const observations: object[] = [];
  for (const [theme, palette] of Object.entries({ light, dark })) {
    const check = (foreground: string, background: string, minimum: number) => {
      const ratio = contrast(palette[foreground], palette[background]);
      observations.push({ theme, foreground, background, ratio, minimum });
      assert(ratio >= minimum, `${theme}: ${foreground}/${background} = ${ratio.toFixed(2)}, requiere ${minimum}`);
    };
    for (const surface of ["surface", "panel", "subtle"]) {
      for (const foreground of ["ink", "muted", "action", "danger", "warning", "success", "info"]) check(foreground, surface, 4.5);
      check("control-border", surface, 3);
    }
    check("on-action", "action", 4.5); check("on-action", "action-hover", 4.5);
  }
  assert(contrast(light.ink, light.signal) >= 4.5);
  mkdirSync(".cache/s20-ui", { recursive: true });
  writeFileSync(".cache/s20-ui/contrast.json", JSON.stringify(observations, null, 2));
});

test("S20: los tokens documentados coinciden con CSS y el sistema sin JavaScript", () => {
  for (const [name, color] of Object.entries(light)) assert(design.includes(`  ${name}: "${color}"`), name);
  for (const [name, color] of Object.entries(tokens(css.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)![1]))) {
    assert(design.includes(`  dark-${name}: "${color}"`), name);
    const fallback = tokens(css.match(/:root:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\) \{([\s\S]*?)\n  \}/)![1]);
    assert.equal(fallback[name], color, `fallback ${name}`);
  }
});
