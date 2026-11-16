#!/usr/bin/env bash
# Quality gate of the Chrome extension in one step: gets npm (corepack fallback), installs the
# dev dependencies of extractor/ when they are missing or stale, runs its `npm test`, and then
# the tests of the agent hooks and skills at the repository root.
# Origin: template «Extensión de Chrome» (takeoutDownloader).
# Run it directly (no `bash` prefix) so agents can auto-approve it.
# Usage: .claude/skills/extension-test-and-pr/scripts/check.sh
set -euo pipefail

EXTENSION_DIR=extractor

cd "$(dirname "$0")/../../../.."
root="$PWD"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

npm_cmd=()
if command -v npm >/dev/null 2>&1; then
  npm_cmd=(npm)
else
  node_bin="$(command -v node || true)"
  [[ -n "$node_bin" ]] || { echo "Error: node no está instalado." >&2; exit 2; }
  for corepack in /usr/share/nodejs/corepack/dist/corepack.js \
                  "$(dirname "$node_bin")/../lib/node_modules/corepack/dist/corepack.js"; do
    if [[ -f "$corepack" ]]; then
      npm_cmd=(node "$corepack" npm@10.9.2)
      break
    fi
  done
fi
if [[ ${#npm_cmd[@]} -eq 0 ]]; then
  echo "Error: npm no está en el PATH y no se encontró corepack." >&2
  exit 2
fi

echo "==> npm: ${npm_cmd[*]}"
cd "$root/$EXTENSION_DIR"
if [[ ! -d node_modules/jsdom || package-lock.json -nt node_modules/.package-lock.json ]]; then
  echo "==> Instalando dependencias de desarrollo de $EXTENSION_DIR (npm ci --ignore-scripts)..."
  "${npm_cmd[@]}" ci --ignore-scripts
fi

echo "==> npm test ($EXTENSION_DIR)"
"${npm_cmd[@]}" test

echo "==> hooks y skills de agentes"
cd "$root"
node --test ".agents/**/*.test.cjs" ".claude/skills/**/*.test.cjs"
