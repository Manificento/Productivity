#!/usr/bin/env bash
# Checks the store requirements of a built APK, the same for debug and release (#141, #214, #285):
# - Google Play asks to justify every health permission: only sleep and workouts may be read;
# - the Health Connect permission screen opens the privacy policy from the app's assets.
# Usage: android/scripts/check-apk.sh <apk>. Needs ANDROID_HOME with build-tools.
set -euo pipefail

apk=${1:?usage: check-apk.sh <apk>}
aapt="$(printf "%s\n" "${ANDROID_HOME:?ANDROID_HOME is not set}"/build-tools/*/ | sort -V | tail -1)aapt"

actual=$("$aapt" dump permissions "$apk" | { grep -o 'android.permission.health.[A-Z0-9_]*' || true; } | sort | tr '\n' ' ')
expected='android.permission.health.READ_EXERCISE android.permission.health.READ_SLEEP '
echo "health permissions: $actual"
if [ "$actual" != "$expected" ]; then
  echo "::error title=Права здоровья в $(basename "$apk")::нужны ровно READ_SLEEP и READ_EXERCISE"
  exit 1
fi

if ! unzip -l "$apk" | grep 'assets/public/privacy/index.html' > /dev/null; then
  echo "::error title=Нет политики конфиденциальности в $(basename "$apk")::assets/public/privacy/index.html"
  exit 1
fi
if ! "$aapt" dump --values resources "$apk" | grep -A1 'health_connect_privacy_policy_url' \
  | grep 'file:///android_asset/public/privacy/index.html' > /dev/null; then
  echo "::error title=Адрес политики в $(basename "$apk")::health_connect_privacy_policy_url не ведёт в assets"
  exit 1
fi
echo "$(basename "$apk"): права здоровья и политика конфиденциальности в порядке"
