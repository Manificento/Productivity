#!/usr/bin/env bash
# Prints the versionName of the release (#285): LIFEOS_VERSION_NAME when set; on a tag v* (GITHUB_REF_TYPE=tag,
# GITHUB_REF_NAME=v1.2.3) the tag without «v»; otherwise `version` from package.json.
set -euo pipefail

if [ -n "${LIFEOS_VERSION_NAME:-}" ]; then
  echo "$LIFEOS_VERSION_NAME"
elif [ "${GITHUB_REF_TYPE:-}" = tag ] && [[ ${GITHUB_REF_NAME:-} == v* ]]; then
  echo "${GITHUB_REF_NAME#v}"
else
  repo=$(cd "$(dirname "$0")/../.." && pwd)
  node -p "require('$repo/package.json').version"
fi
