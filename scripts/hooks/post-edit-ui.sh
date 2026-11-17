#!/usr/bin/env bash
set -euo pipefail

payload=$(cat)
target_path=$(printf '%s' "$payload" | jq -r '.toolCall.args.Path // .toolCall.args.path // ""')
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "$target_path" =~ \.(tsx|css)$ ]]; then
  if [[ -f "$repo_root/.agents/skills/impeccable/scripts/impeccable" ]]; then
    (cd "$repo_root" && ".agents/skills/impeccable/scripts/impeccable" hook >/dev/null 2>&1) || true
  fi
fi

echo '{}'
