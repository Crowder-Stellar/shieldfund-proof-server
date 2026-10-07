#!/usr/bin/env bash
# Fails if src/ or test/ contains patterns typical of obfuscated JS loaders,
# like the one hidden in src/server.js on 2026-09-22.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PATTERNS=(
  'global(This)?[[:space:]]*\[[^]]*\][[:space:]]*=[[:space:]]*require'  # global[...] = require
  '_\$_[0-9a-fA-F]{4}'                                                  # _$_1a2b identifiers
  'Function[[:space:]]*\([[:space:]]*["'\''`]return this["'\''`][[:space:]]*\)'  # Function("return this")
  '(^|[^[:alnum:]_$])eval[[:space:]]*\('                               # eval(
)

args=()
for p in "${PATTERNS[@]}"; do args+=(-e "$p"); done

# Scan tracked files only, so local scratch files don't break the check.
if git ls-files -z -- src test | xargs -0 -r grep -nIE "${args[@]}" --; then
  echo "Obfuscation scanner failed: suspicious pattern(s) found above." >&2
  exit 1
fi

echo "Obfuscation scanner passed."
