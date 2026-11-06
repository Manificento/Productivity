#!/usr/bin/env bash
# Tests for scripts/agent.sh (`npm run test:scripts`). Each test runs the real script in a throwaway git repo
# with a bare "origin" and a fake `gh` that answers from canned JSON and logs every API call.
set -uo pipefail

AGENT="$(cd "$(dirname "$0")" && pwd)/agent.sh"
TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)/.github/pull_request_template.md"
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export REPO=acme/app
# Plain local git: the developer's global config (proxies, push negotiation) must not leak into the sandbox.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
failures=0

# Fresh sandbox: $SANDBOX/work is a clone on main with one commit, $SANDBOX/gh holds the fake's state.
setup() {
  SANDBOX=$(mktemp -d)
  mkdir -p "$SANDBOX/bin" "$SANDBOX/gh/responses" "$SANDBOX/work/.github"
  : > "$SANDBOX/gh/calls.log"
  cat > "$SANDBOX/bin/gh" <<'FAKE'
#!/usr/bin/env bash
# Fake `gh api [-X METHOD] PATH [-f k=v]... [--jq FILTER]`.
shift
method='' path='' filter='' fields=()
while (($#)); do
  case $1 in
    -X) method=$2; shift 2 ;;
    --jq) filter=$2; shift 2 ;;
    -f | -F) fields+=("$2"); shift 2 ;;
    *) path=$1; shift ;;
  esac
done
# Like the real gh: fields without -X mean POST. One line per call (newlines in a body become ⏎).
[[ -z $method ]] && { ((${#fields[@]})) && method=POST || method=GET; }
line="$method $path ${fields[*]}"
printf '%s\n' "${line//$'\n'/⏎}" >> "$FAKE_GH/calls.log"
file="$FAKE_GH/responses/$(printf '%s %s' "$method" "$path" | tr -c 'A-Za-z0-9' '_').json"
[[ -f $file ]] || exit 0
if [[ -n $filter ]]; then jq -r "$filter" < "$file"; else cat "$file"; fi
FAKE
  chmod +x "$SANDBOX/bin/gh"
  export PATH="$SANDBOX/bin:$PATH" FAKE_GH="$SANDBOX/gh"
  git init -q --bare -b main "$SANDBOX/origin.git"
  cd "$SANDBOX/work" || exit 1
  git init -q -b main
  git remote add origin "$SANDBOX/origin.git"
  cp "$TEMPLATE" .github/pull_request_template.md
  git add -A && git commit -q -m "chore: initial"
  git push -q -u origin main
}

teardown() {
  cd / && rm -rf "$SANDBOX"
}

# respond METHOD PATH JSON — what the fake gh returns for that call.
respond() {
  printf '%s' "$3" > "$FAKE_GH/responses/$(printf '%s %s' "$1" "$2" | tr -c 'A-Za-z0-9' '_').json"
}

commit() {
  echo "$1" >> notes.txt && git add notes.txt && git commit -q -m "$1"
}

calls() { cat "$FAKE_GH/calls.log"; }

check() { # check <description> <condition result: 0 = ok> [details]
  if [[ $2 == 0 ]]; then echo "  ✓ $1"; else echo "  ✗ $1"; echo "    ${3:-}"; failures=$((failures + 1)); fi
}

run_test() {
  echo "$1"
  setup
  "$2"
  teardown
}

test_title_from_first_commit() {
  git switch -q -c feat/7
  commit "feat(tasks): parse Russian relative dates"
  commit "fix(tasks): address review"
  respond GET "repos/acme/app/pulls?state=open&head=acme:feat/7" '[]'
  respond POST repos/acme/app/pulls '{"number":42}'
  local out
  out=$("$AGENT" pr 7 2>&1)
  check "печатает номер PR" "$([[ $out == 42 ]]; echo $?)" "$out"
  check "заголовок из первого коммита" \
    "$(calls | grep -qF 'title=feat(tasks): parse Russian relative dates'; echo $?)" "$(calls)"
}

test_title_from_issue_when_first_commit_is_not_conventional() {
  git switch -q -c feat/7
  commit "WIP quick tasks"
  commit "feat(tasks): finish quick tasks"
  respond GET "repos/acme/app/pulls?state=open&head=acme:feat/7" '[]'
  respond GET repos/acme/app/issues/7 \
    '{"title":"tasks: быстрые задачи","labels":[{"name":"priority:P0"},{"name":"area:tasks"}]}'
  respond POST repos/acme/app/pulls '{"number":43}'
  "$AGENT" pr 7 > /dev/null 2>&1
  check "заголовок feat(<area>): <заголовок issue>" \
    "$(calls | grep -qF 'title=feat(tasks): быстрые задачи'; echo $?)" "$(calls)"
}

test_existing_pr_keeps_title() {
  git switch -q -c feat/7
  commit "feat(tasks): parse Russian relative dates"
  respond GET "repos/acme/app/pulls?state=open&head=acme:feat/7" '[{"number":5}]'
  local out
  out=$("$AGENT" pr 7 2>&1)
  check "печатает номер существующего PR" "$([[ $out == 5 ]]; echo $?)" "$out"
  check "PR не создаётся и не правится" "$(! calls | grep -qE '^(POST|PATCH) '; echo $?)" "$(calls)"
}

test_merge_uses_pr_title() {
  respond GET repos/acme/app/pulls/42 \
    '{"title":"feat(tasks): parse Russian relative dates","body":"Closes #7","head":{"sha":"abc","ref":"feat/7"}}'
  respond GET "repos/acme/app/commits/abc/check-runs?per_page=100" \
    '{"check_runs":[{"name":"Quality gates","status":"completed","conclusion":"success"}]}'
  respond PUT repos/acme/app/pulls/42/merge '{"message":"Pull Request successfully merged"}'
  "$AGENT" merge 42 > /dev/null 2>&1
  check "squash-коммит = заголовок PR (#PR)" \
    "$(calls | grep -qF 'commit_title=feat(tasks): parse Russian relative dates (#42)'; echo $?)" "$(calls)"
}

echo "scripts/agent.sh"
run_test "Given ветка с несколькими коммитами When agent.sh pr Then заголовок PR из первого коммита ветки" \
  test_title_from_first_commit
run_test "Given первый коммит не Conventional When agent.sh pr Then заголовок feat(<area>): <заголовок issue>" \
  test_title_from_issue_when_first_commit_is_not_conventional
run_test "Given PR уже существует When agent.sh pr повторно Then заголовок не меняется" \
  test_existing_pr_keeps_title
run_test "Given agent.sh merge When идёт squash Then заголовок коммита = заголовок PR (#PR)" \
  test_merge_uses_pr_title

if ((failures)); then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
