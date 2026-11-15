#!/usr/bin/env bash
# Every third-party action in the workflows is pinned to a full commit SHA with a version comment (#296):
#   uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
# A tag or a branch is a moving pointer: whoever controls the action's repository can point it at other code, which then
# runs next to the signing key and the deploy secrets. Dependabot (`github-actions` in .github/dependabot.yml) bumps the
# SHA and the comment together. Checked: .github/workflows/*.yml|yaml and composite actions in .github/actions/; local
# actions (./…) are part of this repository; docker:// images need an @sha256: digest.
# The SHA of a version: git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<version>*' (an annotated tag:
# the peeled ^{} line).
# Usage: scripts/check-actions-pinned.sh [root]   (default: this repository). Exit 1 names every file:line.
set -uo pipefail

root=${1:-"$(cd "$(dirname "$0")/.." && pwd)"}
cd "$root" || exit 2

problems=0
checked=0

# report <file> <line or empty> <message>
report() {
  local location=$1
  [[ -n $2 ]] && location="$1:$2"
  printf '%s: %s\n' "$location" "$3" >&2
  if [[ ${GITHUB_ACTIONS:-} == true ]]; then
    if [[ -n $2 ]]; then echo "::error file=$1,line=$2::$3"; else echo "::error file=$1::$3"; fi
  fi
  problems=$((problems + 1))
}

uses_re='^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*(.*)$'
action_re='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/[^@[:space:]]+)?@[0-9a-f]{40}$'
version_comment_re='^#[[:space:]]*v?[0-9]+(\.[0-9]+)*([-+][^[:space:]]+)?([[:space:]]|$)'
docker_re='^docker://[^@[:space:]]+@sha256:[0-9a-f]{64}$'
hint="закрепите полным SHA коммита (40 символов) с комментарием версии, например @<sha> # v4.2.2; \
SHA версии: git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<версия>*'"

check_file() {
  local file=$1 number=0 line value ref comment lines
  mapfile -t lines < "$file"
  for line in "${lines[@]}"; do
    number=$((number + 1))
    [[ $line =~ $uses_re ]] || continue
    value=${BASH_REMATCH[2]}
    # `uses: 'owner/repo@ref' # comment`, `uses: "…"` or plain.
    if [[ $value =~ ^[\'\"]([^\'\"]*)[\'\"][[:space:]]*(.*)$ ]]; then
      ref=${BASH_REMATCH[1]} comment=${BASH_REMATCH[2]}
    else
      ref=${value%%[[:space:]]*}
      comment=${value#"$ref"}
      comment=${comment#"${comment%%[![:space:]]*}"}
    fi
    checked=$((checked + 1))
    if [[ $ref == ./* ]]; then
      continue
    elif [[ $ref == docker://* ]]; then
      [[ $ref =~ $docker_re ]] ||
        report "$file" "$number" "$ref — образ не закреплён по дайджесту: нужен docker://<образ>@sha256:<64 символа>"
    elif [[ ! $ref =~ $action_re ]]; then
      report "$file" "$number" "$ref — ссылка не на полный SHA коммита (тег и ветку можно передвинуть): $hint"
    elif [[ ! $comment =~ $version_comment_re ]]; then
      report "$file" "$number" "$ref — нет комментария версии после SHA, например # v4.2.2: по нему видно версию \
и его обновляет Dependabot"
    fi
  done
}

shopt -s nullglob globstar
for file in .github/workflows/*.yml .github/workflows/*.yaml .github/actions/**/action.yml \
  .github/actions/**/action.yaml; do
  check_file "$file"
done

dependabot=.github/dependabot.yml
[[ -f $dependabot ]] || dependabot=.github/dependabot.yaml
if ! grep -qE "^[[:space:]]*(-[[:space:]]+)?package-ecosystem:[[:space:]]*['\"]?github-actions['\"]?[[:space:]]*(#.*)?$" \
  "$dependabot" 2> /dev/null; then
  report "$dependabot" "" "нет package-ecosystem: github-actions — Dependabot не предложит новый SHA при выходе версии \
действия"
fi

if ((problems)); then
  echo "check-actions-pinned: $problems проблем(ы); каждое стороннее действие — по полному SHA с комментарием версии" >&2
  exit 1
fi
echo "check-actions-pinned: $checked ссылок uses: проверено, сторонние действия закреплены по SHA"
