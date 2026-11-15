#!/usr/bin/env bash
# Checks the release signing path on a throwaway keystore (#285): creates a key that lives only for this run, builds
# the signed release with build-release.sh (apksigner verify, the same store checks as debug) and deletes the key.
# The CI job «Android debug APK» runs it on every PR; locally — after `npm run build && npx cap sync android`.
# The release built here is signed by a key nobody keeps: it is never uploaded anywhere.
set -euo pipefail

scripts=$(cd "$(dirname "$0")" && pwd)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

export ANDROID_KEYSTORE_FILE="$dir/throwaway.keystore"
ANDROID_KEYSTORE_PASSWORD=$(openssl rand -hex 24)
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::$ANDROID_KEYSTORE_PASSWORD"
# PKCS12 has one password for the store and the key.
export ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD="$ANDROID_KEYSTORE_PASSWORD" ANDROID_KEY_ALIAS=throwaway
export LIFEOS_VERSION_CODE="${LIFEOS_VERSION_CODE:-1}"
# Built as if from the tag v9.9.9-ci: the tag → versionName path (release-version.sh → Gradle → APK) runs on every PR,
# and build-release.sh checks the APK carries versionName 9.9.9-ci.
unset LIFEOS_VERSION_NAME
export GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v9.9.9-ci

keytool -genkeypair -keystore "$ANDROID_KEYSTORE_FILE" -storetype PKCS12 -alias "$ANDROID_KEY_ALIAS" \
  -keyalg RSA -keysize 2048 -validity 2 -dname 'CN=LifeOS CI throwaway key' \
  -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD
echo 'одноразовый keystore создан'

"$scripts/build-release.sh"
