import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";

const project = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const fixtureName = "jopoi-audit-fixture";

/**
 * Probá el comando real contra un registro local: no dependemos de que npm tenga
 * justo hoy un aviso activo para demostrar que el gate rechaza un problema.
 * @param {import("node:test").TestContext} context
 * @param {"moderate" | "high" | "critical" | "unavailable"} severity
 */
async function auditFixture(context, severity) {
  const directory = await mkdtemp(join(tmpdir(), "jopoi-s22-audit-"));
  context.after(async () => {
    const target = resolve(directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("jopoi-s22-audit-")) {
      throw new Error("AUDIT_FIXTURE_CLEANUP_NOT_OWNED");
    }
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  const server = createServer((request, response) => {
    request.resume();
    response.setHeader("Content-Type", "application/json");
    if (severity === "unavailable") {
      response.writeHead(503).end(JSON.stringify({ error: "synthetic registry unavailable" }));
    } else if (request.url?.endsWith("/security/advisories/bulk")) {
      response.end(JSON.stringify({ [fixtureName]: [{
        id: 1234567, name: fixtureName, severity,
        title: "Aviso sintético de S22", url: "https://example.invalid/s22-advisory",
        vulnerable_versions: "<2.0.0", cwe: ["CWE-400"], cvss: { score: 7.5, vectorString: null },
      }] }));
    } else if (request.url === `/${fixtureName}`) {
      response.end(JSON.stringify({
        name: fixtureName, "dist-tags": { latest: "2.0.0" },
        versions: {
          "1.0.0": { name: fixtureName, version: "1.0.0" },
          "2.0.0": { name: fixtureName, version: "2.0.0" },
        },
      }));
    } else {
      response.writeHead(404).end(JSON.stringify({ error: "synthetic resource not found" }));
    }
  });
  context.after(() => new Promise((resolveClose, reject) => {
    server.close(error => error ? reject(error) : resolveClose());
    server.closeAllConnections();
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address !== null && typeof address !== "string");
  const registry = `http://127.0.0.1:${address.port}`;
  const fixture = {
    name: "jopoi-security-gate-fixture", version: "1.0.0", private: true,
    scripts: { "security:audit": project.scripts["security:audit"] },
    dependencies: { [fixtureName]: "1.0.0" },
  };
  await writeFile(join(directory, "package.json"), JSON.stringify(fixture));
  await writeFile(join(directory, "package-lock.json"), JSON.stringify({
    name: fixture.name, version: fixture.version, lockfileVersion: 3, requires: true,
    packages: {
      "": { name: fixture.name, version: fixture.version, dependencies: fixture.dependencies },
      [`node_modules/${fixtureName}`]: { version: "1.0.0", resolved: `${registry}/${fixtureName}/-/fixture.tgz` },
    },
  }));
  // Sellá la configuración: el registro de prueba nunca necesita credenciales locales.
  const userConfig = join(directory, "user.npmrc"), globalConfig = join(directory, "global.npmrc");
  await writeFile(userConfig, "");
  await writeFile(globalConfig, "");
  const npmCli = process.env.npm_execpath;
  assert.equal(typeof npmCli, "string", "Usá npm run test:security para comprobar el mismo npm del gate.");
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(path|systemroot|windir|comspec|temp|tmp|home|userprofile)$/i.test(key)));
  const child = spawn(process.execPath, [npmCli, "run", "security:audit", "--",
    `--registry=${registry}`, `--cache=${join(directory, "cache")}`,
    `--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`,
    "--fetch-retries=0", "--fetch-timeout=2000", "--no-fund",
  ], { cwd: directory, env: environment, windowsHide: true, signal: AbortSignal.timeout(15000), stdio: "ignore" });
  const [code] = await once(child, "close");
  return code;
}

for (const severity of ["moderate", "high", "critical"]) {
  test(`S22-31: el comando de auditoría trata correctamente un aviso ${severity}`, { timeout: 20000 }, async context => {
    const code = await auditFixture(context, severity);
    assert.equal(code, severity === "moderate" ? 0 : 1);
  });
}

test("S22-31: un registro indisponible no se interpreta como cero vulnerabilidades", { timeout: 20000 }, async context => {
  assert.notEqual(await auditFixture(context, "unavailable"), 0);
});
