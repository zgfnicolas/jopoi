import { test, expect } from "./support/fixtures";
import { randomUUID } from "node:crypto";

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
