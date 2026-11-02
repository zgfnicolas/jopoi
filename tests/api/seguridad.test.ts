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
    SELECT md5('cleanup-'||g)::uuid,md5('intent-'||g)::uuid,repeat('a',64),'Synthetic','synthetic@example.invalid','Synthetic','2025-01-01','2025-02-01' FROM generate_series(1,601) g`);
  await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('TRACE','GLOBAL','2025-01-01',1,'2025-01-04')`);
  const first=await environment.cron();expect(first.status).toBe(200);expect(first.body).toMatchObject({complete:false,counts:{contacts:300,rateBuckets:1}});
  expect((await environment.cron()).body).toMatchObject({complete:false,counts:{contacts:300}});
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

test("S22-01 · techo diario de 100 sesiones y 100 contactos compartido entre instancias sin penalizar replays",async()=>{
  const resources=inject("resources");
  const second=new TestRuntime({...resources,httpPort:resources.secondaryHttpPort});
  await second.start();
  try{
    const owner=new Visitor();
    expect((await owner.begin()).status).toBe(201);
    await fixture(`UPDATE "RequestRateBucket" SET used=99 WHERE scope='SESSION_CREATE' AND subject='GLOBAL'`);
    const sessionRace=await Promise.all([
      fetch(environment.origin+"/api/demo/session",{method:"POST",headers:{Origin:environment.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json",Accept:"application/problem+json","X-S21-Visitor":"203.0.113.10"},body:"{}"}),
      fetch(second.origin+"/api/demo/session",{method:"POST",headers:{Origin:second.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json",Accept:"application/problem+json","X-S21-Visitor":"203.0.113.11"},body:"{}"}),
    ]);
    expect(sessionRace.map(r=>r.status).sort()).toEqual([201,429]);
    const deniedSession=requiredEntry(sessionRace.filter(r=>r.status===429));
    expect(deniedSession.headers.get("retry-after")).toBe("43200");
    expect(deniedSession.headers.get("content-type")).toContain("application/problem+json");
    expect(await deniedSession.json()).toMatchObject({code:"RATE_LIMITED",status:429});
    expect((await owner.post("/api/demo/session",{})).status).toBe(200);

    await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('CONTACT_CREATE','GLOBAL','2026-01-01T00:00:00Z',99,'2026-01-04')`);
    const sharedContact={requestId:randomUUID(),name:"Synthetic S22",email:"s22@example.invalid",company:"Synthetic",message:"Idempotent across instances"};
    const contactRace=await Promise.all([
      fetch(environment.origin+"/api/demo-requests",{method:"POST",headers:{Origin:environment.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json",Accept:"application/problem+json","X-S21-Visitor":"203.0.113.20"},body:JSON.stringify(sharedContact)}),
      fetch(second.origin+"/api/demo-requests",{method:"POST",headers:{Origin:second.origin,"X-Jopoi-Request":"demo","Content-Type":"application/json",Accept:"application/problem+json","X-S21-Visitor":"203.0.113.20"},body:JSON.stringify(sharedContact)}),
    ]);
    expect(contactRace.map(r=>r.status).sort()).toEqual([200,201]);
    expect((await new Visitor().post("/api/demo-requests",sharedContact)).status).toBe(200);

    const pendingContact={...sharedContact,requestId:randomUUID()};
    const deniedContact=await new Visitor().post("/api/demo-requests",pendingContact,{Accept:"application/problem+json"});
    expect(deniedContact.status).toBe(429);
    expect(deniedContact.headers.get("retry-after")).toBe("43200");
    expect(deniedContact.headers.get("content-type")).toContain("application/problem+json");

    const db=new Client({connectionString:resources.databaseUrl});await db.connect();
    try{
      expect((await db.query('SELECT count(*)::int AS count FROM "DemoSession"')).rows[0].count).toBe(2);
      expect((await db.query('SELECT count(*)::int AS count FROM "DemoRequest"')).rows[0].count).toBe(1);
      expect((await db.query('SELECT used FROM "RequestRateBucket" WHERE scope=$1 AND subject=$2',["SESSION_CREATE","GLOBAL"])).rows[0].used).toBe(100);
      expect((await db.query('SELECT used FROM "RequestRateBucket" WHERE scope=$1 AND subject=$2',["CONTACT_CREATE","GLOBAL"])).rows[0].used).toBe(100);
    }finally{await db.end();}

    await environment.clock("2026-01-02T00:00:05.000Z");
    expect((await new Visitor().post("/api/demo-requests",pendingContact)).status).toBe(201);
    expect((await new Visitor().begin()).status).toBe(201);
  }finally{await second.close();}
},180000);

test("S22-02 · límites privados por minuto, 100 recibos por recorrido y 5000 intenciones diarias aislados por sesión",async()=>{
  const owner=await new Visitor().setup();
  const noisy=await new Visitor().setup();

  for(let index=0;index<30;index++)expect((await noisy.get("/api/demo/session")).status).toBe(200);
  const deniedRead=await noisy.get("/api/demo/session",{Accept:"application/problem+json"});
  expect(deniedRead.status).toBe(429);
  expect(deniedRead.headers.get("retry-after")).toBe("60");
  expect(deniedRead.headers.get("content-type")).toContain("application/problem+json");
  expect((await owner.get("/api/demo/session")).status).toBe(200);
  expect((await owner.get(`/api/demo/runs/${owner.traceId}`)).status).toBe(200);

  for(let index=0;index<9;index++){
    expect((await noisy.post(`/api/demo/runs/${noisy.traceId}/commands`,{
      action:"save",role:"generator",quantityKg:"12000",humidityPercent:String(20+(index%10)),expectedVersion:index+1,requestId:randomUUID(),
    })).status).toBe(200);
  }
  const deniedMutation=await noisy.post(
    `/api/demo/runs/${noisy.traceId}/commands`,
    {action:"save",role:"generator",quantityKg:"12000",humidityPercent:"25",expectedVersion:10,requestId:randomUUID()},
    {Accept:"application/problem+json"},
  );
  expect(deniedMutation.status).toBe(429);
  expect(deniedMutation.headers.get("retry-after")).toBe("60");
  expect((await owner.command({action:"save",role:"generator",quantityKg:"12000",humidityPercent:"28"})).status).toBe(200);

  await environment.advance(60000);
  const publishRequestId=randomUUID();
  const published=await owner.post(`/api/demo/runs/${owner.traceId}/commands`,{
    action:"publish",role:"generator",quantityKg:"12000",humidityPercent:"28",expectedVersion:2,requestId:publishRequestId,
  });
  expect(published.status).toBe(200);
  const eventId=published.body.applied.eventId as string;

  const retryRequestId=randomUUID();
  for(let index=0;index<5;index++){
    const retry=await owner.post(`/api/demo/runs/${owner.traceId}/events/${eventId}/retry`,{requestId:index===0?retryRequestId:randomUUID()});
    expect([200,202]).toContain(retry.status);
  }
  const deniedPublication=await owner.post(
    `/api/demo/runs/${owner.traceId}/events/${eventId}/retry`,
    {requestId:randomUUID()},
    {Accept:"application/problem+json"},
  );
  expect(deniedPublication.status).toBe(429);
  expect(deniedPublication.headers.get("retry-after")).toBe("60");
  expect((await noisy.command({action:"publish",role:"generator",quantityKg:"12000",humidityPercent:"25"})).status).toBe(200);

  await environment.advance(60000);
  await fixture(`UPDATE "RequestRateBucket" SET used=100 WHERE scope='RUN_INTENT'`);
  const deniedRunIntent=await owner.post(
    `/api/demo/runs/${owner.traceId}/commands`,
    {action:"approve",role:"coordinator",expectedVersion:3,requestId:randomUUID()},
    {Accept:"application/problem+json"},
  );
  expect(deniedRunIntent.status).toBe(429);
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/events/${eventId}/retry`,{requestId:randomUUID()})).status).toBe(429);

  const replayedPublish=await owner.post(`/api/demo/runs/${owner.traceId}/commands`,{
    action:"publish",role:"generator",quantityKg:"12000",humidityPercent:"28",expectedVersion:2,requestId:publishRequestId,
  });
  expect(replayedPublish.status).toBe(200);
  expect(replayedPublish.body.replayed).toBe(true);
  const replayedRetry=await owner.post(`/api/demo/runs/${owner.traceId}/events/${eventId}/retry`,{requestId:retryRequestId});
  expect(replayedRetry.status).toBe(200);
  expect(replayedRetry.body.replayed).toBe(true);
  expect((await owner.run()).version).toBe(3);

  await fixture(`UPDATE "RequestRateBucket" SET used=5000 WHERE scope='INTENT_CREATE' AND subject='GLOBAL'`);
  expect((await owner.post("/api/demo/runs/reset",{requestId:randomUUID()},{Accept:"application/problem+json"})).status).toBe(429);
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/commands`,{
    action:"publish",role:"generator",quantityKg:"12000",humidityPercent:"28",expectedVersion:2,requestId:publishRequestId,
  })).status).toBe(200);

  await environment.clock("2026-01-02T00:00:05.000Z");
  expect((await owner.post("/api/demo/runs/reset",{requestId:randomUUID()})).status).toBe(201);
});

test("S22-03 · propiedad y vigencia preceden al replay, conflicto de idempotencia no consume cupo y rechazo temprano sin cookie",async()=>{
  const unauthenticated=new Visitor();
  expect((await unauthenticated.get("/api/demo/session")).status).toBe(401);
  expect((await unauthenticated.get("/api/demo/runs/current")).status).toBe(401);
  expect((await unauthenticated.get(`/api/demo/runs/${randomUUID()}`)).status).toBe(401);
  expect((await unauthenticated.post("/api/demo/runs",{requestId:randomUUID()})).status).toBe(401);
  expect((await unauthenticated.post("/api/demo/runs/reset",{requestId:randomUUID()})).status).toBe(401);
  expect((await unauthenticated.post(`/api/demo/runs/${randomUUID()}/commands`,{
    action:"save",role:"generator",quantityKg:"12000",humidityPercent:"30",expectedVersion:1,requestId:randomUUID(),
  })).status).toBe(401);

  const resources=inject("resources");
  const db=new Client({connectionString:resources.databaseUrl});await db.connect();
  try{
    expect((await db.query('SELECT count(*)::int AS count FROM "RequestRateBucket"')).rows[0].count).toBe(0);
  }finally{await db.end();}

  const owner=await new Visitor().setup();
  const intruder=await new Visitor().setup();
  const saveId=randomUUID();
  const payload={action:"save" as const,role:"generator" as const,quantityKg:"12000",humidityPercent:"28",expectedVersion:1,requestId:saveId};
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/commands`,payload)).status).toBe(200);

  expect((await intruder.post(`/api/demo/runs/${owner.traceId}/commands`,payload)).status).toBe(404);
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/commands`,{...payload,humidityPercent:"29"})).body).toMatchObject({
    error:{code:"IDEMPOTENCY_CONFLICT"},
  });

  await fixture(`UPDATE "RequestRateBucket" SET used=100 WHERE scope='RUN_INTENT'`);
  await fixture(`UPDATE "RequestRateBucket" SET used=5000 WHERE scope='INTENT_CREATE' AND subject='GLOBAL'`);
  const replayAtCeiling=await owner.post(`/api/demo/runs/${owner.traceId}/commands`,payload);
  expect(replayAtCeiling.status).toBe(200);
  expect(replayAtCeiling.body.replayed).toBe(true);
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/commands`,{...payload,humidityPercent:"29"})).status).toBe(409);

  await environment.advance(8 * 86400 * 1000);
  expect((await owner.post(`/api/demo/runs/${owner.traceId}/commands`,payload)).status).toBe(401);
});

test("S22-04 · identidad de visitante agrupa prefijo IPv6 /64 y NAT sin persistir IP cruda",async()=>{
  const ipv6A=new Visitor();ipv6A.identity="2001:0db8:000a:000b:0001:0002:0003:0004";
  const ipv6B=new Visitor();ipv6B.identity="2001:db8:a:b:ffff:eeee:dddd:cccc";
  const ipv6Other=new Visitor();ipv6Other.identity="2001:db8:a:c::1";
  for(let index=0;index<3;index++)expect((await ipv6A.post("/api/demo-requests",{requestId:randomUUID(),name:"IPv6 A",email:"a@example.invalid",company:"Synthetic"})).status).toBe(201);
  for(let index=0;index<2;index++)expect((await ipv6B.post("/api/demo-requests",{requestId:randomUUID(),name:"IPv6 B",email:"b@example.invalid",company:"Synthetic"})).status).toBe(201);
  expect((await ipv6B.post("/api/demo-requests",{requestId:randomUUID(),name:"IPv6 B",email:"b@example.invalid",company:"Synthetic"})).status).toBe(429);
  expect((await ipv6Other.post("/api/demo-requests",{requestId:randomUUID(),name:"IPv6 C",email:"c@example.invalid",company:"Synthetic"})).status).toBe(201);

  const natV4=new Visitor();natV4.identity="203.0.113.25";
  const natMapped=new Visitor();natMapped.identity="::ffff:203.0.113.25";
  for(let index=0;index<4;index++)expect((await natV4.post("/api/demo-requests",{requestId:randomUUID(),name:"NAT v4",email:"nat@example.invalid",company:"Synthetic"})).status).toBe(201);
  expect((await natMapped.post("/api/demo-requests",{requestId:randomUUID(),name:"NAT mapped",email:"nat@example.invalid",company:"Synthetic"})).status).toBe(201);
  expect((await natMapped.post("/api/demo-requests",{requestId:randomUUID(),name:"NAT mapped",email:"nat@example.invalid",company:"Synthetic"})).status).toBe(429);

  const resources=inject("resources");
  const db=new Client({connectionString:resources.databaseUrl});await db.connect();
  try{
    const subjects=(await db.query('SELECT subject FROM "RequestRateBucket" WHERE subject<>$1',["GLOBAL"])).rows.map(r=>String(r.subject));
    expect(subjects).toHaveLength(3);
    expect(subjects.every(subject=>/^[a-f0-9]{64}$/.test(subject))).toBe(true);
    const serialized=JSON.stringify(subjects)+(await readFile(resolve(resources.directory,"next.log"),"utf8"));
    for(const raw of ["203.0.113.25","2001:0db8","2001:db8"])expect(serialized).not.toContain(raw);
  }finally{await db.end();}
});

test("S22-05 · convergencia tras 7 días sin cron en 3 ejecuciones y objetivo físico de 36 h separado de denegación lógica",async()=>{
  const resources=inject("resources");
  const opsEnv=resolve(resources.directory,"s22-ops.env");
  await writeFile(opsEnv,`DATABASE_URL=${JSON.stringify(resources.applicationUrl)}\n`,{mode:0o600});
  const runOpsStatus=async()=>{
    const outFile=resolve(resources.directory,`ops-${randomUUID()}.json`);
    await completed(child(process.execPath,["--import","tsx","scripts/ops-status.ts","--env-file",opsEnv],environment.env,outFile));
    const raw=await readFile(outFile,"utf8");
    expect(raw).not.toMatch(/synthetic@example\.invalid|s22-token/);
    return JSON.parse(raw);
  };
  const runMaintenanceCli=async()=>{
    const outFile=resolve(resources.directory,`maint-${randomUUID()}.json`);
    await completed(child(process.execPath,["--import","tsx","scripts/maintenance.ts","--run","--env-file",opsEnv],environment.env,outFile));
    const raw=await readFile(outFile,"utf8");
    expect(raw).not.toMatch(/synthetic@example\.invalid|s22-token/);
    return JSON.parse(raw);
  };

  const visitor=await new Visitor().setup();
  await environment.clock("2026-01-08T03:00:00.000Z");
  expect((await environment.cron()).status).toBe(200);
  await environment.clock("2026-01-08T13:00:00.000Z");
  expect((await visitor.trace()).status).toBe(410);
  expect((await visitor.get("/api/demo/session")).status).toBe(401);

  const beforeNormalCron=await runOpsStatus();
  expect(beforeNormalCron).toMatchObject({
    expiredAwaitingCleanup:{runs:1,sessions:1,contacts:0,quotas:0,leases:0,rateBuckets:0},
    oldestExpiredAgeMs:3600000,
    withinRetentionTarget:true,
    schedulerHealthy:true,
    stalledCategories:[],
  });

  await environment.clock("2026-01-09T13:00:00.000Z");
  const normalCron=await environment.cron();
  expect(normalCron.status).toBe(200);
  expect(normalCron.body).toMatchObject({
    complete:true,
    cleanupComplete:true,
    withinRetentionTarget:true,
    oldestExpiredAgeMs:0,
    stalledCategories:[],
    lastCompletedAt:"2026-01-09T13:00:00.000Z",
    counts:{runs:1,sessions:1,rateBuckets:0},
  });

  await fixture(`INSERT INTO "DemoSession" (id,"tokenHash","createdAt","expiresAt","runCount")
    SELECT md5('s22-outage-sess-'||g)::uuid,md5('s22-token-a-'||g)||md5('s22-token-b-'||g),
      ('2025-12-18T00:00:00Z'::timestamptz + ((g - 1) / 100) * interval '1 day'),
      ('2025-12-25T00:00:00Z'::timestamptz + ((g - 1) / 100) * interval '1 day'),
      3
    FROM generate_series(1,700) g`);
  await fixture(`INSERT INTO "DemoRun" (id,"traceId","sessionId","creationRequestId",ordinal,version,state,"createdAt","expiresAt","scenarioVersion","scenarioSnapshot","declaredGrams","humidityHundredths")
    SELECT md5('s22-outage-run-'||g||'-'||ord)::uuid,md5('s22-outage-trace-'||g||'-'||ord)::uuid,
      md5('s22-outage-sess-'||g)::uuid,md5('s22-outage-req-'||g||'-'||ord)::uuid,ord,1,'DRAFT',
      ('2025-12-18T00:00:00Z'::timestamptz + ((g - 1) / 100) * interval '1 day'),
      ('2025-12-25T00:00:00Z'::timestamptz + ((g - 1) / 100) * interval '1 day'),
      's22','{"version":"s22","isIllustrative":true}'::jsonb,12000000,2800
    FROM generate_series(1,700) g CROSS JOIN generate_series(1,3) ord`);
  await fixture(`INSERT INTO "DemoRequest" (id,"requestId","intentHash",name,email,company,"createdAt","expiresAt")
    SELECT md5('s22-outage-contact-'||g)::uuid,md5('s22-outage-c-intent-'||g)::uuid,repeat('b',64),'Synthetic','synthetic@example.invalid','Synthetic',
      ('2025-09-26T00:00:00Z'::timestamptz + ((g - 1) / 100) * interval '1 day'),
      ('2025-12-25T00:00:00Z'::timestamptz + ((g - 1) / 100) * interval '1 day')
    FROM generate_series(1,700) g`);
  await fixture(`INSERT INTO "DailyQuota" (scope,date,used)
    SELECT 'HCS_GLOBAL',('2025-12-20'::date + g),10 FROM generate_series(1,7) g`);
  await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt")
    SELECT 'SESSION_CREATE','GLOBAL',('2025-12-20T00:00:00Z'::timestamptz + g * interval '1 day'),100,('2025-12-23T00:00:00Z'::timestamptz + g * interval '1 day')
    FROM generate_series(1,7) g`);

  await environment.clock("2026-01-11T03:00:00.000Z");
  const outageObserved=await runOpsStatus();
  expect(outageObserved).toMatchObject({
    expiredAwaitingCleanup:{runs:2100,sessions:700,contacts:700,quotas:7,leases:0,rateBuckets:11},
    withinRetentionTarget:false,
    schedulerHealthy:false,
    stalledCategories:["rateBuckets","runs","contacts","sessions","quotas"],
  });

  const exec1=await environment.cron();
  expect(exec1.status).toBe(200);
  expect(exec1.body).toMatchObject({
    complete:false,
    cleanupComplete:false,
    counts:{runs:900,sessions:300,contacts:300,quotas:7,leases:0,rateBuckets:11},
    pending:{runs:1200,sessions:400,contacts:400,quotas:0,leases:0,rateBuckets:0},
    stalledCategories:[],
    lastPartialAt:"2026-01-11T03:00:00.000Z",
  });

  await environment.clock("2026-01-11T03:05:00.000Z");
  const exec2=await runMaintenanceCli();
  expect(exec2).toMatchObject({
    complete:false,
    cleanupComplete:false,
    counts:{runs:900,sessions:300,contacts:300,quotas:0,leases:0,rateBuckets:0},
    pending:{runs:300,sessions:100,contacts:100,quotas:0,leases:0,rateBuckets:0},
    stalledCategories:[],
    lastPartialAt:"2026-01-11T03:05:00.000Z",
  });

  await environment.clock("2026-01-12T03:00:00.000Z");
  const exec3=await environment.cron();
  expect(exec3.status).toBe(200);
  expect(exec3.body).toMatchObject({
    complete:true,
    cleanupComplete:true,
    withinRetentionTarget:true,
    oldestExpiredAgeMs:0,
    stalledCategories:[],
    counts:{runs:300,sessions:100,contacts:100,quotas:0,leases:0,rateBuckets:0},
    pending:{runs:0,sessions:0,contacts:0,quotas:0,leases:0,rateBuckets:0},
    lastCompletedAt:"2026-01-12T03:00:00.000Z",
  });

  const converged=await runOpsStatus();
  expect(converged).toMatchObject({
    expiredAwaitingCleanup:{runs:0,sessions:0,contacts:0,quotas:0,leases:0,rateBuckets:0},
    oldestExpiredAgeMs:0,
    withinRetentionTarget:true,
    schedulerHealthy:true,
    stalledCategories:[],
    lastCompletedAt:"2026-01-12T03:00:00.000Z",
  });
},180000);

test("S22-06 · limpieza justa y recuperable con hijos máximos y lease activo sin reescribir evidencia vigente",async()=>{
  const activeVisitor=await new Visitor().setup();
  const published=await activeVisitor.publish();
  const confirmedActive=await eventually(()=>activeVisitor.run(),run=>run.events[0]?.publication.verificationState==="MATCHED");
  const activeTxId=requiredEntry(confirmedActive.events,0).publication.transactionId;
  const activeDigest=published.event!.digest;

  const heavySessionId=randomUUID(),heavyRunId=randomUUID();
  const leasedSessionId=randomUUID(),leasedRunId=randomUUID(),leasedCommandId=randomUUID(),leasedEventId=randomUUID();
  await fixture(`INSERT INTO "DemoSession" (id,"tokenHash","createdAt","expiresAt","runCount") VALUES
    ('${heavySessionId}',repeat('1',64),'2025-12-01T00:00:00Z','2025-12-08T00:00:00Z',1),
    ('${leasedSessionId}',repeat('2',64),'2025-12-01T00:00:00Z','2025-12-08T00:00:00Z',1)`);
  await fixture(`INSERT INTO "DemoRun" (id,"traceId","sessionId","creationRequestId",ordinal,version,state,"createdAt","expiresAt","scenarioVersion","scenarioSnapshot","declaredGrams","humidityHundredths") VALUES
    ('${heavyRunId}','${randomUUID()}','${heavySessionId}','${randomUUID()}',1,100,'DRAFT','2025-12-01T00:00:00Z','2025-12-08T00:00:00Z','s22','{"version":"s22","isIllustrative":true}'::jsonb,12000000,2800),
    ('${leasedRunId}','${randomUUID()}','${leasedSessionId}','${randomUUID()}',1,2,'PUBLISHED','2025-12-01T00:00:00Z','2025-12-08T00:00:00Z','s22','{"version":"s22","isIllustrative":true}'::jsonb,12000000,2800)`);
  await fixture(`INSERT INTO "SessionRunIntent" ("sessionId","requestId",kind,"runId","createdAt")
    SELECT '${heavySessionId}'::uuid,md5('heavy-intent-'||g)::uuid,CASE WHEN g=1 THEN 'START'::"SessionIntentKind" ELSE 'RESET'::"SessionIntentKind" END,'${heavyRunId}'::uuid,'2025-12-01T00:00:00Z'
    FROM generate_series(1,100) g`);
  await fixture(`INSERT INTO "CommandReceipt" (id,"runId","requestId","intentHash",action,"resultingVersion",result,"createdAt")
    SELECT md5('heavy-cmd-'||g)::uuid,'${heavyRunId}'::uuid,md5('heavy-cmd-req-'||g)::uuid,repeat('a',64),'SAVE'::"CommandAction",g,'{}'::jsonb,'2025-12-01T00:00:00Z'
    FROM generate_series(1,100) g`);
  await fixture(`INSERT INTO "OperationEvent" (id,"runId","commandId",ordinal,type,"simulatedRole","appliedAt","payloadVersion",payload,digest)
    SELECT md5('heavy-evt-'||g)::uuid,'${heavyRunId}'::uuid,md5('heavy-cmd-'||g)::uuid,g,'LOT_PUBLISHED'::"EventType",'GENERATOR'::"SimulatedRole",'2025-12-01T00:00:00Z',1,'{}'::jsonb,repeat('c',64)
    FROM generate_series(1,5) g`);
  await fixture(`INSERT INTO "HcsPublication" ("eventId",state,"verificationState",network,"updatedAt")
    SELECT md5('heavy-evt-'||g)::uuid,'FAILED'::"PublicationState",'NOT_CHECKED'::"VerificationState",'testnet','2025-12-01T00:00:00Z'
    FROM generate_series(1,5) g`);
  await fixture(`INSERT INTO "HcsSubmissionAttempt" (id,"eventId",slot,kind,state,"transactionId","signedTransactionBytes","topicId","operatorId","configurationGeneration","quotaDate","createdAt")
    SELECT md5('heavy-att-'||g||'-'||s)::uuid,md5('heavy-evt-'||g)::uuid,s,
      CASE WHEN s<=3 THEN 'AUTOMATIC'::"HcsAttemptKind" ELSE 'MANUAL'::"HcsAttemptKind" END,
      'REJECTED'::"HcsAttemptState",'0.0.1002@1700000000.0000000'||g||s,decode('0102','hex'),'0.0.1001','0.0.1002',repeat('d',64),'2025-12-01','2025-12-01T00:00:00Z'
    FROM generate_series(1,5) g CROSS JOIN generate_series(1,4) s`);

  await fixture(`INSERT INTO "CommandReceipt" (id,"runId","requestId","intentHash",action,"resultingVersion",result,"createdAt") VALUES
    ('${leasedCommandId}','${leasedRunId}','${randomUUID()}',repeat('e',64),'PUBLISH',2,'{}'::jsonb,'2025-12-01T00:00:00Z')`);
  await fixture(`INSERT INTO "OperationEvent" (id,"runId","commandId",ordinal,type,"simulatedRole","appliedAt","payloadVersion",payload,digest) VALUES
    ('${leasedEventId}','${leasedRunId}','${leasedCommandId}',1,'LOT_PUBLISHED','GENERATOR','2025-12-01T00:00:00Z',1,'{}'::jsonb,repeat('f',64))`);
  await fixture(`INSERT INTO "HcsPublication" ("eventId",state,"verificationState",network,"leaseOwner","leaseExpiresAt","updatedAt") VALUES
    ('${leasedEventId}','IN_FLIGHT','NOT_CHECKED','testnet','${randomUUID()}','2026-01-01T12:05:00.000Z','2025-12-01T00:00:00Z')`);
  await fixture(`INSERT INTO "DemoRequest" (id,"requestId","intentHash",name,email,company,"createdAt","expiresAt") VALUES
    ('${randomUUID()}','${randomUUID()}',repeat('b',64),'Synthetic','synthetic@example.invalid','Synthetic','2025-09-01T00:00:00Z','2025-12-01T00:00:00Z')`);
  await fixture(`INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES
    ('TRACE','GLOBAL','2025-12-01T00:00:00Z',5,'2025-12-04T00:00:00Z')`);

  const partial=await environment.cron();
  expect(partial.status).toBe(200);
  expect(partial.body).toMatchObject({
    complete:false,
    cleanupComplete:false,
    counts:{runs:1,sessions:1,contacts:1,rateBuckets:1,quotas:0,leases:0},
    pending:{runs:1,sessions:1,contacts:0,rateBuckets:0,quotas:0,leases:0},
    stalledCategories:["runs","sessions"],
    lastPartialAt:"2026-01-01T12:00:00.000Z",
  });

  await fixture(`UPDATE "HcsPublication" SET state='FAILED',"leaseOwner"=NULL,"leaseExpiresAt"=NULL WHERE "eventId"='${leasedEventId}'`);
  await environment.clock("2026-01-01T12:06:00.000Z");
  const resumed=await environment.cron();
  expect(resumed.status).toBe(200);
  expect(resumed.body).toMatchObject({
    complete:true,
    cleanupComplete:true,
    counts:{runs:1,sessions:1,contacts:0,rateBuckets:0,quotas:0,leases:0},
    pending:{runs:0,sessions:0,contacts:0,rateBuckets:0,quotas:0,leases:0},
    stalledCategories:[],
    lastCompletedAt:"2026-01-01T12:06:00.000Z",
    lastPartialAt:"2026-01-01T12:00:00.000Z",
  });

  const activeAfter=await activeVisitor.run();
  expect(activeAfter.operation.state).toBe("PUBLISHED");
  expect(requiredEntry(activeAfter.events,0).publication.transactionId).toBe(activeTxId);
  expect((await activeVisitor.trace()).body).toMatchObject({events:[{event:{digest:activeDigest}}]});
});
