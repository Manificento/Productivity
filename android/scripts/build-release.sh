#!/usr/bin/env bash
# Builds the signed release AAB and APK of the app and checks them (#285). Run from anywhere after
# `npm run build && npx cap sync android`; needs JDK 21 and ANDROID_HOME with build-tools.
#
# Environment (values are never printed):
#   ANDROID_KEYSTORE_FILE      path to the keystore (.jks / .keystore), outside the repository
#   ANDROID_KEYSTORE_PASSWORD  keystore password
#   ANDROID_KEY_ALIAS          alias of the upload key in the keystore
#   ANDROID_KEY_PASSWORD       password of that key
#   LIFEOS_VERSION_CODE        versionCode, an integer that grows with every upload (CI: the run number)
#   LIFEOS_VERSION_NAME        optional versionName; on a tag v* — the tag without «v», else package.json
#
# Checks: apksigner verify of the APK, jarsigner of the AAB, both signed by the key from the keystore (not the debug
# key), versionCode / versionName as asked, the store checks of check-apk.sh — the same as for the debug APK — and no
# «incompatible version of Kotlin» in the lint of the release build (check-kotlin-log.sh, #297).
set -euo pipefail

scripts=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$scripts/../.." && pwd)
apk="$repo/android/app/build/outputs/apk/release/app-release.apk"
aab="$repo/android/app/build/outputs/bundle/release/app-release.aab"

for name in ANDROID_KEYSTORE_FILE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD LIFEOS_VERSION_CODE; do
  if [ -z "${!name:-}" ]; then
    echo "::error title=Не задано $name::см. README, «Подпись release-сборки Android»"
    exit 1
  fi
done
# Gradle reads LIFEOS_VERSION_NAME; the badging check below compares the APK with the same value.
LIFEOS_VERSION_NAME=$("$scripts/release-version.sh")
export LIFEOS_VERSION_NAME
version_name=$LIFEOS_VERSION_NAME

# A wrong password or alias gives this message instead of a Gradle stack trace. keytool prints nothing secret.
if ! keytool -list -keystore "$ANDROID_KEYSTORE_FILE" -storepass:env ANDROID_KEYSTORE_PASSWORD \
  -alias "$ANDROID_KEY_ALIAS" > /dev/null 2>&1; then
  echo '::error title=Keystore не открывается::неверный файл, пароль keystore или alias ключа (ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS)'
  exit 1
fi
# The SHA-256 of the upload certificate, lower case without colons, as apksigner prints it.
fingerprint() { tr -d ': ' | tr '[:upper:]' '[:lower:]'; }
expected_cert=$(keytool -list -v -keystore "$ANDROID_KEYSTORE_FILE" -storepass:env ANDROID_KEYSTORE_PASSWORD \
  -alias "$ANDROID_KEY_ALIAS" | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | sed -n 1p | fingerprint)

rm -f "$apk" "$aab"
gradle_log=$(mktemp)
trap 'rm -f "$gradle_log"' EXIT
# The lint of the release build runs every time (--rerun), and its log goes to check-kotlin-log.sh (#297): a module
# compiled by a Kotlin newer than the one inside lint is only logged by Gradle, the check makes it a failure.
(cd "$repo/android" && ./gradlew :app:lintVitalAnalyzeRelease --rerun assembleRelease bundleRelease --no-daemon \
  --console=plain) 2>&1 | tee "$gradle_log"
echo "собрано: $apk, $aab"
"$scripts/check-kotlin-log.sh" "$gradle_log"

build_tools="$(printf "%s\n" "${ANDROID_HOME:?ANDROID_HOME is not set}"/build-tools/*/ | sort -V | tail -1)"

echo '— подпись APK (apksigner verify)'
"$build_tools/apksigner" verify --verbose "$apk"
# «Signer #1 certificate …» or «Signer (minSdkVersion=…) certificate …», depending on the build-tools version.
apk_certs=$("$build_tools/apksigner" verify --print-certs "$apk")
apk_cert=$(sed -n 's/^.*certificate SHA-256 digest:[[:space:]]*//p' <<< "$apk_certs" | sed -n 1p | fingerprint)
if [ -z "$expected_cert" ] || [ "$apk_cert" != "$expected_cert" ]; then
  echo "$apk_certs"
  echo "::error title=APK подписан не тем ключом::сертификат APK ${apk_cert:-не найден}, ключ из keystore $expected_cert"
  exit 1
fi

echo '— подпись AAB (jarsigner -verify)'
if ! jarsigner -verify "$aab" | grep 'jar verified.' > /dev/null; then
  echo '::error title=AAB не подписан::jarsigner -verify не подтвердил подпись app-release.aab'
  exit 1
fi
aab_cert=$(keytool -printcert -jarfile "$aab" | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | sed -n 1p | fingerprint)
if [ "$aab_cert" != "$expected_cert" ]; then
  echo "::error title=AAB подписан не тем ключом::сертификат AAB $aab_cert, ключ из keystore $expected_cert"
  exit 1
fi
echo "APK и AAB подписаны ключом $ANDROID_KEY_ALIAS (SHA-256 $expected_cert)"

echo '— версия'
badging=$("$build_tools/aapt" dump badging "$apk" | sed -n 1p)
echo "$badging"
expected_badging="versionCode='$LIFEOS_VERSION_CODE' versionName='$version_name'"
if [[ $badging != *"$expected_badging"* ]]; then
  echo "::error title=Версия не та::ожидалось $expected_badging"
  exit 1
fi

echo '— проверки магазина, те же, что у debug'
"$scripts/check-apk.sh" "$apk"
