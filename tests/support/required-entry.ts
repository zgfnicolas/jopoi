/** Fallá ante una fixture incompleta: omitir la aserción podría aprobar evidencia ausente. */
export function requiredEntry<T>(values: readonly T[], index = 0): T {
  const value = values[index];
  if (value === undefined) throw new Error(`TEST_ENTRY_MISSING_AT_${index}`);
  return value;
}
