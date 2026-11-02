import { test, expect } from "./support/fixtures";
import { randomUUID } from "node:crypto";
import { createFixtures } from "../support/sql-fixtures";

test("S21-UI-01 · credencial HttpOnly no aparece en JavaScript ni almacenamiento",async({page,journey,context},info)=>{
  const sessionResponse=page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname==="/api/demo/session");
  await journey.start();
  const installedCookie=await(await sessionResponse).headerValue("set-cookie");
  // Check the wire policy: Windows WebKit's cookie metadata reports None even
  // when its captured Set-Cookie explicitly contains SameSite=lax.
  const attributes=installedCookie?.split(";").slice(1).map(value=>value.trim().toLowerCase());
  expect(attributes).toContain("samesite=lax");
  expect(attributes).toContain("httponly");
  expect(attributes).toContain("path=/");
  const cookies=await context.cookies();
  const session=cookies.find(c=>c.name==="jopoi_session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.path).toBe("/");
  await info.attach("cookie-policy-observation",{body:JSON.stringify({sameSiteFromResponse:"Lax",sameSiteMetadata:session?.sameSite,httpOnly:session?.httpOnly}),contentType:"application/json"});
  const state=await page.evaluate(()=>({cookie:document.cookie,local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage),html:document.documentElement.outerHTML}));
  expect(state.cookie).not.toContain("jopoi_session");
  expect(JSON.stringify(state)).not.toContain(session!.value);
  await page.reload();
  await expect(page.getByLabel("Rol que estás representando")).toBeVisible();
});

test("S21-UI-02 · límite de contacto conserva intención y espera reintento manual",async({page,journey,runtime})=>{
  for(let index=0;index<5;index++){
    const response=await page.request.post(journey.origin+"/api/demo-requests",{headers:{Origin:journey.origin,"X-Jopoi-Request":"demo"},
      data:{requestId:randomUUID(),name:"Synthetic fixture",email:"synthetic@example.invalid",company:"Synthetic"}});
    expect(response.status()).toBe(201);
  }
  await page.goto(journey.origin+"/#book-a-demo");
  await page.getByLabel("Nombre",{exact:true}).fill("Synthetic S21");
  await page.getByLabel("Email",{exact:true}).fill("s21@example.invalid");
  await page.getByLabel("Empresa",{exact:true}).fill("Synthetic");
  const requests:string[]=[];
  page.on("request",request=>{if(request.method()==="POST" && new URL(request.url()).pathname==="/api/demo-requests")requests.push(request.postData()!);});
  await page.getByRole("button",{name:"Solicitar conocer el prototipo",exact:true}).click();
  await expect(page.getByText(/Podés volver a intentar en \d+ segundos/)).toBeVisible();
  await expect(page.getByLabel("Nombre",{exact:true})).toHaveValue("Synthetic S21");
  expect(requests).toHaveLength(1);
  await page.getByRole("button",{name:"Reintentar guardado",exact:true}).click();
  await expect(page.getByRole("button",{name:"Reintentar guardado",exact:true})).toBeEnabled();
  expect(requests).toHaveLength(2);expect(requests[0]).toBe(requests[1]);
  await runtime.advance(3600001);
  await page.getByRole("button",{name:"Reintentar guardado",exact:true}).click();
  await expect(page.getByText("Tu solicitud para conocer el prototipo quedó guardada.",{exact:true})).toBeVisible();
  expect(requests).toHaveLength(3);expect(new Set(requests).size).toBe(1);
});

test("S22-UI-01 · techo diario de creación de contactos devuelve 429 Problem Details y confirma al cambiar el día UTC",async({page,journey,runtime})=>{
  await runtime.clock("2026-01-01T23:59:30.000Z");
  await createFixtures(runtime.resources).execute(
    `INSERT INTO "RequestRateBucket" (scope,subject,"windowStart",used,"expiresAt") VALUES ('CONTACT_CREATE','GLOBAL','2026-01-01T00:00:00Z',100,'2026-01-04')`,
  );
  await page.goto(journey.origin+"/#book-a-demo");
  await page.getByLabel("Nombre",{exact:true}).fill("Synthetic S22");
  await page.getByLabel("Email",{exact:true}).fill("s22-daily@example.invalid");
  await page.getByLabel("Empresa",{exact:true}).fill("Synthetic Daily");
  const requests:string[]=[];
  page.on("request",request=>{if(request.method()==="POST" && new URL(request.url()).pathname==="/api/demo-requests")requests.push(request.postData()!);});
  const firstResponse=page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname==="/api/demo-requests");
  await page.getByRole("button",{name:"Solicitar conocer el prototipo",exact:true}).click();
  const denied=await firstResponse;
  expect(denied.status()).toBe(429);
  expect(await denied.headerValue("retry-after")).toBe("30");
  expect(await denied.headerValue("content-type")).toContain("application/problem+json");
  await expect(page.getByText(/Podés volver a intentar en 30 segundos/)).toBeVisible();
  await expect(page.getByLabel("Nombre",{exact:true})).toHaveValue("Synthetic S22");
  await expect(page.getByLabel("Nombre",{exact:true})).toBeDisabled();
  expect(requests).toHaveLength(1);
  await runtime.clock("2026-01-02T00:00:05.000Z");
  await page.getByRole("button",{name:"Reintentar guardado",exact:true}).click();
  await expect(page.getByText("Tu solicitud para conocer el prototipo quedó guardada.",{exact:true})).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
});

test("S22-UI-02 · límite de mutación en el panel conserva requestId de la intención y confirma tras espera manual",async({page,journey,runtime})=>{
  await runtime.clock(new Date(Math.ceil(Date.now()/60000)*60000).toISOString());
  await journey.start();
  await page.getByLabel("Humedad (%)").fill("28,00");
  await createFixtures(runtime.resources).execute(
    `UPDATE "RequestRateBucket" SET used=100 WHERE scope='MUTATION' AND subject='GLOBAL'`,
  );
  const requests:string[]=[];
  page.on("request",request=>{
    if(request.method()==="POST"&&new URL(request.url()).pathname.endsWith("/commands"))requests.push(request.postData()!);
  });
  const firstResponse=page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname.endsWith("/commands"));
  await page.getByRole("button",{name:"Publicar lote",exact:true}).click();
  const denied=await firstResponse;
  expect(denied.status()).toBe(429);
  expect(await denied.headerValue("retry-after")).toBe("60");
  expect(await denied.headerValue("content-type")).toContain("application/problem+json");
  await expect(page.getByText(/Podés volver a intentar en 60 segundos/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Reintentar la misma acción",exact:true})).toBeEnabled();
  expect(requests).toHaveLength(1);
  await runtime.advance(60001);
  await page.getByRole("button",{name:"Reintentar la misma acción",exact:true}).click();
  await expect(page.getByRole("button",{name:/Representar a Coordinador/})).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
});
