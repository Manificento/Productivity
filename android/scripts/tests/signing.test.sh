#!/usr/bin/env bash
# Tests for the release signing of the Android app (#285) that need no Android SDK: the gate of the release job
# (release-secrets.sh), the versionName rule (release-version.sh), the release job of the workflow and the rules for
# keys in the repository. Run by .github/workflows/android.yml and locally:
#   android/scripts/tests/signing.test.sh
# The signing itself (Gradle, apksigner) is checked in the same workflow on a throwaway keystore.
set -uo pipefail

SCRIPTS=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(cd "$SCRIPTS/../.." && pwd)
GRADLE="$REPO/android/app/build.gradle"
WORKFLOW="$REPO/.github/workflows/android.yml"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
failures=0

pass() { printf '  ✓ %s\n' "$1"; }
fail() {
  printf '  ✗ %s\n' "$1"
  failures=$((failures + 1))
}
# check "<name>" <command…>: runs the command, reports the name as passed or failed.
check() {
  local name=$1
  shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}

SECRET_NAMES=(ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD)
# The gate gets only presence flags (`secrets.X != ''`), never the values.
ALL_SECRETS=(HAS_ANDROID_KEYSTORE_BASE64=true HAS_ANDROID_KEYSTORE_PASSWORD=true HAS_ANDROID_KEY_ALIAS=true
  HAS_ANDROID_KEY_PASSWORD=true)
NO_SECRETS=(HAS_ANDROID_KEYSTORE_BASE64=false HAS_ANDROID_KEYSTORE_PASSWORD=false HAS_ANDROID_KEY_ALIAS=false
  HAS_ANDROID_KEY_PASSWORD=false)

# A throwaway repository as actions/checkout leaves it with fetch-depth 0: origin/main with a commit of main, and a
# commit that main never got (an unreviewed branch).
git_q() { git -C "$WORK/repo" -c user.name=test -c user.email=test@example.com "$@" > /dev/null 2>&1; }
git init -q "$WORK/repo"
git_q commit --allow-empty -m main
MAIN_SHA=$(git -C "$WORK/repo" rev-parse HEAD)
git_q update-ref refs/remotes/origin/main "$MAIN_SHA"
git_q commit --allow-empty -m unreviewed
BRANCH_SHA=$(git -C "$WORK/repo" rev-parse HEAD)

# gate <event> <ref> <sha> [NAME=value…]: runs release-secrets.sh as the workflow does (inside the checkout), with
# only the given flags set. Leaves its output in $WORK/log, the step outputs in $WORK/output, the exit code in $status.
status=0
gate() {
  local event=$1 ref=$2 sha=$3 ref_type=branch
  shift 3
  [[ $ref == refs/tags/* ]] && ref_type=tag
  : > "$WORK/output"
  (cd "$WORK/repo" && env -u HAS_ANDROID_KEYSTORE_BASE64 -u HAS_ANDROID_KEYSTORE_PASSWORD -u HAS_ANDROID_KEY_ALIAS \
    -u HAS_ANDROID_KEY_PASSWORD GITHUB_EVENT_NAME="$event" GITHUB_REF="$ref" GITHUB_REF_TYPE="$ref_type" \
    GITHUB_REF_NAME="${ref#refs/*/}" GITHUB_SHA="$sha" GITHUB_OUTPUT="$WORK/output" "$@" \
    "$SCRIPTS/release-secrets.sh") > "$WORK/log" 2>&1
  status=$?
}
succeeds_with_ready() { [ "$status" -eq 0 ] && grep -qx "ready=$1" "$WORK/output"; }
fails_not_ready() { [ "$status" -ne 0 ] && ! grep -qx ready=true "$WORK/output"; }
log_has() { grep -q -- "$1" "$WORK/log"; }
log_lacks() { ! grep -q -- "$1" "$WORK/log"; }
log_names_all_secrets() {
  local name
  for name in "${SECRET_NAMES[@]}"; do log_has "$name" || return 1; done
}

# The job `release` of the workflow, up to the next job or the end of the file.
release_job() { awk '/^  release:/ { on = 1; print; next } on && /^  [a-z][a-z-]*:/ { exit } on' "$WORKFLOW"; }
release_job_in_environment() { release_job | grep -qx '    environment: android-release'; }
# Every action of the release job runs on the runner that holds the key: each one is pinned to a commit.
release_actions_pinned() {
  local uses
  uses=$(release_job | grep -E '^\s*(- )?uses:')
  [ -n "$uses" ] && ! grep -v -E 'uses: [^@ ]+@[0-9a-f]{40} # v[0-9.]+$' <<< "$uses" | grep -q .
}
# Values of the signing secrets: only the keystore step and the build step of the release job (four references); any
# other mention is a presence flag `secrets.X != ''`.
secret_values() { grep -E 'secrets\.ANDROID_' | grep -v -E "^ +HAS_ANDROID_[A-Z0-9_]+: \\$\{\{ secrets\.ANDROID_[A-Z0-9_]+ != '' \}\}$"; }
secret_values_only_in_release_steps() {
  local all in_release
  all=$(secret_values < "$WORKFLOW" | wc -l)
  in_release=$(release_job | secret_values | wc -l)
  [ "$all" -eq 4 ] && [ "$in_release" -eq 4 ]
}

printf '\nGiven секретов подписи нет When PR меняет android/** Then release-задание пропускается с понятным уведомлением, CI зелёный\n'
gate pull_request refs/pull/1/merge "$BRANCH_SHA"
check 'PR: шлюз успешен, release-задание пропускается' succeeds_with_ready false
check 'PR: уведомление говорит, где проверена подпись и когда собирается release' \
  log_has '::notice title=Release-сборка пропущена::'
gate pull_request refs/pull/1/merge "$BRANCH_SHA" "${ALL_SECRETS[@]}"
check 'PR: даже при заданных секретах release на PR не собирается' succeeds_with_ready false
gate workflow_dispatch refs/heads/main "$MAIN_SHA" "${NO_SECRETS[@]}"
check 'ручной запуск без секретов: шлюз успешен, release-задание пропускается' succeeds_with_ready false
check 'ручной запуск без секретов: уведомление' log_has '::notice title=Секретов подписи нет::'
check 'ручной запуск без секретов: уведомление называет все четыре секрета' log_names_all_secrets
check 'ручной запуск без секретов: уведомление ведёт в README и называет окружение android-release' \
  eval 'log_has README && log_has android-release'
gate workflow_dispatch refs/heads/main "$MAIN_SHA"
check 'ручной запуск без флагов наличия: секретов нет, release-задание пропускается' succeeds_with_ready false

printf '\nGiven секреты подписи заданы When workflow запущен вручную или по тегу v* Then release собирается\n'
gate workflow_dispatch refs/heads/main "$MAIN_SHA" "${ALL_SECRETS[@]}"
check 'ручной запуск из main со всеми секретами: release-задание собирает' succeeds_with_ready true
gate push refs/tags/v1.2.3 "$MAIN_SHA" "${ALL_SECRETS[@]}"
check 'тег v* на коммите из истории main: release-задание собирает' succeeds_with_ready true
gate workflow_dispatch refs/tags/v1.2.3 "$MAIN_SHA" "${ALL_SECRETS[@]}"
check 'ручной запуск на теге v* из истории main: release-задание собирает' succeeds_with_ready true
gate push refs/tags/v1.2.3 "$MAIN_SHA" HAS_ANDROID_KEYSTORE_BASE64=true HAS_ANDROID_KEY_ALIAS=true \
  HAS_ANDROID_KEYSTORE_PASSWORD=false
check 'часть секретов задана: запуск падает, release-задание не собирает' fails_not_ready
check 'часть секретов задана: ошибка называет недостающие секреты' \
  eval 'log_has "::error" && log_has ANDROID_KEYSTORE_PASSWORD && log_has ANDROID_KEY_PASSWORD'
check 'часть секретов задана: заданные секреты не названы недостающими' log_lacks 'ANDROID_KEY_ALIAS'

printf '\nGiven ключ загрузки When запуск не из main и не тегом v* из истории main Then release не собирается, запуск падает\n'
gate workflow_dispatch refs/heads/feat/999 "$BRANCH_SHA" "${ALL_SECRETS[@]}"
check 'ручной запуск из другой ветки: запуск падает, release не собирается' fails_not_ready
check 'ручной запуск из другой ветки: ошибка называет ветку' eval 'log_has "::error" && log_has refs/heads/feat/999'
gate push refs/tags/v9.9.9 "$BRANCH_SHA" "${ALL_SECRETS[@]}"
check 'тег v* на коммите не из истории main: запуск падает, release не собирается' fails_not_ready
check 'тег v* не из истории main: ошибка так и говорит' eval 'log_has "::error" && log_has "не из истории main"'
gate push refs/tags/release-1 "$MAIN_SHA" "${ALL_SECRETS[@]}"
check 'тег не v*: запуск падает, release не собирается' fails_not_ready
gate workflow_dispatch refs/heads/feat/999 "$BRANCH_SHA" "${NO_SECRETS[@]}"
check 'другая ветка без секретов: тоже ошибка, а не тихий пропуск' fails_not_ready
check 'release-задание в окружении android-release (секреты окружения, правило: ветка main и теги v*)' \
  release_job_in_environment
check 'все действия release-задания закреплены на коммите (SHA и версия в комментарии)' release_actions_pinned
check 'значения секретов получают только два шага release-задания, шлюз — только флаги наличия' \
  secret_values_only_in_release_steps

printf '\nGiven тег v* или ручной запуск When считаю versionName Then тег без «v», иначе package.json; явный LIFEOS_VERSION_NAME главнее\n'
PACKAGE_VERSION=$(node -p "require('$REPO/package.json').version")
version_is() {
  local expected=$1
  shift
  [ "$(env -u LIFEOS_VERSION_NAME -u GITHUB_REF_TYPE -u GITHUB_REF_NAME "$@" "$SCRIPTS/release-version.sh")" = "$expected" ]
}
check 'тег v1.2.3: versionName 1.2.3' version_is 1.2.3 GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v1.2.3
check 'ручной запуск из main: versionName из package.json' \
  version_is "$PACKAGE_VERSION" GITHUB_REF_TYPE=branch GITHUB_REF_NAME=main
check 'тег не v*: versionName из package.json' version_is "$PACKAGE_VERSION" GITHUB_REF_TYPE=tag GITHUB_REF_NAME=release-1
check 'вне CI: versionName из package.json' version_is "$PACKAGE_VERSION"
check 'явный LIFEOS_VERSION_NAME главнее тега' \
  version_is 2.0.0-rc LIFEOS_VERSION_NAME=2.0.0-rc GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v1.2.3

printf '\nGiven android/app/build.gradle When читаю Then signingConfigs.release — только из среды или свойств Gradle; файлов с секретами нет; .gitignore закрывает *.jks и *.keystore\n'
# The block `signingConfigs { … }` of the android { } section (four spaces of indentation in build.gradle).
signing_block() { awk '/^    signingConfigs \{/,/^    \}/' "$GRADLE"; }
signing_fields() { signing_block | grep -E '^\s*(storeFile|storePassword|keyAlias|keyPassword)\b'; }
declares_release() { signing_block | grep -q '^        release {'; }
reads_only_env_or_properties() {
  local name
  grep -q 'providers.environmentVariable(name).orElse(providers.gradleProperty(name))' "$GRADLE" || return 1
  for name in ANDROID_KEYSTORE_FILE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
    grep -q "'$name'" "$GRADLE" || return 1
  done
}
four_fields_without_literals() {
  [ "$(signing_fields | wc -l)" -eq 4 ] && ! signing_fields | grep -q "[\"']"
}
no_tracked_keystores() { [ -z "$(git -C "$REPO" ls-files -- '*.jks' '*.keystore' '*.p12')" ]; }
no_tracked_signing_properties() {
  ! git -C "$REPO" grep -q -E '^\s*(ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_PASSWORD|ANDROID_KEYSTORE_BASE64)\s*[=:]' \
    -- '*.properties'
}
check 'build.gradle объявляет signingConfigs.release' declares_release
check 'значения подписи берутся только из переменных среды или свойств Gradle' reads_only_env_or_properties
check 'в signingConfigs.release четыре поля и ни одного строкового значения' four_fields_without_literals
check 'в репозитории нет keystore-файлов (*.jks, *.keystore, *.p12)' no_tracked_keystores
check 'файлы свойств в репозитории не задают паролей подписи' no_tracked_signing_properties
for path in release.jks upload.keystore android/app/release.jks android/upload-keystore.keystore; do
  check ".gitignore закрывает $path" git -C "$REPO" check-ignore -q --no-index "$path"
done

printf '\n'
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo 'all checks passed'
