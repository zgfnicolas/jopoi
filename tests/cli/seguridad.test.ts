import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { databaseConnection, migrationConnection } from "../../src/server/database/connection-policy";
import { localhostCertificate } from "../support/tls-certificate";
import { X509Certificate } from "node:crypto";
import { ApplicationError } from "../../src/server/application-error";
import { mapDatabaseError } from "../../src/server/database/errors";

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
test("S21 SQLSTATE: mapDatabaseError traduce conflictos y bloqueos/timeouts sin filtrar detalles",()=>{
  for(const code of ["P2034","40001","40P01"]){
    const mapped=mapDatabaseError({cause:{code,message:"secret-sql-detail"}});
    assert.ok(mapped instanceof ApplicationError);
    assert.equal(mapped.code,"VERSION_CONFLICT");
    assert.doesNotMatch(mapped.message,/secret-sql-detail/);
  }
  for(const code of ["55P03","57014","53100","53200","53300","57P04","08006","P2024"]){
    const mapped=mapDatabaseError({driverAdapterError:{cause:{originalCode:code,message:"secret-conn-string"}}});
    assert.ok(mapped instanceof ApplicationError);
    assert.equal(mapped.code,"DATABASE_UNAVAILABLE");
    assert.doesNotMatch(mapped.message,/secret-conn-string/);
  }
});
