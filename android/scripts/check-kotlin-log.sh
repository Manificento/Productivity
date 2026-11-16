#!/usr/bin/env bash
# Checks the Gradle log of the release build (#297): the lint of the release build (lintVitalAnalyzeRelease) must have
# run and must not have met a module compiled by a Kotlin newer than the one inside lint. Lint only logs such modules
# («Module was compiled with an incompatible version of Kotlin») and goes on without them — the build stays green
# while lint no longer sees the plugin code, so this check turns the line into a failure.
# Usage: android/scripts/check-kotlin-log.sh <gradle log>. The log is what `./gradlew --console=plain` printed
# (build-release.sh). Which versions to align — docs/architecture.md, «Release-сборка Android».
set -euo pipefail

log=${1:?usage: check-kotlin-log.sh <gradle log>}
if [ ! -f "$log" ]; then
  echo "::error title=Нет журнала Gradle::$log"
  exit 1
fi

# `--console=plain` prints an executed task without an outcome; UP-TO-DATE, FROM-CACHE or SKIPPED mean lint did not run.
if ! grep -qx '> Task :app:lintVitalAnalyzeRelease' "$log"; then
  echo '::error title=lintVitalAnalyzeRelease не выполнялся::проверять нечего: release-сборка должна запускать lint (build-release.sh, --rerun)'
  exit 1
fi

pattern='Module was compiled with an incompatible version of Kotlin'
if grep -q -- "$pattern" "$log"; then
  grep -- "$pattern" "$log" | sed -n 1,20p
  echo "::error title=Несовместимая версия Kotlin в release-сборке::lint собран более старым Kotlin, чем плагины ($(grep -c -- "$pattern" "$log") стр.); согласуйте версии — docs/architecture.md, «Release-сборка Android»"
  exit 1
fi
echo 'lintVitalAnalyzeRelease: строк о несовместимой версии Kotlin нет'
