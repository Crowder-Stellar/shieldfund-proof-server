#!/usr/bin/env bash
# Fails if any tracked text file hides content behind whitespace padding:
#   - a line longer than MAX_LINE chars, or
#   - more than MAX_TRAILING consecutive trailing spaces/tabs.
# This is how the 2026-09-22 payload was pushed off-screen in src/server.js.
set -euo pipefail

MAX_LINE=300
MAX_TRAILING=20

cd "$(git rev-parse --show-toplevel)"

# -I skips binary files; -l lists text files only.
git ls-files -z | xargs -0 grep -IlZ '' -- 2>/dev/null \
  | xargs -0 -r awk -v max_line="$MAX_LINE" -v max_trailing="$MAX_TRAILING" '
      length($0) > max_line {
        printf "%s:%d: line is %d chars (max %d)\n", FILENAME, FNR, length($0), max_line
        bad = 1
      }
      match($0, /[ \t]+$/) && RLENGTH > max_trailing {
        printf "%s:%d: %d trailing whitespace chars (max %d)\n", FILENAME, FNR, RLENGTH, max_trailing
        bad = 1
      }
      END { exit bad }
    ' \
  || { echo "Whitespace-padding guard failed." >&2; exit 1; }

echo "Whitespace-padding guard passed."
