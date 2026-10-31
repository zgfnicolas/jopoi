import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { databaseConnection, migrationConnection } from "../../src/server/database/connection-policy";
import { localhostCertificate } from "../support/tls-certificate";
import { X509Certificate } from "node:crypto";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { benchmarkSchema, diagnosticRow, percentile } from "../../scripts/lib/s21-measurements";
import { ownedResources, readOwnedResources } from "../support/owned-resources";
import { requiredEntry } from "../support/required-entry";

test("S21 CLI: auditoría ayuda sin cargar entorno ni conectar",()=>{
  const result=spawnSync(process.execPath,["--import","tsx","scripts/database-audit.ts","--help"],{encoding:"utf8",windowsHide:true,env:{...process.env,DATABASE_URL:"invalid-private-marker"}});
  assert.equal(result.status,0);assert.match(result.stdout,/Solo lectura/);assert.doesNotMatch(result.stdout+result.stderr,/invalid-private-marker/);
});
test("S21 CLI: auditoría exige archivo explícito",()=>{
  const result=spawnSync(process.execPath,["--import","tsx","scripts/database-audit.ts"],{encoding:"utf8",windowsHide:true});
  assert.equal(result.status,2);assert.match(result.stderr,/INVALID_CLI_ARGUMENTS/);
});
test("S21 TLS: política compartida conserva compatibilidad y verifica migraciones",()=>{
  for(const mode of ["require","verify-ca","verify-full"]){
    const url=`postgresql://synthetic:synthetic@example.invalid/db?sslmode=${mode}`;
    assert.deepEqual(databaseConnection(url).ssl,{rejectUnauthorized:true});
    assert.equal(new URL(migrationConnection(url)).searchParams.get("sslmode"),"verify-full");
  }
  for(const query of ["", "?sslmode=disable","?sslmode=no-verify","?sslmode=require&sslmode=disable","?sslmode=require&uselibpqcompat=true","?sslmode=require&sslrootcert=any"]){
    assert.throws(()=>databaseConnection("postgresql://synthetic:synthetic@example.invalid/db"+query),/DATABASE_CONNECTION_POLICY/);
  }
  assert.equal(databaseConnection("postgresql://synthetic:synthetic@127.0.0.1/db").ssl,undefined);
});
test("S21 TLS: certificado sintético efímero válido para localhost",()=>{
  const fixture=localhostCertificate();const cert=new X509Certificate(fixture.cert);
  assert.equal(cert.checkIP("127.0.0.1"),"127.0.0.1");
  assert.equal(cert.checkHost("localhost"),"localhost");
  assert.equal(cert.verify(cert.publicKey),true);
});

test("S22: diagnóstico y métricas incompletos no producen evidencia aprobada", () => {
  assert.throws(() => diagnosticRow([], z.object({ server_version: z.string() })));
  assert.throws(() => diagnosticRow([{ server_version: null }], z.object({ server_version: z.string() })));
  assert.deepEqual(diagnosticRow([{ server_version: "synthetic" }], z.object({ server_version: z.string() })), { server_version: "synthetic" });
  for (const values of [[], [NaN], [Infinity], [-1]]) assert.throws(() => percentile(values, 0), /S21_MEASUREMENT_INCOMPLETE/);
  assert.equal(percentile([0, 10, 20], 1), 10);
  assert.throws(() => benchmarkSchema.parse({ measurements: [{ p95: 5 }] }));
  assert.throws(() => requiredEntry([]), /TEST_ENTRY_MISSING/);
});

test("S22: recursos completos y marcador propio antes de usar el arnés", async () => {
  const root = resolve(".cache/api-tests") + sep;
  const directory = resolve(root, randomUUID());
  const token = randomBytes(32).toString("hex");
  const resources = { directory, token, pgPort: 54329, httpPort: 54330, secondaryHttpPort: 54331,
    databaseUrl: "postgresql://synthetic:unused@127.0.0.1:54329/s17_api", applicationUrl: "postgresql://synthetic:unused@127.0.0.1:54329/s17_api",
    socket: process.platform === "win32" ? `\\\\.\\pipe\\jopoi-s17-${token}` : resolve(directory, "ledger.sock"), pgBin: resolve(".tools/postgresql/synthetic/bin") };
  await mkdir(directory, { recursive: true });
  try {
    await assert.rejects(ownedResources({}), /TEST_RESOURCES_INVALID/);
    await assert.rejects(ownedResources({ ...resources, directory: resolve(".cache/elsewhere") }), /TEST_RESOURCES_NOT_OWNED/);
    await assert.rejects(ownedResources({ ...resources, applicationUrl: "postgresql://synthetic:unused@example.invalid/normal" }), /TEST_DATABASE_NOT_OWNED/);
    await writeFile(resolve(directory, "owner.json"), JSON.stringify(resources));
    await assert.rejects(ownedResources({ ...resources, token: "0".repeat(64) }), /TEST_RESOURCES_NOT_OWNED/);
    await assert.rejects(ownedResources({ ...resources, httpPort: resources.pgPort }), /TEST_RESOURCE_PORT_COLLISION/);
    await assert.rejects(ownedResources({ ...resources, socket: "unowned" }), /TEST_RESOURCES_NOT_OWNED/);
    await assert.rejects(readOwnedResources(resolve(directory, "missing.json")), /ENOENT/);
    const file = resolve(directory, "resources.json");
    await writeFile(file, JSON.stringify(resources));
    assert.deepEqual(await readOwnedResources(file), resources);
    assert.equal((await ownedResources({ ...resources, httpPort: resources.secondaryHttpPort })).httpPort, resources.secondaryHttpPort);
  } finally {
    assert.ok(directory.startsWith(root));
    await rm(directory, { recursive: true, force: true });
  }
});
