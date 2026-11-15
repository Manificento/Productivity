#!/usr/bin/env bash
# Tests for scripts/check-actions-pinned.sh (`npm run test:scripts`). Each test writes workflows into a throwaway
# directory and runs the real script against it; the last two run it against this repository.
set -uo pipefail

SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
CHECK="$SCRIPTS/check-actions-pinned.sh"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
SHA=11d5960a326750d5838078e36cf38b85af677262
failures=0

setup() {
  SANDBOX=$(mktemp -d)
  mkdir -p "$SANDBOX/.github/workflows"
  printf 'version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n' > "$SANDBOX/.github/dependabot.yml"
}

teardown() {
  rm -rf "$SANDBOX"
}

# workflow <file> <steps…> — a workflow with one job whose steps are the given lines; the first step is line 7.
workflow() {
  local file=$1
  shift
  {
    printf 'name: Test\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n'
    printf '%s\n' "$@"
  } > "$SANDBOX/.github/workflows/$file"
}

# run_check [root] — runs the script outside GitHub Actions; sets $status and $output.
run_check() {
  output=$(env -u GITHUB_ACTIONS "$CHECK" "${1:-$SANDBOX}" 2>&1)
  status=$?
}

# Condition results for check: 0 = ok.
passed() { if [[ $status == 0 ]]; then echo 0; else echo 1; fi; }
failed() { if [[ $status != 0 ]]; then echo 0; else echo 1; fi; }
says() { if grep -qF -- "$1" <<< "$output"; then echo 0; else echo 1; fi; }
silent_on() { if grep -qF -- "$1" <<< "$output"; then echo 1; else echo 0; fi; }
fails_naming() { if [[ $status != 0 ]] && grep -qF -- "$1" <<< "$output"; then echo 0; else echo 1; fi; }

check() { # check <description> <condition result: 0 = ok> [details]
  if [[ $2 == 0 ]]; then echo "  ✓ $1"; else echo "  ✗ $1"; echo "    ${3:-}"; failures=$((failures + 1)); fi
}

run_test() {
  echo "$1"
  setup
  "$2"
  teardown
}

test_pinned_actions_pass() {
  workflow ci.yml \
    "      - uses: actions/checkout@$SHA # v4.4.0" \
    "        with:" \
    "          persist-credentials: false" \
    "      - name: Gradle" \
    "        uses: gradle/actions/wrapper-validation@$SHA # v4.4.3" \
    "      - uses: ./.github/actions/local" \
    "      - uses: docker://alpine@sha256:$(printf 'a%.0s' {1..64})" \
    "      # - uses: actions/checkout@v4 (a comment is not a step)" \
    "      - run: echo 'uses: actions/checkout@v4'"
  run_check
  check "код выхода 0" "$(passed)" "$output"
}

test_tag_fails_with_file_and_line() {
  workflow ci.yml \
    "      - uses: actions/checkout@$SHA # v4.4.0" \
    "      - uses: actions/setup-node@v4"
  workflow android.yml \
    "      - name: Java" \
    "        uses: 'actions/setup-java@v4.9.1' # v4.9.1"
  run_check
  check "код выхода ≠ 0" "$(failed)" "$output"
  check "назван файл и строка тега" "$(says '.github/workflows/ci.yml:8: actions/setup-node@v4')" "$output"
  check "назван второй файл: проверяются все workflow" \
    "$(says '.github/workflows/android.yml:8: actions/setup-java@v4.9.1')" "$output"
  check "закреплённое действие не названо" "$(silent_on 'ci.yml:7')" "$output"
}

test_branch_fails() {
  workflow ci.yml "      - uses: actions/checkout@main"
  run_check
  check "код выхода ≠ 0, назван файл и строка" \
    "$(fails_naming '.github/workflows/ci.yml:7: actions/checkout@main')" "$output"
}

test_short_sha_and_missing_ref_fail() {
  workflow ci.yml \
    "      - uses: actions/checkout@11d5960 # v4.4.0" \
    "      - uses: actions/setup-node"
  run_check
  check "код выхода ≠ 0" "$(failed)" "$output"
  check "короткий SHA назван" "$(says 'ci.yml:7: actions/checkout@11d5960')" "$output"
  check "действие без ссылки названо" "$(says 'ci.yml:8: actions/setup-node')" "$output"
}

test_sha_without_version_comment_fails() {
  workflow ci.yml "      - uses: actions/checkout@$SHA"
  run_check
  check "код выхода ≠ 0, назван файл и строка" \
    "$(fails_naming ".github/workflows/ci.yml:7: actions/checkout@$SHA")" "$output"
  check "сказано, что нет комментария версии" "$(says 'комментария версии')" "$output"
}

test_reusable_workflow_by_tag_fails() {
  printf 'name: Test\non: push\njobs:\n  call:\n    uses: acme/shared/.github/workflows/build.yml@v1\n' \
    > "$SANDBOX/.github/workflows/call.yaml"
  run_check
  check "код выхода ≠ 0, назван файл и строка" \
    "$(fails_naming '.github/workflows/call.yaml:5: acme/shared/.github/workflows/build.yml@v1')" "$output"
}

test_docker_image_by_tag_fails() {
  workflow ci.yml "      - uses: docker://alpine:3.20"
  run_check
  check "код выхода ≠ 0, назван файл и строка" \
    "$(fails_naming '.github/workflows/ci.yml:7: docker://alpine:3.20')" "$output"
}

test_composite_action_is_checked() {
  mkdir -p "$SANDBOX/.github/actions/setup"
  printf 'name: Setup\nruns:\n  using: composite\n  steps:\n    - uses: actions/setup-node@v4\n' \
    > "$SANDBOX/.github/actions/setup/action.yml"
  run_check
  check "код выхода ≠ 0, назван файл и строка" \
    "$(fails_naming '.github/actions/setup/action.yml:5: actions/setup-node@v4')" "$output"
}

test_annotation_in_github_actions() {
  workflow ci.yml "      - uses: actions/setup-node@v4"
  output=$(GITHUB_ACTIONS=true "$CHECK" "$SANDBOX" 2>&1)
  check "аннотация ::error с файлом и строкой" "$(says '::error file=.github/workflows/ci.yml,line=7::')" "$output"
}

test_dependabot_without_github_actions_fails() {
  workflow ci.yml "      - uses: actions/checkout@$SHA # v4.4.0"
  printf 'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n' > "$SANDBOX/.github/dependabot.yml"
  run_check
  check "код выхода ≠ 0, назван .github/dependabot.yml" "$(fails_naming '.github/dependabot.yml')" "$output"
}

test_repository_workflows_are_pinned() {
  run_check "$ROOT"
  check "код выхода 0" "$(passed)" "$output"
}

test_repository_dependabot_updates_actions() {
  run_check "$ROOT"
  check "dependabot.yml не назван" "$(silent_on 'dependabot.yml')" "$output"
}

echo "scripts/check-actions-pinned.sh"
run_test "Given действия закреплены полным SHA с комментарием версии When проверка Then она проходит" \
  test_pinned_actions_pass
run_test "Given PR добавляет действие по тегу When идёт CI Then проверка падает и называет файл и строку" \
  test_tag_fails_with_file_and_line
run_test "Given PR добавляет действие по ветке When идёт CI Then проверка падает и называет файл и строку" \
  test_branch_fails
run_test "Given короткий SHA или ссылки нет When проверка Then она падает и называет файл и строку" \
  test_short_sha_and_missing_ref_fail
run_test "Given полный SHA без комментария версии When проверка Then она падает и называет файл и строку" \
  test_sha_without_version_comment_fails
run_test "Given переиспользуемый workflow по тегу When проверка Then она падает и называет файл и строку" \
  test_reusable_workflow_by_tag_fails
run_test "Given образ docker:// по тегу When проверка Then она падает и называет файл и строку" \
  test_docker_image_by_tag_fails
run_test "Given составное действие в .github/actions When в нём действие по тегу Then проверка падает" \
  test_composite_action_is_checked
run_test "Given запуск в GitHub Actions When действие по тегу Then аннотация ошибки на файле и строке" \
  test_annotation_in_github_actions
run_test "Given Dependabot без экосистемы github-actions When проверка Then она падает" \
  test_dependabot_without_github_actions_fails
echo "Given любой workflow в .github/workflows/ When читаю строки uses: Then каждое действие закреплено полным SHA"
test_repository_workflows_are_pinned
echo "Given Dependabot When выходит новая версия действия Then экосистема github-actions включена"
test_repository_dependabot_updates_actions

if ((failures)); then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
