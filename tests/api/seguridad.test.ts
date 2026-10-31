import { requiredEntry } from "../support/required-entry";
import { afterAll, beforeEach, expect, inject, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { environment, eventually, Visitor } from "../support/client";
import { fixture } from "../support/fixtures";
import { databaseConnection } from "../../src/server/database/connection-policy";
import { TestRuntime } from "../support/runtime";
import { child, completed } from "../support/process";
import { resolve } from "node:path";
import { writeFile, readFile, readdir } from "node:fs/promises";
import { localhostCertificate } from "../support/tls-certificate";

beforeEach(()=>environment.reset());
afterAll(()=>environment.close());

test("S21-01 · límites exactos y compartidos entre dos instancias", async () => {
  const resources=inject("resources");
  const second = new TestRuntime({ ...resources, httpPort: resources.secondaryHttpPort });
  await second.start();
  try {
    const results=await Promise.all(Array.from({length:24},(_,index)=>fetch((index%2 ? second.origin : environment.origin)+"/api/demo/session", {
      method:"POST",headers:{Origin:index%2 ? second.origin : environment.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json","X-S21-Visitor":"same-visitor"},body:"{}",
    })));
    expect(results.filter(r=>r.status===201)).toHaveLength(20);
    const denied=results.filter(r=>r.status===429);
    expect(denied).toHaveLength(4);
    expect(denied.every(r=>r.headers.get("retry-after")==="600")).toBe(true);
    expect(await requiredEntry(denied).json()).toMatchObject({error:{code:"RATE_LIMITED"}});
    const other=new Visitor();
    expect((await other.begin()).status).toBe(201);
    await environment.advance(600000);
    expect((await fetch(environment.origin+"/api/demo/session",{method:"POST",headers:{Origin:environment.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json","X-S21-Visitor":"same-visitor"},body:"{}"})).status).toBe(201);
  } finally { await second.close(); }
},180000);

test("S21-02 · cuota global atómica, sin escrituras tras rechazo ni bypass por cookie",async()=>{
  await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('SESSION','GLOBAL','2026-01-01T12:00:00Z',199,'2026-01-04')`);
  const results=await Promise.all([new Visitor().post("/api/demo/session",{}),new Visitor().post("/api/demo/session",{})]);
  expect(results.map(r=>r.status).sort()).toEqual([201,429]);
  const db=new Client({connectionString:inject("resources").databaseUrl});await db.connect();
  try { expect((await db.query('SELECT count(*)::int AS count FROM "DemoSession"')).rows[0].count).toBe(1);
    expect((await db.query('SELECT used FROM "RequestRateBucket" WHERE subject=$1',["GLOBAL"])).rows[0].used).toBe(200);
    expect((await db.query('SELECT count(*)::int AS count FROM "RequestRateBucket" WHERE subject<>$1',["GLOBAL"])).rows[0].count).toBe(1);
  }finally{await db.end();}
});

test("S21-03 · contacto limitado, idempotencia conservada y datos de red protegidos",async()=>{
  const visitor=new Visitor();
  const body={requestId:randomUUID(),name:"Synthetic",email:"synthetic@example.invalid",company:"Synthetic",message:"Synthetic"};
  for(let i=0;i<5;i++) expect((await visitor.post("/api/demo-requests",body)).status).toBe(i===0?201:200);
  expect((await visitor.post("/api/demo-requests",{...body,requestId:randomUUID()})).status).toBe(429);
  const db=new Client({connectionString:inject("resources").databaseUrl});await db.connect();
  try { const rows=(await db.query('SELECT subject FROM "RequestRateBucket" WHERE subject<>$1',["GLOBAL"])).rows;
    expect(rows.every(r=>/^[a-f0-9]{64}$/.test(r.subject))).toBe(true);
    expect((await db.query('SELECT count(*)::int AS count FROM "DemoRequest"')).rows[0].count).toBe(1);
  } finally {await db.end();}
});

test("S21-04 · frontera HTTP rechaza entradas sin efectos y protege caché",async()=>{
  const visitor=await new Visitor().setup();
  const invalidHeaders:Record<string,string>[]=[{Origin:""},{"X-Jopoi-Request":""},{"Content-Type":"text/plain"}];
  for(const headers of invalidHeaders) {
    expect([400,403]).toContain((await visitor.post("/api/demo/runs/reset",{requestId:randomUUID()},headers)).status);
  }
  expect((await visitor.post("/api/demo/session",{extra:true})).status).toBe(400);
  const chunked=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(' '.repeat(5000)));controller.close();}});
  const options:RequestInit & {duplex:"half"}={method:"POST",headers:{Origin:environment.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json"},body:chunked,duplex:"half"};
  expect((await fetch(environment.origin+"/api/demo/session",options)).status).toBe(400);
  expect((await fetch(environment.origin+"/api/demo/session",{method:"PATCH"})).status).toBe(405);
  const response=await visitor.get("/api/demo/session");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toContain("Cookie");
  expect(response.body).toMatchObject({session:{runCount:1}});
});

test("S21-05 · credenciales alteradas y rotación del secreto no transfieren propiedad",async()=>{
  const owner=await new Visitor().setup();await owner.publish();
  const stranger=new Visitor();stranger.cookie="jopoi_session="+"a".repeat(43);
  expect((await stranger.get("/api/demo/session")).status).toBe(401);
  await environment.restart({SESSION_SECRET:"rotated-synthetic-session-secret-s21"});
  expect((await owner.get("/api/demo/session")).status).toBe(401);
  expect((await owner.trace()).status).toBe(200);
  await owner.begin();expect((await owner.get(`/api/demo/runs/${owner.traceId}`)).status).toBe(404);
});

test("S21-06 · rol de aplicación restringido, integridad y triggers efectivos",async()=>{
  const visitor=await new Visitor().setup();const published=await visitor.publish();
  await eventually(()=>visitor.run(),run=>run.events[0]?.publication.verificationState==="MATCHED");
  const resources=inject("resources");
  const auditEnvironment=resolve(resources.directory,"audit.env"),auditLog=resolve(resources.directory,"audit.json");
  await writeFile(auditEnvironment,`DATABASE_URL=${JSON.stringify(resources.applicationUrl)}\n`,{mode:0o600});
  await completed(child(process.execPath,["--import","tsx","scripts/database-audit.ts","--env-file",auditEnvironment],environment.env,auditLog));
  const audit: {passed:boolean;controls:{id:string;passed:boolean}[]}=JSON.parse(await readFile(auditLog,"utf8"));
  expect(audit.passed).toBe(true);
  expect(audit.controls.find(c=>c.id==="DB-TLS")?.passed).toBe(false);
  const app=new Client({connectionString:resources.applicationUrl});await app.connect();
  const admin=new Client({connectionString:resources.databaseUrl});await admin.connect();
  try{
    for(const sql of ['CREATE TABLE public.s21_forbidden (id int)','ALTER TABLE "DemoRun" DISABLE TRIGGER ALL','UPDATE "OperationEvent" SET digest=repeat(\'b\',64)']) {
      await expect(app.query(sql)).rejects.toMatchObject({code:"42501"});
    }
    await expect(admin.query('UPDATE "OperationEvent" SET digest=repeat(\'b\',64) WHERE id=$1',[published.applied.eventId])).rejects.toMatchObject({code:"23514"});
    await expect(admin.query('INSERT INTO "SessionRunIntent" ("sessionId","requestId",kind,"runId") VALUES ($1,$2,\'START\',$3)',[randomUUID(),randomUUID(),randomUUID()])).rejects.toMatchObject({code:"23503"});
    await expect(admin.query('UPDATE "DemoSession" SET "runCount"=4')).rejects.toMatchObject({code:"23514"});
  }finally{await app.end();await admin.end();}
});

test("S21-07 · limpieza acotada no declara completo un backlog pendiente",async()=>{
  await fixture(`INSERT INTO "DemoRequest" (id,"requestId","intentHash",name,email,company,"createdAt","expiresAt")
    SELECT md5('cleanup-'||g)::uuid,md5('intent-'||g)::uuid,repeat('a',64),'Synthetic','synthetic@example.invalid','Synthetic','2025-01-01','2025-02-01' FROM generate_series(1,201) g`);
  await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('TRACE','GLOBAL','2025-01-01',1,'2025-01-04')`);
  const first=await environment.cron();expect(first.status).toBe(200);expect(first.body).toMatchObject({complete:false,counts:{contacts:100,rateBuckets:1}});
  expect((await environment.cron()).body).toMatchObject({complete:false,counts:{contacts:100}});
  expect((await environment.cron()).body).toMatchObject({complete:true,counts:{contacts:1}});
  expect((await environment.cron()).body).toMatchObject({skipped:true});
});

test("S21-08 · un trabajador vencido no confirma ni libera el lease recuperado",async()=>{
  await environment.network("hold");
  const visitor=await new Visitor().setup();await visitor.publish();
  await eventually(()=>environment.ledger(),l=>l.submissions.length===1);
  const transactionId=(await environment.ledger()).submissions[0];
  await environment.advance(90001);
  await environment.network("confirmed");
  expect((await environment.cron()).status).toBe(200);
  await environment.network("confirmed",true);
  await eventually(()=>visitor.run(),run=>run.events[0]?.publication.verificationState==="MATCHED");
  expect((await environment.ledger()).submissions).toEqual([transactionId]);
  expect(requiredEntry((await visitor.run()).events, 0).publication.transactionId).toBe(transactionId);
});

test("S21-09 · backup sintético restaura evidencia confirmada tras reinicio",async()=>{
  const visitor=await new Visitor().setup();const published=await visitor.publish();
  const confirmed=await eventually(()=>visitor.run(),run=>run.events[0]?.publication.verificationState==="MATCHED");
  const resources=inject("resources"),url=new URL(resources.databaseUrl),dump=resolve(resources.directory,"s21-backup.sql");
  const args=["-h","127.0.0.1","-p",String(resources.pgPort),"-U",url.username];
  const env={...environment.env,PGPASSWORD:decodeURIComponent(url.password)};
  await completed(child(resolve(resources.pgBin,"pg_dump.exe"),[...args,"-d","s17_api","--no-owner","--no-privileges","-f",dump],env));
  const admin=new Client({connectionString:resources.databaseUrl});await admin.connect();
  try{await admin.query('CREATE DATABASE s21_restore');}finally{await admin.end();}
  await completed(child(resolve(resources.pgBin,"psql.exe"),[...args,"-d","s21_restore","-v","ON_ERROR_STOP=1","-f",dump],env));
  const restored=new URL(resources.databaseUrl);restored.pathname="/s21_restore";
  const db=new Client({connectionString:restored.href});await db.connect();
  try{
    const rows=(await db.query('SELECT e.payload,e.digest,p.state,p."transactionId" FROM "OperationEvent" e JOIN "HcsPublication" p ON p."eventId"=e.id')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({payload:published.event!.payload,digest:published.event!.digest,state:"CONFIRMED",
      transactionId:requiredEntry(confirmed.events, 0).publication.transactionId});
  }finally{await db.end();}
  await environment.close();await environment.database("stop");await environment.database("start");await environment.start();
  expect((await visitor.run()).operation.state).toBe("PUBLISHED");
},180000);

test("S21-10 · conexiones remotas nunca desactivan validación TLS",()=>{
  const remote="postgresql://synthetic:synthetic@example.invalid/synthetic";
  for(const query of ["", "?sslmode=disable", "?sslmode=no-verify", "?sslmode=require&uselibpqcompat=true","?sslmode=require&sslmode=disable"]) {
    expect(()=>databaseConnection(remote+query)).toThrow("DATABASE_CONNECTION_POLICY");
  }
  const strict=databaseConnection(remote+"?sslmode=require");
  expect(strict.ssl).toEqual({rejectUnauthorized:true});
  expect(strict.connectionString).not.toContain("sslmode");
});

test("S21-11 · verificación y lectura pública tienen límites sin efectos de negocio",async()=>{
  const visitor=await new Visitor().setup();const published=await visitor.publish();
  await eventually(()=>visitor.run(),r=>r.events[0]?.publication.verificationState==="MATCHED");
  const eventId=published.applied.eventId!;
  expect((await visitor.verification(eventId)).status).toBe(200);
  const results=await Promise.all(Array.from({length:34},()=>visitor.verification(eventId)));
  expect(results.filter(r=>r.status===200)).toHaveLength(29);
  expect(results.filter(r=>r.status===429)).toHaveLength(5);
  await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('TRACE','GLOBAL','2026-01-01T12:00:00Z',999,'2026-01-04')`);
  expect((await visitor.trace()).status).toBe(200);
  expect((await visitor.trace()).status).toBe(429);
  expect((await visitor.run()).version).toBe(2);
  expect((await environment.ledger()).submissions).toHaveLength(1);
});

test("S21-12 · contador indisponible rechaza antes de crear datos",async()=>{
  const visitor=new Visitor();
  await environment.database("stop");
  try{expect((await visitor.post("/api/demo/session",{})).status).toBe(503);}
  finally{await environment.database("start");}
  const db=new Client({connectionString:inject("resources").databaseUrl});await db.connect();
  try{expect((await db.query('SELECT count(*)::int AS count FROM "DemoSession"')).rows[0].count).toBe(0);}finally{await db.end();}
});

test("S21-13 · TLS real rechaza certificado no confiable y valida conexión cifrada",async()=>{
  const resources=inject("resources"),certificate=localhostCertificate();
  await writeFile(resolve(resources.directory,"data/server.crt"),certificate.cert,{mode:0o600});
  await writeFile(resolve(resources.directory,"data/server.key"),certificate.key,{mode:0o600});
  const admin=new Client({connectionString:resources.databaseUrl});await admin.connect();
  try{
    await admin.query("ALTER SYSTEM SET ssl='on'");
    await admin.query("ALTER SYSTEM SET ssl_cert_file='server.crt'");
    await admin.query("ALTER SYSTEM SET ssl_key_file='server.key'");
  }finally{await admin.end();}
  await environment.close();await environment.database("stop");await environment.database("start");
  const bad=new Client({connectionString:resources.applicationUrl,ssl:{rejectUnauthorized:true}});
  try{await expect(bad.connect()).rejects.toThrow();}finally{await bad.end();}
  const trusted=new Client({connectionString:resources.applicationUrl,ssl:{rejectUnauthorized:true,ca:certificate.cert}});
  try{await trusted.connect();expect((await trusted.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(true);}
  finally{await trusted.end();}
  await environment.start();
});

test("S21-14 · mantenimiento UTC no cuenta reintentos futuros como trabajo elegible",async()=>{
  await environment.network("unknown");
  const visitor=await new Visitor().setup();await visitor.publish();
  await eventually(()=>visitor.run(),run=>run.events[0]?.publication.state==="UNCERTAIN");
  const db=new Client({connectionString:inject("resources").databaseUrl});await db.connect();
  try{const row=(await db.query('SELECT "appliedAt",payload FROM "OperationEvent" LIMIT 1')).rows[0];
    expect(row.appliedAt.toISOString()).toBe(row.payload.appliedAt);
  }finally{await db.end();}
  const result=await environment.cron();
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({complete:true,publications:{processed:0,hasMore:false}});
});

test("S21-15 · migración aditiva sobre esquema anterior conserva datos",async()=>{
  const resources=inject("resources"),admin=new Client({connectionString:resources.databaseUrl});await admin.connect();
  try{await admin.query('CREATE DATABASE s21_upgrade');}finally{await admin.end();}
  const target=new URL(resources.databaseUrl);target.pathname="/s21_upgrade";
  const db=new Client({connectionString:target.href});await db.connect();
  try{
    const migrations=(await readdir("prisma/migrations",{withFileTypes:true})).filter(f=>f.isDirectory()).map(f=>f.name).sort();
    for(const name of migrations.filter(n=>n<"202610290001_request_rate_limits"))await db.query(await readFile(resolve("prisma/migrations",name,"migration.sql"),"utf8"));
    await db.query(`INSERT INTO "DemoSession" (id,"tokenHash","createdAt","expiresAt") VALUES ($1,repeat('a',64),'2026-01-01','2026-01-02')`,[randomUUID()]);
    await db.query(await readFile("prisma/migrations/202610290001_request_rate_limits/migration.sql","utf8"));
    expect((await db.query('SELECT count(*)::int AS count FROM "DemoSession"')).rows[0].count).toBe(1);
    await db.query(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('TRACE','GLOBAL','2026-01-01',1,'2026-01-04')`);
    expect((await db.query('SELECT count(*)::int AS count FROM "RequestRateBucket"')).rows[0].count).toBe(1);
  }finally{await db.end();}
});
