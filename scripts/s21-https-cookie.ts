import { createServer as httpsServer } from "node:https";
import { request as proxyRequest } from "node:http";
import { createServer as netServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { localhostCertificate } from "../tests/support/tls-certificate";
import { provisionRuntime } from "../tests/support/runtime-provision";
import { sealedEnvironment } from "../tests/support/test-environment";
import { child, stop } from "../tests/support/process";
import { eventually } from "../tests/support/runtime";
import { evidenceRevision } from "./lib/evidence";

if(process.argv.length!==2)throw new Error("S21_HTTPS_ARGUMENTS_INVALID");
const owned=await provisionRuntime();
const ephemeral=netServer();await new Promise<void>(r=>ephemeral.listen(0,"127.0.0.1",r));
const address=ephemeral.address();if(!address || typeof address==="string")throw new Error("S21_PORT_UNAVAILABLE");
const port=address.port;await new Promise<void>(r=>ephemeral.close(()=>r()));
const proxy=httpsServer(localhostCertificate(),(incoming,outgoing)=>{
  const forwarded=proxyRequest({host:"127.0.0.1",port,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
    outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });
  forwarded.on("error",()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forwarded);
});
await new Promise<void>(r=>proxy.listen(0,"127.0.0.1",r));
const binding=proxy.address();if(!binding || typeof binding==="string")throw new Error("S21_TLS_PORT_UNAVAILABLE");
const origin=`https://127.0.0.1:${binding.port}`;
const env:NodeJS.ProcessEnv={...sealedEnvironment(owned.resources),NODE_ENV:"production",APP_URL:origin,
  JOPOI_API_TEST_DIRECTORY:"",JOPOI_API_TEST_TOKEN:"",JOPOI_API_TEST_SOCKET:"",TSX_TSCONFIG_PATH:"",HEDERA_OPERATOR_KEY:"",HEDERA_OPERATOR_ID:"",HEDERA_TOPIC_ID:""};
const server=child(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],env,resolve(owned.resources.directory,"https-production.log"));
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
  await eventually(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/api/demo/session`,{signal:AbortSignal.timeout(2000)})).status;}catch{return 0;}},status=>status===401,"S21_PRODUCTION_READY",60000);
  browser=await chromium.launch();
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  const page=await context.newPage();await page.goto(origin+"/demo");
  await page.getByRole("button",{name:"Comenzar",exact:true}).click();
  await page.getByLabel("Cantidad declarada (kg)").waitFor();
  const session=(await context.cookies()).find(c=>c.name==="jopoi_session");
  assert.ok(session);assert.equal(session.secure,true);assert.equal(session.httpOnly,true);assert.equal(session.sameSite,"Lax");
  const exposed=await page.evaluate(()=>document.cookie+JSON.stringify(localStorage)+JSON.stringify(sessionStorage)+document.documentElement.outerHTML);
  assert.ok(!exposed.includes(session.value));
  await page.reload();await page.getByLabel("Cantidad declarada (kg)").waitFor();
  await mkdir(resolve(".cache/s21"),{recursive:true});
  await writeFile(resolve(".cache/s21/https-cookie.json"),JSON.stringify({code:"S21_HTTPS_COOKIE_PASSED",...evidenceRevision(),
    observedAt:new Date().toISOString(),secure:true,httpOnly:true,sameSite:"Lax",javascriptExposed:false,
    environment:"OWNED_LOCAL_PRODUCTION_BUILD_SELF_SIGNED_TLS_BROWSER_ONLY_NOT_PROVIDER"},null,2));
  console.log("S21_HTTPS_COOKIE_PASSED");
}finally{await browser?.close();await stop(server);proxy.closeAllConnections();await new Promise<void>(r=>proxy.close(()=>r()));await owned.close();}
