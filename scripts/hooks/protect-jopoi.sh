#!/usr/bin/env bash
set -euo pipefail

payload=$(cat)
tool_name=$(printf '%s' "$payload" | jq -r '.toolCall.name // ""')
args_json=$(printf '%s' "$payload" | jq -c '.toolCall.args // {}')
target_path=$(printf '%s' "$payload" | jq -r '.toolCall.args.Path // .toolCall.args.path // ""')
cmd_line=$(printf '%s' "$payload" | jq -r '.toolCall.args.CommandLine // .toolCall.args.command // ""')

# 1. Proteger archivos .env reales (permitiendo .env.example y .env.candidate.example)
if [[ -n "$target_path" ]]; then
  base_name=$(basename "$target_path")
  if [[ "$base_name" =~ ^\.env($|\.) ]] && [[ "$base_name" != ".env.example" ]] && [[ "$base_name" != ".env.candidate.example" ]]; then
    echo '{"decision":"deny","reason":"Acceso bloqueado por hook de Jopói: los archivos .env reales están protegidos. Usá .env.example o .env.candidate.example."}'
    exit 0
  fi
  if [[ "$target_path" =~ (^|/)secrets/ ]]; then
    echo '{"decision":"deny","reason":"Acceso bloqueado por hook de Jopói: la carpeta secrets/ está protegida."}'
    exit 0
  fi
  if [[ "$base_name" == "JOPOI.md" ]]; then
    echo '{"decision":"deny","reason":"Lectura bloqueada por hook de Jopói: JOPOI.md pesa 2.4 MB y satura la ventana de contexto. Consultá docs/alcance-demo.md o docs/contexto-y-evolucion.md."}'
    exit 0
  fi
fi

# 2. Proteger escritura en .git/ y en migraciones ya aplicadas (prisma/migrations/)
if [[ "$tool_name" == "write_file" || "$tool_name" == "edit_file" ]]; then
  if [[ "$target_path" =~ (^|/)\.git/ ]] || [[ "$target_path" =~ (^|/)prisma/migrations/ ]]; then
    echo '{"decision":"deny","reason":"Modificación bloqueada por hook de Jopói: no se permite editar directamente .git/ ni migraciones existentes en prisma/migrations/."}'
    exit 0
  fi
fi

# 3. Evaluar comandos de terminal (run_command)
if [[ "$tool_name" == "run_command" && -n "$cmd_line" ]]; then
  # Bloquear lectura de .env reales por terminal (ignorando .env.example y .env.candidate.example)
  cleaned_cmd=$(printf '%s' "$cmd_line" | sed -E 's/\.env(\.candidate)?\.example//g')
  if printf '%s' "$cleaned_cmd" | grep -Eq '(^|[^[:alnum:]_])\.env(\.[[:alnum:]_-]+)?($|[^[:alnum:]_])|(^|/)secrets/'; then
    echo '{"decision":"deny","reason":"Comando bloqueado por hook de Jopói: no se permite inspeccionar ni modificar archivos .env reales o secrets/ desde la terminal."}'
    exit 0
  fi

  # Bloquear lectura de JOPOI.md por terminal
  if printf '%s' "$cmd_line" | grep -Eq '(^|[^[:alnum:]_])JOPOI\.md($|[^[:alnum:]_])'; then
    echo '{"decision":"deny","reason":"Comando bloqueado por hook de Jopói: JOPOI.md pesa 2.4 MB. Usá la documentación estructurada en docs/."}'
    exit 0
  fi

  # Bloquear comandos destructivos
  if printf '%s' "$cmd_line" | grep -Eq '(^|[[:space:]];|&)(sudo|rm[[:space:]]+-rf)([[:space:]]|$)|git[[:space:]]+(reset[[:space:]]+--hard|push[[:space:]]+(--force|-f))|prisma[[:space:]]+migrate[[:space:]]+reset|DROP[[:space:]]+TABLE|TRUNCATE[[:space:]]+TABLE'; then
    echo '{"decision":"deny","reason":"Comando destructivo bloqueado por hook de Jopói (sudo, rm -rf, git reset --hard, git push --force, prisma migrate reset, DROP/TRUNCATE)."}'
    exit 0
  fi

  # Pedir confirmación forzada (force_ask) para operaciones con efectos externos o migraciones
  if printf '%s' "$cmd_line" | grep -Eq 'git[[:space:]]+push|npm[[:space:]]+run[[:space:]]+(db:migrate|hedera:topic|acceptance:live)|npx[[:space:]]+(vercel|prisma[[:space:]]+migrate)'; then
    echo '{"decision":"force_ask","reason":"Este comando modifica infraestructura, migraciones o recursos externos (Git remoto, Prisma, Hedera testnet o Vercel). Confirmá si querés ejecutarlo."}'
    exit 0
  fi
fi

echo '{"decision":"allow"}'
