#!/usr/bin/env bash
# Every third-party action in the workflows is pinned to a full commit SHA with a version comment (#296):
#   uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
# A tag or a branch is a moving pointer: whoever controls the action's repository can point it at other code, which then
# runs next to the signing key and the deploy secrets. Dependabot (`github-actions` in .github/dependabot.yml) bumps the
# SHA and the comment together. Checked: .github/workflows/*.yml|yaml and composite actions in .github/actions/; local
# actions (./…) are part of this repository; docker:// images need an @sha256: digest.
# The SHA of a version: git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<version>*' (an annotated tag:
# the peeled ^{} line). The check does not know whose SHA it is (GitHub also resolves commits of forks), so a reviewer
# compares every new SHA with that tag.
# Two passes per file. 1) A line scan parses the one canonical form `- uses: <ref> # <version>` and checks the ref.
# 2) A YAML parser (python3 + PyYAML, preinstalled on ubuntu-latest) resolves every mapping key — quotes, escapes, flow
# syntax, explicit `?` keys, anchors and aliases — and every key that reads `uses` and was not checked by pass 1 is an
# error naming the file:line of its value. No parser, or a file it cannot parse, is an error too: the check fails closed.
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

# The one form the check parses: a block-mapping key `uses:`, optionally after `- `.
uses_re='^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*(.*)$'
# Fail closed: every other way YAML can spell a `uses` key — flow mapping `{ uses: x }` / `[uses: x]`, quoted key
# `'uses':`, `"uses" :`, `uses :`, an escaped key `"\u0075ses":`, an explicit key `? uses` — is an error, not a skip.
any_uses_re="(^|[][{,[:space:]-])['\"]?uses['\"]?[[:space:]]*:"
escaped_key_re='"[^"]*\\[^"]*"[[:space:]]*:'
explicit_key_re='^[[:space:]]*(-[[:space:]]+)*\?([[:space:]]|$)'
# A line that is only `key: '<quoted scalar>'` (+ comment): "uses:" inside it is text, e.g. a run command.
quoted_value_re="^[[:space:]]*(-[[:space:]]+)?([A-Za-z0-9_-]+):[[:space:]]+('([^']|'')*'|\"([^\"\\\\]|\\\\.)*\")[[:space:]]*(#.*)?$"
# A block scalar header `key: |` / `- >-`: the more-indented lines after it are text (YAML allows this header only in
# block context). Its indent = the key column, so a line that is not text is never taken for text.
block_scalar_re="^( *(- +)*)(['\"]?[A-Za-z0-9_-]+['\"]?[[:space:]]*:[[:space:]]+)?[|>][0-9+-]*([[:space:]]+#.*)?[[:space:]]*$"
action_re='^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/[^@[:space:]]+)?@[0-9a-f]{40}$'
version_comment_re='^#[[:space:]]*v?[0-9]+(\.[0-9]+)*([-+][^[:space:]]+)?([[:space:]]|$)'
docker_re='^docker://[^@[:space:]]+@sha256:[0-9a-f]{64}$'
hint="закрепите полным SHA коммита (40 символов) с комментарием версии, например @<sha> # v4.2.2; \
SHA версии: git ls-remote https://github.com/<owner>/<repo> 'refs/tags/<версия>*'"

# uses_keys <file> — prints `<key line>\t<value line>\t<value>` for every mapping key that a YAML parser reads as
# `uses` (aliases resolved), or `error\t<line>\t<message>` when the file is not valid YAML.
uses_keys() {
  python3 -I - "$1" << 'PY'
import sys
import yaml


def walk(node, seen):
    if id(node) in seen:
        return
    seen.add(id(node))
    if isinstance(node, yaml.MappingNode):
        for key, value in node.value:
            if isinstance(key, yaml.ScalarNode) and key.value == "uses":
                text = value.value if isinstance(value, yaml.ScalarNode) else "<" + value.id + ">"
                text = text.replace("\\", "\\\\").replace("\n", "\\n").replace("\t", "\\t")
                print(f"{key.start_mark.line + 1}\t{value.start_mark.line + 1}\t{text}")
            walk(key, seen)
            walk(value, seen)
    elif isinstance(node, yaml.SequenceNode):
        for item in node.value:
            walk(item, seen)


try:
    with open(sys.argv[1], encoding="utf-8") as stream:
        for document in yaml.compose_all(stream, Loader=yaml.SafeLoader):
            walk(document, set())
except yaml.YAMLError as error:
    mark = getattr(error, "problem_mark", None) or getattr(error, "context_mark", None)
    line = mark.line + 1 if mark else ""
    problem = getattr(error, "problem", None) or str(error).splitlines()[0]
    print(f"error\t{line}\t{problem}")
PY
}

form_error="ключ uses в форме, которую проверка не разбирает (flow-синтаксис, ключ в кавычках, с escape или через \
якорь/алиас, пробел перед двоеточием, явный ключ ?): запишите шаг блочной формой - uses: <owner>/<repo>@<sha> # v4.2.2"

check_file() {
  local file=$1 number=0 line value ref comment lines indent text_indent=-1 key_line value_line parsed
  local -A canonical=() flagged=()
  mapfile -t lines < "$file"
  for line in "${lines[@]}"; do
    number=$((number + 1))
    line=${line%$'\r'}
    if ((text_indent >= 0)); then # inside a block scalar
      indent=${line%%[! ]*}
      [[ $line =~ ^[[:space:]]*$ ]] || ((${#indent} > text_indent)) && continue
      text_indent=-1
    fi
    [[ $line =~ ^[[:space:]]*# ]] && continue
    [[ $line =~ $block_scalar_re ]] && text_indent=${#BASH_REMATCH[1]}
    if [[ ! $line =~ $uses_re ]]; then
      [[ $line =~ $quoted_value_re && ${BASH_REMATCH[2]} != uses ]] && continue
      if [[ $line =~ $any_uses_re || $line =~ $escaped_key_re || $line =~ $explicit_key_re ]]; then
        checked=$((checked + 1))
        flagged[$number]=1
        report "$file" "$number" "$form_error"
      fi
      continue
    fi
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
    canonical[$number]=$ref
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

  # Pass 2: every `uses` key as the YAML parser reads it.
  while IFS=$'\t' read -r key_line value_line parsed; do
    if [[ $key_line == error ]]; then
      report "$file" "$value_line" "файл не разбирается как YAML ($parsed) — проверка не может прочитать шаги"
    elif [[ -n ${canonical[$key_line]+x} && ${canonical[$key_line]} == "$parsed" ]]; then
      continue # checked by pass 1
    elif [[ -n ${canonical[$key_line]+x} ]]; then
      report "$file" "$value_line" "$parsed — YAML читает значение uses иначе, чем строку: $form_error"
    elif [[ -z ${flagged[$key_line]+x} && -z ${flagged[$value_line]+x} ]]; then
      checked=$((checked + 1))
      report "$file" "$value_line" "$parsed — $form_error"
    fi
  done < <(uses_keys "$file")
}

if ! python3 -I -c 'import yaml' > /dev/null 2>&1; then
  report "${0##*/}" "" "нужен python3 с PyYAML (есть на ubuntu-latest; локально: pip install pyyaml) — без \
YAML-парсера проверка не видит ключи uses через якорь, алиас или escape"
  echo "check-actions-pinned: $problems проблем(ы)" >&2
  exit 1
fi

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
