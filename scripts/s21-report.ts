import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { evidenceRevision } from "./lib/evidence";

type Evidence={cases?:{id:string;result:string;observations?:unknown[]}[];passed?:boolean;code?:string;revision?:string;fingerprint?:string;observations?:{errors:number;maxConnections:number}[]};
async function read(path:string):Promise<Evidence|undefined>{try{return JSON.parse(await readFile(path,"utf8"));}catch{return undefined;}}
const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=="--browser-base"))throw new Error("S21_REPORT_ARGUMENTS_INVALID");
const basePath=args.length?resolve(args[1]):undefined;
if(basePath&&!basePath.startsWith(resolve(".cache")+sep))throw new Error("S21_BROWSER_BASE_OUTSIDE_EVIDENCE_DIRECTORY");
const api=await read(".cache/s21/api-report.json"),latestBrowser=await read(".cache/e2e/report.json"),https=await read(".cache/s21/https-cookie.json");
// Combining a focused rerun requires an explicit base. Preserve both snapshots;
// a failed or incomplete new observation always supersedes the older result.
const browserFull=basePath?await read(basePath):undefined;
const observed=latestBrowser?.cases?.filter(c=>c.observations?.length)??[];
if(basePath&&(!browserFull?.cases||!observed.length||browserFull.revision!==latestBrowser?.revision))throw new Error("S21_BROWSER_BASE_UNAVAILABLE_OR_REVISION_MISMATCH");
const browser:Evidence|undefined=browserFull?{cases:browserFull.cases?.map(c=>observed.find(latest=>latest.id===c.id)??c)}:latestBrowser;
const benchmark=await read(".cache/s21/benchmark-comparison.json"),metrics=await read(".cache/s21/query-metrics.json");
const passed=(evidence:Evidence|undefined,ids:string[])=>ids.every(id=>evidence?.cases?.find(c=>c.id===id)?.result==="APROBADO");
const apiIds=(...numbers:number[])=>numbers.map(n=>`API-${String(n).padStart(2,"0")}`);
const securityIds=(...numbers:number[])=>numbers.map(n=>`S21-${String(n).padStart(2,"0")}`);
const browserIds=(...numbers:number[])=>numbers.map(n=>`E2E-${String(n).padStart(2,"0")}`);
const sequence=(first:number,last:number)=>Array.from({length:last-first+1},(_,i)=>first+i);
const controls=[
  {id:"S21-SESSION",stories:sequence(3,19),priority:"P0",risk:"Acceso cruzado o exposición de credenciales",evidence:[...apiIds(1,3,4),...securityIds(4,5),...browserIds(6,11),"S21-UI-01","HTTPS"],
    localPassed:passed(api,[...apiIds(1,3,4),...securityIds(4,5)])&&passed(browser,[...browserIds(6,11),"S21-UI-01"])&&https?.code==="S21_HTTPS_COOKIE_PASSED",correction:"Sesión opaca actual conservada; cookie y vencimiento comprobados"},
  {id:"S21-ABUSE",stories:[20],priority:"P0",risk:"Consumo anónimo y evasión entre instancias",evidence:[...securityIds(1,2,3,11,12),"S21-UI-02"],
    localPassed:passed(api,securityIds(1,2,3,11,12))&&passed(browser,["S21-UI-02"]),correction:"Admisión PostgreSQL atómica, HMAC, Retry-After y reintento manual"},
  {id:"S21-ATOMICITY",stories:sequence(21,29),priority:"P0",risk:"Efectos parciales, duplicación o cupos excedidos",evidence:apiIds(2,12,13,15,17),
    localPassed:passed(api,apiIds(2,12,13,15,17)),correction:"Arquitectura transaccional conservada y verificada"},
  {id:"S21-WORKERS",stories:sequence(30,38),priority:"P0",risk:"Trabajador vencido o mantenimiento incompleto",evidence:[...apiIds(19,20,21),...securityIds(7,8,14),...browserIds(14)],
    localPassed:passed(api,[...apiIds(19,20,21),...securityIds(7,8,14)])&&passed(browser,browserIds(14)),correction:"UTC explícito, limpieza de contadores y logs de ejecución acotados"},
  {id:"S21-CONTACTS",stories:[39,40],priority:"P0",risk:"Exposición de contactos o CSV inseguro",evidence:[...apiIds(22,23),...browserIds(7)],
    localPassed:passed(api,apiIds(22,23))&&passed(browser,browserIds(7)),correction:"Separación de datos y exportación privada conservadas"},
  {id:"S21-INTEGRITY",stories:sequence(41,47),priority:"P0",risk:"Referencias inválidas o evidencia histórica alterada",evidence:[...apiIds(14),...securityIds(6,15),"docs/s21-validacion.md"],
    localPassed:passed(api,[...apiIds(14),...securityIds(6,15)]),correction:"Rol restringido, grants de funciones, catálogo e invariantes SQL comprobados"},
  {id:"S21-PERFORMANCE",stories:sequence(48,50),priority:"P1",risk:"Regresión de latencia o saturación del pool",evidence:["benchmark-baseline.json","benchmark-after.json","benchmark-comparison.json","query-metrics.json"],
    localPassed:benchmark?.passed===true&&metrics?.observations?.length===6&&metrics.observations.every(o=>o.errors===0&&o.maxConnections<=2),correction:"Comparación reproducible y diagnóstico SQL separado; sin índices especulativos"},
  {id:"S21-DATABASE",stories:[51,52],priority:"P0",risk:"Conexión o privilegios inseguros",evidence:securityIds(6,10,13),
    localPassed:passed(api,securityIds(6,10,13)),correction:"TLS estricto, conexiones UTC y auditoría de permisos; proveedor pendiente",external:true},
  {id:"S21-RECOVERY",stories:[53,54],priority:"P0",risk:"Migración o restauración irrecuperable",evidence:securityIds(9,15),
    localPassed:passed(api,securityIds(9,15)),correction:"Restauración sintética y migración aditiva verificadas; proveedor pendiente",external:true},
  {id:"S21-EVIDENCE",stories:[1,2,55,56],priority:"P1",risk:"Confundir observación local con aceptación externa",evidence:["api-report.json","https-cookie.json","docs/s21-validacion.md"],
    localPassed:passed(api,[...apiIds(...sequence(1,26)),...securityIds(...sequence(1,15))]),correction:"Matriz con estados explícitos y casos omitidos bloqueados"},
].map(c=>({...c,state:c.localPassed?(c.external?"pendiente evidencia externa":"comprobado"):"parcial"}));
const localPassed=controls.every(c=>c.localPassed);
const report={...evidenceRevision(),generatedAt:new Date().toISOString(),localPassed,globalAcceptance:false,controls,
  sourceFingerprints:{api:api?.fingerprint,browser:latestBrowser?.fingerprint,browserBase:browserFull?.fingerprint,https:https?.fingerprint},
  browserEvidence:basePath?[basePath,".cache/e2e/report.json"]:[".cache/e2e/report.json"],
  notApplicable:[{control:"Access/refresh tokens y logout",state:"no aplicable justificado",reason:"Decisión confirmada: sesión anónima fija sin nuevo sistema de identidad"}],
  externalPending:["TLS y pooler del proveedor","Permisos y política de red del proveedor","Cron desplegado","Backup/restauración del proveedor","Rendimiento del candidato"]};
await mkdir(resolve(".cache/s21"),{recursive:true});
await writeFile(resolve(".cache/s21/control-matrix.json"),JSON.stringify(report,null,2));
await writeFile(resolve(".cache/s21/control-matrix.md"),"# S21 · evidencia local\n\n| Control | Historias | Prioridad | Estado |\n| --- | --- | --- | --- |\n"+controls.map(c=>`| ${c.id} | ${c.stories.join(", ")} | ${c.priority} | ${c.state} |`).join("\n")+"\n\nAceptación global: pendiente de evidencia externa.\n");
console.log(JSON.stringify({code:"S21_CONTROL_MATRIX_RECORDED",localPassed,globalAcceptance:false}));
if(!localPassed)process.exitCode=1;
