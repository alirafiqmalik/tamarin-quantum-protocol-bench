#!/bin/sh
# Start the bench. Builds the front end when the built page is missing or stale.
set -e
cd "$(dirname "$0")"
if [ -d web ] && [ ! -f static/index.html -o web/src -nt static/index.html ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "building the front end"
    (cd web && npm install --no-audit --no-fund >/dev/null && npm run build)
    python3 -m bench.archive
  else
    echo "npm is not available; serving the existing static/ directory"
  fi
fi
exec python3 app.py "$@"
