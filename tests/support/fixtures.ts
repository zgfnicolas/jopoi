import { inject } from "vitest";
import { createFixtures } from "./sql-fixtures";
const fixtures = () => createFixtures(inject("resources"));
export const fixture = (sql: string, values: unknown[] = [], exceptional = false) => fixtures().execute(sql, values, exceptional);
export const clearFixtures = () => fixtures().clear();
export const exceptional = {
  snapshot: (traceId: string, snapshot: unknown) => fixtures().exceptional.snapshot(traceId, snapshot),
  payload: (eventId: string, payload: unknown) => fixtures().exceptional.payload(eventId, payload),
  failEventCommit: () => fixtures().exceptional.failEventCommit(),
  restoreEventCommit: () => fixtures().exceptional.restoreEventCommit(),
};