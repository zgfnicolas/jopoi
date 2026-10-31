import assert from "node:assert/strict";
import { test } from "node:test";
import { apiBoundary } from "../../src/server/http";
import { ApplicationError } from "../../src/server/application-error";
import { PROBLEM_MEDIA_TYPE, problemDetailsSchema } from "../../src/shared/problem-details";

test("S22-12: boundary conserva privacidad, referencias y Retry-After conocido de 503", async () => {
  const response = await apiBoundary("contacts.create", new Request("https://example.invalid/api/demo-requests", { headers: { Accept: PROBLEM_MEDIA_TYPE } }), async () => {
    throw new ApplicationError("DATABASE_UNAVAILABLE", { email: ["PRIVATE email SQL"], PRIVATE: ["PRIVATE"] }, { cause: new Error("PRIVATE"), retryAfterSeconds: 20 });
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "20");
  assert.equal(response.headers.get("content-type"), PROBLEM_MEDIA_TYPE);
  const body: unknown = await response.json();
  const parsed = problemDetailsSchema.parse(body);
  assert.equal(parsed.requestId, response.headers.get("x-request-id"));
  assert.equal(parsed.fields, undefined);
  assert.ok(!JSON.stringify(body).includes("PRIVATE"));
});
