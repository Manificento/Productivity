#!/usr/bin/env bash
# Tests for the release signing of the Android app (#285) that need no Android SDK: the gate of the release job
# (release-secrets.sh) and the rules for keys in the repository. Run by .github/workflows/android.yml and locally:
#   android/scripts/tests/signing.test.sh
# The signing itself (Gradle, apksigner) is checked in the same workflow on a throwaway keystore.
set -uo pipefail

SCRIPTS=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(cd "$SCRIPTS/../.." && pwd)
GRADLE="$REPO/android/app/build.gradle"
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
ALL_SECRETS=(ANDROID_KEYSTORE_BASE64=c2VjcmV0LWtleXN0b3Jl ANDROID_KEYSTORE_PASSWORD=pa55-store
  ANDROID_KEY_ALIAS=lifeos-upload ANDROID_KEY_PASSWORD=pa55-key)

# gate <event> [NAME=value…]: runs release-secrets.sh as the workflow does, with only the given secrets set.
# Leaves its output in $WORK/log, the step outputs in $WORK/output and the exit code in $status.
status=0
gate() {
  local event=$1
  shift
  : > "$WORK/output"
  env -u ANDROID_KEYSTORE_BASE64 -u ANDROID_KEYSTORE_PASSWORD -u ANDROID_KEY_ALIAS -u ANDROID_KEY_PASSWORD \
    GITHUB_EVENT_NAME="$event" GITHUB_OUTPUT="$WORK/output" "$@" "$SCRIPTS/release-secrets.sh" > "$WORK/log" 2>&1
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
no_secret_values_in_log() { ! grep -q -E 'c2VjcmV0LWtleXN0b3Jl|pa55-store|pa55-key|lifeos-upload' "$WORK/log"; }

printf '\nGiven секретов подписи нет When PR меняет android/** Then release-задание пропускается с понятным уведомлением, CI зелёный\n'
gate pull_request
check 'PR: шлюз успешен, release-задание пропускается' succeeds_with_ready false
check 'PR: уведомление говорит, где проверена подпись и когда собирается release' \
  log_has '::notice title=Release-сборка пропущена::'
gate pull_request "${ALL_SECRETS[@]}"
check 'PR: даже при заданных секретах release на PR не собирается' succeeds_with_ready false
check 'PR: значения секретов не попадают в журнал' no_secret_values_in_log
gate workflow_dispatch
check 'ручной запуск без секретов: шлюз успешен, release-задание пропускается' succeeds_with_ready false
check 'ручной запуск без секретов: уведомление' log_has '::notice title=Секретов подписи нет::'
check 'ручной запуск без секретов: уведомление называет все четыре секрета' log_names_all_secrets
check 'ручной запуск без секретов: уведомление ведёт в README' log_has 'README'

printf '\nGiven секреты подписи заданы When workflow запущен вручную или по тегу v* Then release собирается; секреты не в журнале\n'
gate workflow_dispatch "${ALL_SECRETS[@]}"
check 'ручной запуск со всеми секретами: release-задание запускается' succeeds_with_ready true
check 'ручной запуск: значения секретов не попадают в журнал' no_secret_values_in_log
gate push "${ALL_SECRETS[@]}"
check 'тег v*: release-задание запускается' succeeds_with_ready true
gate push ANDROID_KEYSTORE_BASE64=c2VjcmV0LWtleXN0b3Jl ANDROID_KEY_ALIAS=lifeos-upload
check 'часть секретов задана: запуск падает, release-задание не запускается' fails_not_ready
check 'часть секретов задана: ошибка называет недостающие секреты' \
  eval 'log_has "::error" && log_has ANDROID_KEYSTORE_PASSWORD && log_has ANDROID_KEY_PASSWORD'
check 'часть секретов задана: заданные секреты не названы недостающими' log_lacks 'ANDROID_KEY_ALIAS'
check 'часть секретов задана: значения не попадают в журнал' no_secret_values_in_log

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
