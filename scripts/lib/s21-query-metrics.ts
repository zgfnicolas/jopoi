import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import type { TestResources } from "../../tests/support/runtime-provision";
import type { TestRuntime } from "../../tests/support/runtime";
import { ownedResources } from "../../tests/support/owned-resources";
import { z } from "zod";
import { diagnosticRow } from "./s21-measurements";

/** Separate diagnostic pass: never changes the environment of the timing comparison.
 * pg_stat_statements is installed only in the disposable owned cluster, never a provider. */
export async function queryMetrics(resources:TestResources,runtime:TestRuntime,paths:readonly (readonly [string,string])[],cookie:string){
  await ownedResources(resources);
  await runtime.close();
  await runtime.database("stop");
  await appendFile(resolve(resources.directory,"data/postgresql.conf"),"\nshared_preload_libraries = 'pg_stat_statements'\n");
  await runtime.database("start");
  const db=new Client({connectionString:resources.databaseUrl});await db.connect();
  try{
    await db.query("CREATE EXTENSION pg_stat_statements");await runtime.start();
    const observations=[];
    for(const [route,path]of paths)for(const concurrency of [1,8]){
      await fetch(runtime.origin+path,{headers:{Cookie:cookie,"X-S21-Visitor":"metrics-warmup"}}).then(r=>r.arrayBuffer());
      await db.query("SELECT pg_stat_statements_reset()");
      let cursor=0,errors=0,maxConnections=0;const waits:Record<string,number>={};
      await Promise.all(Array.from({length:concurrency},async()=>{
        while(cursor<20){const index=cursor++;
          const response=await fetch(runtime.origin+path,{headers:{Cookie:cookie,"X-S21-Visitor":`metrics-${index}`}});await response.arrayBuffer();
          if(response.status!==200)errors++;
          const rows=z.array(z.object({wait_event_type:z.string().nullable(),count:z.number().int().nonnegative()})).parse((await db.query(`SELECT wait_event_type,count(*)::int AS count FROM pg_stat_activity WHERE usename='s21_app' GROUP BY wait_event_type`)).rows);
          maxConnections=Math.max(maxConnections,rows.reduce((n,r)=>n+r.count,0));
          for(const row of rows)waits[row.wait_event_type??"ACTIVE"]=(waits[row.wait_event_type??"ACTIVE"]??0)+row.count;
        }
      }));
      const totals=diagnosticRow((await db.query(`SELECT coalesce(sum(calls),0)::int AS queries,coalesce(sum(total_exec_time),0)::float8 AS database_ms,
        coalesce(sum(shared_blks_hit),0)::float8 AS blocks_hit,coalesce(sum(shared_blks_read),0)::float8 AS blocks_read
        FROM pg_stat_statements WHERE userid=(SELECT oid FROM pg_roles WHERE rolname='s21_app')`)).rows,z.object({queries:z.number().int().nonnegative(),database_ms:z.number().finite().nonnegative(),blocks_hit:z.number().finite().nonnegative(),blocks_read:z.number().finite().nonnegative()}));
      observations.push({route,concurrency,requests:20,errors,...totals,queriesPerRequest:totals.queries/20,maxConnections,waitSamples:waits});
    }
    await writeFile(resolve(".cache/s21/query-metrics.json"),JSON.stringify({environment:"SEPARATE_OWNED_DIAGNOSTIC_PASS",observations},null,2));
    if(observations.some(o=>o.errors>0 || o.maxConnections>2))throw new Error("S21_QUERY_METRICS_FAILED");
  }finally{await runtime.close();await db.end();}
}
