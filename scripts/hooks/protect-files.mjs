#!/usr/bin/env node

/**
 * Hook PreToolUse para Antigravity CLI.
 * Recibe el evento JSON por stdin y bloquea acciones sobre secretos o comandos destructivos.
 */

import { readFileSync } from "node:fs";

function evaluatePreToolUse(input) {
  if (!input || typeof input !== "object") {
    return { decision: "allow" };
  }

  const toolName = String(input.toolCall?.name ?? "");
  const toolArgs = input.toolCall?.args ?? {};
  const serializedArgs = JSON.stringify(toolArgs).toLowerCase();

  // 1. Detección de archivos sensibles (.env excepto .env.example, secretos)
  const isEnvExample = serializedArgs.includes(".env.example") || serializedArgs.includes(".env.candidate.example");
  const touchesSensitiveEnv =
    (serializedArgs.includes(".env") || serializedArgs.includes("secrets/")) && !isEnvExample;

  if (touchesSensitiveEnv) {
    return {
      decision: "deny",
      reason: "Acción bloqueada: Acceso a archivos con posibles credenciales o secretos (.env / secrets). Pedile confirmación explícita al usuario.",
    };
  }

  // 2. Detección de comandos destructivos en terminal
  const isDestructiveCommand =
    serializedArgs.includes("rm -rf") ||
    serializedArgs.includes("rmdir /s /q") ||
    serializedArgs.includes("git push --force") ||
    serializedArgs.includes("git reset --hard") ||
    serializedArgs.includes("prisma migrate reset") ||
    serializedArgs.includes("prisma db push") ||
    serializedArgs.includes("drop database") ||
    serializedArgs.includes("drop table");

  if (isDestructiveCommand) {
    return {
      decision: "deny",
      reason: "Comando destructivo bloqueado por política del repositorio. No ejecutes sin confirmación previa y explícita del usuario.",
    };
  }

  // 3. Modificación directa en árbol interno de Git
  if (serializedArgs.includes(".git/") || serializedArgs.includes(".git\\")) {
    return {
      decision: "deny",
      reason: "Modificación directa de la carpeta interna .git bloqueada. Utilizá los comandos convencionales de git.",
    };
  }

  return { decision: "allow" };
}

try {
  const stdinBuffer = readFileSync(0, "utf-8").trim();
  if (!stdinBuffer) {
    console.log(JSON.stringify({ decision: "allow" }));
    process.exit(0);
  }

  const parsed = JSON.parse(stdinBuffer);
  const result = evaluatePreToolUse(parsed);
  console.log(JSON.stringify(result));
} catch (error) {
  // Ante error de parseo, permitimos la ejecución para no derribar la sesión de agy
  console.log(JSON.stringify({ decision: "allow" }));
}
