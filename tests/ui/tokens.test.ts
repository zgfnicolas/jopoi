import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { requiredEntry } from "../support/required-entry";

const css = readFileSync("src/app/globals.css", "utf8");
const design = readFileSync("DESIGN.md", "utf8");
function capture(pattern: RegExp) {
  const match = css.match(pattern);
  assert.ok(match, `Bloque CSS ausente: ${pattern}`);
  return requiredEntry(match, 1);
}
function tokens(block: string) { return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]+);/gi)].map(match => [requiredEntry(match, 1), requiredEntry(match, 2)])); }
function color(palette: Record<string, string>, name: string): string {
  const value = palette[name];
  assert.ok(value, `Token CSS ausente: ${name}`);
  return value;
}
const light = tokens(capture(/:root \{([\s\S]*?)\n\}/));
const dark = { ...light, ...tokens(capture(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)) };
function luminance(color: string) {
  assert.match(color, /^#[\da-f]{6}$/i);
  const values = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return requiredEntry(values) * .2126 + requiredEntry(values, 1) * .7152 + requiredEntry(values, 2) * .0722;
}
function contrast(a: string, b: string) { const first = luminance(a), second = luminance(b); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); }

test("S20: contraste de texto, acciones, avisos, foco y controles en ambos temas", () => {
  const observations: object[] = [];
  for (const [theme, palette] of Object.entries({ light, dark })) {
    const check = (foreground: string, background: string, minimum: number) => {
      const ratio = contrast(color(palette, foreground), color(palette, background));
      observations.push({ theme, foreground, background, ratio, minimum });
      assert(ratio >= minimum, `${theme}: ${foreground}/${background} = ${ratio.toFixed(2)}, requiere ${minimum}`);
    };
    for (const surface of ["surface", "panel", "subtle"]) {
      for (const foreground of ["ink", "muted", "action", "danger", "warning", "success", "info"]) check(foreground, surface, 4.5);
      check("control-border", surface, 3);
    }
    check("on-action", "action", 4.5); check("on-action", "action-hover", 4.5);
  }
  assert(contrast(color(light, "ink"), color(light, "signal")) >= 4.5);
  mkdirSync(".cache/s20-ui", { recursive: true });
  writeFileSync(".cache/s20-ui/contrast.json", JSON.stringify(observations, null, 2));
});

test("S20: los tokens documentados coinciden con CSS y el sistema sin JavaScript", () => {
  for (const [name, color] of Object.entries(light)) assert(design.includes(`  ${name}: "${color}"`), name);
  for (const [name, color] of Object.entries(tokens(capture(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)))) {
    assert(design.includes(`  dark-${name}: "${color}"`), name);
    const fallback = tokens(capture(/:root:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\) \{([\s\S]*?)\n  \}/));
    assert.equal(fallback[name], color, `fallback ${name}`);
  }
});
