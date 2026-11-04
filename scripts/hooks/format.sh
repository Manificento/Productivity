#!/usr/bin/env bash
# PostToolUse hook: format the file Claude just wrote or edited, so diffs stay clean
# and `npm run format:check` never fails in CI.
file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[[ -z "$file" || ! -f "$file" ]] && exit 0
case "$file" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.md|*.css|*.html|*.yml|*.yaml)
    cd "${CLAUDE_PROJECT_DIR:-.}" && npx --no-install prettier --write --log-level=silent "$file" 2>/dev/null || true ;;
esac
exit 0
