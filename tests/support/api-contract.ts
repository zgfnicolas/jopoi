import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { z } from "zod";
import { apiMediaType } from "../../src/shared/problem-details";

export function contractValidator() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addFormat("media-range", /^(?:[\w!#$&^_.+*-]+)\/(?:[\w!#$&^_.+*-]+)(?:\s*;[^\r\n]*)?$/);
  ajv.addFormat("int64", { type: "number", validate: Number.isSafeInteger });
  ajv.addFormat("float", { type: "number", validate: Number.isFinite });
  return ajv;
}
const document = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())), components: z.object({ schemas: z.record(z.string(), z.record(z.string(), z.unknown())) }) });
const operation = z.object({ responses: z.record(z.string(), z.object({ content: z.record(z.string(), z.object({ schema: z.object({ $ref: z.string() }) })).optional() })) });
const doc = document.parse(JSON.parse(readFileSync("public/openapi.json", "utf8")));
const validators = new Map<string, ValidateFunction>();
const ajv = contractValidator();
/** Contrastá el artefacto publicado con respuestas HTTP reales, sin reemplazar ninguna dependencia del producto. */
export function assertApiContract(method: string, path: string, status: number, headers: Headers, body: unknown): void {
  const route = Object.keys(doc.paths).sort((a, b) => Number(a.includes("{")) - Number(b.includes("{")))
    .find(template => new RegExp("^" + template.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(path.split("?")[0] ?? ""));
  if (!route) return; // Las respuestas 404 del router ajenas al inventario no son un DTO de la aplicación.
  const raw = doc.paths[route]?.[method.toLowerCase()];
  if (raw === undefined) return; // HEAD/OPTIONS y 405 pertenecen al framework.
  const contract = operation.parse(raw);
  const response = contract.responses[String(status)];
  assert.ok(response, `OPENAPI_UNDECLARED_STATUS:${method}:${route}:${status}`);
  if (status === 204) {
    assert.ok(headers.get("cache-control")?.includes("no-store"), `OPENAPI_CACHE_POLICY:${route}`);
    assert.ok(z.uuid().safeParse(headers.get("x-request-id")).success, `OPENAPI_REFERENCE:${route}`);
    return;
  }
  const content = response.content?.[apiMediaType(headers)];
  assert.ok(content, `OPENAPI_UNDECLARED_MEDIA_TYPE:${method}:${route}`);
  const name = content.schema.$ref.replace(/^#\/components\/schemas\//, "");
  let validate = validators.get(name);
  if (!validate) {
    const schema = doc.components.schemas[name];
    assert.ok(schema, `OPENAPI_SCHEMA_MISSING:${name}`);
    validate = ajv.compile(schema); validators.set(name, validate);
  }
  assert.ok(validate(body), `OPENAPI_RESPONSE_MISMATCH:${method}:${route}:${status}:${JSON.stringify(validate.errors)}`);
  assert.ok(headers.get("cache-control")?.includes("no-store"), `OPENAPI_CACHE_POLICY:${route}`);
  assert.ok(z.uuid().safeParse(headers.get("x-request-id")).success, `OPENAPI_REFERENCE:${route}`);
}
