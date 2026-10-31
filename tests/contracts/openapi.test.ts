import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { contractValidator } from "../support/api-contract";
import { buildOpenApi } from "../../scripts/lib/openapi";

test("S22-12: OpenAPI 3.2 valida contra el esquema oficial y todos los schemas compilan", () => {
  const ajv = contractValidator();
  const source = readFileSync("tests/contracts/vendor/openapi-3.2-schema.json", "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), "0c9d74bf25f9b9388b2d81e421ef60fdefa9feffa94898dadfc501b342b3bfcc");
  // Ajv resuelve anchors dinámicos solo en raíz. Este documento no extiende meta:
  // fijá su referencia al mismo $defs/schema (object|boolean), sin cambiar las otras reglas.
  const schema = JSON.parse(source.replaceAll('"$dynamicRef": "#meta"', '"$ref": "#/$defs/schema"'));
  const validate = ajv.compile(schema);
  const doc = buildOpenApi();
  assert.ok(validate(doc), JSON.stringify(validate.errors?.slice(0, 5)));
  assert.equal(validate({ ...doc, openapi: "3.1.0" }), false);
  assert.equal(validate({ ...doc, paths: { "/invalid": { get: { responses: { "200": { description: "Inválido", headers: { Invalid: { schema: { type: "string" }, unexpected: true } } } } } } } }), false);
  for (const [name, definition] of Object.entries(doc.components.schemas)) assert.ok(ajv.compile(definition), name);
  assert.equal(readFileSync("public/openapi.json", "utf8"), JSON.stringify(doc, null, 2) + "\n");
});
test("S22-12: inventario coincide con métodos y rutas exportados por Next", () => {
  const document = buildOpenApi();
  const observed: string[] = [];
  for (const file of globSync("src/app/api/**/route.ts")) {
    const path = "/" + file.replaceAll("\\", "/").replace(/^src\/app\//, "").replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}");
    const source = readFileSync(file, "utf8");
    const methods = [...source.matchAll(/(?:as\s+|function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/g)].map(match => match[1]);
    for (const method of new Set(methods)) observed.push(`${method} ${path}`);
  }
  const declared = Object.entries(document.paths).flatMap(([path, item]) => Object.keys(item).filter(key => ["get", "post", "put", "patch", "delete"].includes(key)).map(method => `${method.toUpperCase()} ${path}`));
  assert.deepEqual(observed.sort(), declared.sort());
});
