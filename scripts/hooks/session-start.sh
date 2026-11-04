#!/usr/bin/env bash
# SessionStart hook: install npm dependencies when they are missing or the lockfile changed.
# Runs in local and cloud sessions; skips work that is already done so startup stays fast.
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
stamp=node_modules/.install.sha256
if ! sha256sum --check --status "$stamp" 2>/dev/null; then
  rm -f "$stamp"
  if npm ci --no-audit --no-fund >/dev/null 2>&1; then
    sha256sum package.json package-lock.json > "$stamp" || true
    echo "dependencies installed"
  else
    echo "npm ci failed — run it manually to see the error" >&2
  fi
fi
exit 0
