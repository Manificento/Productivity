#!/usr/bin/env bash
# Checks that the Android project and its native plugins build with one Kotlin version (#297): `kotlin_version` in
# android/variables.gradle (the plugins that take the project's version, as @capacitor/local-notifications, use it)
# equals every Kotlin Gradle plugin version a plugin pins itself (as @capgo/capacitor-health). A plugin update that
# brings a new Kotlin fails here, on its PR, with what to change — docs/architecture.md, «Release-сборка Android».
# Usage: android/scripts/check-kotlin-versions.sh [android dir]. Run after `npm ci` (the plugins live in node_modules).
set -euo pipefail

android=${1:-$(cd "$(dirname "$0")/.." && pwd)}
doc='docs/architecture.md, «Release-сборка Android»'

project=$(sed -n "s/^[[:space:]]*kotlin_version[[:space:]]*=[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" \
  "$android/variables.gradle" | sed -n 1p)
if [ -z "$project" ]; then
  echo "::error title=Нет kotlin_version::в android/variables.gradle не задана версия Kotlin проекта — $doc"
  exit 1
fi
echo "Kotlin проекта (variables.gradle): $project"

# The plugins as `cap sync` wrote them: include ':name' and projectDir = new File('../node_modules/…/android').
plugins=$(sed -n "s/^project('\(:[^']*\)').projectDir = new File('\([^']*\)').*/\1 \2/p" \
  "$android/capacitor.settings.gradle")
mismatches=0
while read -r name dir; do
  [ -n "$name" ] || continue
  build="$android/$dir/build.gradle"
  [ -f "$build" ] || continue
  # Only a version written as a literal: `kotlin-gradle-plugin:$kotlin_version` is the project's own.
  pinned=$(sed -n 's/.*kotlin-gradle-plugin:\([0-9][0-9A-Za-z.-]*\).*/\1/p' "$build" | sort -u)
  for version in $pinned; do
    if [ "$version" = "$project" ]; then
      echo "$name: Kotlin $version"
    else
      echo "::error title=Kotlin плагина ${name#:} не совпадает с проектом::плагин собирается Kotlin $version, проект — $project (kotlin_version в android/variables.gradle); согласуйте версии — $doc"
      mismatches=$((mismatches + 1))
    fi
  done
done <<< "$plugins"
[ "$mismatches" -eq 0 ]
