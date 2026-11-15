#!/usr/bin/env bash
# Gate of the signed release job of the «Android» workflow (#285). Writes ready=true|false to $GITHUB_OUTPUT.
# - pull_request: never ready. A PR checks the signing path on a throwaway keystore; the app key never meets PR code.
# - manual run or tag v*: ready when all four signing secrets are set; none set — a notice and the job is skipped
#   (CI stays green until the owner adds them); some set — an error naming the missing ones.
# Reads the secrets from the environment; prints only their names, never values.
set -euo pipefail

names=(ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD)
output=${GITHUB_OUTPUT:?GITHUB_OUTPUT is not set}

if [ "${GITHUB_EVENT_NAME:-}" = pull_request ]; then
  echo '::notice title=Release-сборка пропущена::На PR подпись проверяется одноразовым keystore в задании «Android debug APK». Release с ключом приложения собирается при ручном запуске workflow «Android» или по тегу v*.'
  echo ready=false >> "$output"
  exit 0
fi

missing=()
for name in "${names[@]}"; do
  [ -n "${!name:-}" ] || missing+=("$name")
done

if [ "${#missing[@]}" -eq "${#names[@]}" ]; then
  echo "::notice title=Секретов подписи нет::Release-задание пропущено. Нужны секреты ${names[*]} — как создать ключ и куда их положить: README, «Подпись release-сборки Android»."
  echo ready=false >> "$output"
  exit 0
fi
if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error title=Заданы не все секреты подписи::Не хватает: ${missing[*]}. Что положить в каждый — README, «Подпись release-сборки Android»."
  echo ready=false >> "$output"
  exit 1
fi
echo 'секреты подписи заданы: собираю подписанный release'
echo ready=true >> "$output"
