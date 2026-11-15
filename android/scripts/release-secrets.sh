#!/usr/bin/env bash
# Gate of the signed release of the «Android» workflow (#285). Writes ready=true|false to $GITHUB_OUTPUT.
# - pull_request: never ready. A PR checks the signing path on a throwaway keystore; the app key never meets PR code.
# - otherwise only branch main, or a tag v* on a commit from the history of origin/main (run inside a checkout with
#   fetch-depth 0). Any other ref — an error, nothing is built. This guards against honest mistakes only: on a tag
#   GitHub runs this script from the tagged commit, so whoever pushes the tag can edit it. The lock against unreviewed
#   code is the GitHub settings (README step 2): required reviewers on the environment android-release, its deployment
#   rule, and a tag ruleset that lets only the owner create or move v* tags.
# - then ready when all four signing secrets are set; none set — a notice and the release is skipped (CI stays green
#   until the owner adds them); some set — an error naming the missing ones.
# Reads only presence flags HAS_<NAME>=true|false (`secrets.X != ''` in the workflow), never the values.
set -euo pipefail

names=(ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD)
output=${GITHUB_OUTPUT:?GITHUB_OUTPUT is not set}
readme='README, «Подпись release-сборки Android»'

not_ready() {
  echo ready=false >> "$output"
  exit "$1"
}

if [ "${GITHUB_EVENT_NAME:-}" = pull_request ]; then
  echo '::notice title=Release-сборка пропущена::На PR подпись проверяется одноразовым keystore в задании «Android debug APK». Release с ключом приложения собирается при ручном запуске workflow «Android» из main или по тегу v*.'
  not_ready 0
fi

ref=${GITHUB_REF:-}
if [ "$ref" != refs/heads/main ]; then
  if [[ $ref != refs/tags/v* ]]; then
    echo "::error title=Release только из main или тега v*::Запуск из ${ref:-?}: ключ загрузки получает только проверенный код — ветка main или тег v* на коммите из её истории. См. $readme."
    not_ready 1
  fi
  if ! git rev-parse --verify -q origin/main > /dev/null; then
    echo '::error title=Нет origin/main::Шлюзу нужна история main (actions/checkout с fetch-depth: 0).'
    not_ready 1
  fi
  if ! git merge-base --is-ancestor "${GITHUB_SHA:?GITHUB_SHA is not set}" origin/main; then
    echo "::error title=Тег не из истории main::$ref указывает на коммит ${GITHUB_SHA}, которого нет в main: ключ загрузки получает только код, прошедший ревью и слитый в main."
    not_ready 1
  fi
fi

missing=()
for name in "${names[@]}"; do
  flag="HAS_$name"
  [ "${!flag:-false}" = true ] || missing+=("$name")
done

if [ "${#missing[@]}" -eq "${#names[@]}" ]; then
  echo "::notice title=Секретов подписи нет::Release-задание пропущено. Нужны секреты ${names[*]} в окружении android-release — как создать ключ и куда их положить: $readme."
  not_ready 0
fi
if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error title=Заданы не все секреты подписи::Не хватает в окружении android-release: ${missing[*]}. Что положить в каждый — $readme."
  not_ready 1
fi
echo "секреты подписи заданы, запуск из $ref: собираю подписанный release"
echo ready=true >> "$output"
