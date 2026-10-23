import canonicalize from "canonicalize";

function invalid(): never { throw new TypeError("INVALID_CANONICAL_JSON"); }

/** canonicalize también admite omisiones/toJSON; esta frontera los rechaza antes de serializar. */
function assertJson(value: unknown, ancestors: Set<object>): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { if (!value.isWellFormed()) invalid(); return; }
  if (typeof value === "number") { if (!Number.isFinite(value)) invalid(); return; }
  if (typeof value !== "object") invalid();
  if (ancestors.has(value)) invalid();
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) invalid();
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !key.isWellFormed()) invalid();
    if (array && key === "length") continue;
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) invalid();
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (property === undefined || !("value" in property) || !property.enumerable) invalid();
    assertJson(property.value, ancestors);
  }
  if (array) {
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) invalid();
  }
  ancestors.delete(value);
}

/** RFC 8785: UTF-16 para ordenar claves, sin espacios ni normalización Unicode. */
export function canonicalJson(value: unknown): string {
  assertJson(value, new Set());
  const result = canonicalize(value);
  if (typeof result !== "string") invalid();
  return result;
}
