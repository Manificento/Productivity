#!/usr/bin/env bash
# Workflow helper for agents (and humans). Uses only the GitHub REST API via `gh api`,
# because GraphQL (`gh pr`, `gh issue`) is blocked in Claude Code cloud sessions.
#
#   scripts/agent.sh next <area>          next ready issue in a lane (area:<area>), deps closed
#   scripts/agent.sh show <issue>         title, labels, milestone and body of an issue
#   scripts/agent.sh start <issue>        mark in progress + create branch feat/<issue> from origin/main
#   scripts/agent.sh pr <issue>           push branch and open (or find) the PR; prints PR number
#   scripts/agent.sh ci <pr>              wait for CI on the PR head; exit 1 if anything failed
#   scripts/agent.sh merge <pr>           squash-merge a green PR (closes its issue), then sync main
#   scripts/agent.sh block <issue> <why>  mark blocked and explain in a comment
#   scripts/agent.sh comment <issue> <text>
set -euo pipefail

repo() {
  if [[ -n "${REPO:-}" ]]; then echo "$REPO"; return; fi
  local url
  url=$(git remote get-url origin 2>/dev/null || true)
  url=${url%.git}
  if [[ "$url" =~ ([^/:]+)/([^/]+)$ ]]; then echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"; else echo "Manificento/Productivity"; fi
}
R=$(repo)
api() { gh api "$@"; }
die() { echo "error: $*" >&2; exit 1; }

# Issue numbers listed after "Depends on:" / "Зависит от:" in the body.
deps_of() {
  api "repos/$R/issues/$1" --jq '.body // ""' | grep -E '^(Depends on|depends on|Зависит от|зависит от):' | grep -oE '#[0-9]+' | tr -d '#' || true
}

is_closed() { [[ "$(api "repos/$R/issues/$1" --jq .state)" == "closed" ]]; }

cmd_next() {
  local area=${1:?usage: next <area>}
  local rows skip_p2=true
  [[ "${INCLUDE_P2:-}" == "1" ]] && skip_p2=false
  # Order: priority (P0 → P1 → P2), then milestone, then issue number. P2 is skipped unless INCLUDE_P2=1.
  rows=$(api "repos/$R/issues?state=open&labels=area:$area&per_page=100" --jq \
    "[.[] | select(.pull_request == null)
          | (.labels | map(.name)) as \$l
          | select(\$l | index(\"status:in-progress\") | not)
          | select(\$l | index(\"status:blocked\") | not)
          | select(($skip_p2 and (\$l | index(\"priority:P2\"))) | not)
          | . + {prio: ((\$l | map(select(startswith(\"priority:\")))) [0] // \"priority:P9\")}]
     | sort_by(.prio, .milestone.title // \"zzz\", .number) | .[] | \"\(.number)\t\(.title)\"")
  while IFS=$'\t' read -r num title; do
    [[ -z "$num" ]] && continue
    local ready=1
    for d in $(deps_of "$num"); do is_closed "$d" || { ready=0; break; }; done
    if (( ready )); then printf '%s\t%s\n' "$num" "$title"; return 0; fi
  done <<< "$rows"
  echo "no ready issues in area:$area" >&2
  return 2
}

cmd_show() {
  local n=${1:?usage: show <issue>}
  api "repos/$R/issues/$n" --jq '"#\(.number) \(.title)\nstate: \(.state)\nmilestone: \(.milestone.title // "-")\nlabels: \([.labels[].name] | join(", "))\n\n\(.body // "")"'
}

cmd_start() {
  local n=${1:?usage: start <issue>}
  api -X POST "repos/$R/issues/$n/labels" -f 'labels[]=status:in-progress' >/dev/null
  git fetch -q origin main
  git switch -c "feat/$n" origin/main 2>/dev/null || git switch "feat/$n"
  echo "branch feat/$n ready; issue #$n marked in progress"
}

# PR title (and so the squash commit): the branch's first Conventional Commit subject — later commits are
# usually review fixes. Otherwise `feat(<area>): <issue title>` from the issue's area label.
pr_title() {
  local n=$1 first area title
  first=$(git log origin/main..HEAD --no-merges --reverse --format=%s | head -1)
  if [[ "$first" =~ ^(feat|fix|docs|test|chore|refactor|perf|build|ci|style|revert)(\([^\)]+\))?!?:\ .+ ]]; then
    echo "$first"
    return
  fi
  area=$(api "repos/$R/issues/$n" --jq '[.labels[].name | select(startswith("area:"))][0] // "core" | sub("^area:"; "")')
  title=$(api "repos/$R/issues/$n" --jq .title)
  echo "feat($area): ${title#"$area: "}"
}

cmd_pr() {
  local n=${1:?usage: pr <issue>}
  local branch owner title existing
  branch=$(git branch --show-current)
  owner=${R%%/*}
  git push -q -u origin "$branch"
  existing=$(api "repos/$R/pulls?state=open&head=$owner:$branch" --jq '.[0].number // empty')
  if [[ -n "$existing" ]]; then echo "$existing"; return; fi
  title=$(pr_title "$n")
  local body
  body=$(sed "s/Closes #<issue>/Closes #$n/" .github/pull_request_template.md)
  [[ -f "${PR_BODY_FILE:-}" ]] && body="$(cat "$PR_BODY_FILE")"$'\n\n'"Closes #$n"
  api "repos/$R/pulls" -f title="$title" -f head="$branch" -f base=main -f body="$body" --jq .number
}

cmd_ci() {
  local pr=${1:?usage: ci <pr>}
  local sha head_ref deadline=$((SECONDS + ${CI_TIMEOUT:-1500}))
  sha=$(api "repos/$R/pulls/$pr" --jq .head.sha)
  head_ref=$(api "repos/$R/pulls/$pr" --jq .head.ref)
  # Right after a push GitHub may still report the previous head commit; when we are on the PR
  # branch, wait until the PR points at our local HEAD so we never read stale CI results.
  if [[ "$(git branch --show-current 2>/dev/null)" == "$head_ref" ]]; then
    local local_sha
    local_sha=$(git rev-parse HEAD)
    while [[ "$sha" != "$local_sha" ]]; do
      (( SECONDS > deadline )) && die "PR #$pr does not point at local HEAD — did the push succeed?"
      sleep 5
      sha=$(api "repos/$R/pulls/$pr" --jq .head.sha)
    done
  fi
  echo "waiting for CI on PR #$pr ($sha)…"
  while :; do
    local runs pending
    runs=$(api "repos/$R/commits/$sha/check-runs?per_page=100" --jq '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"')
    if [[ -n "$runs" ]]; then
      pending=$(grep -cv $'\tcompleted\t' <<< "$runs" || true)
      if (( pending == 0 )); then
        echo "$runs"
        if grep -qvE $'\t(success|skipped|neutral)$' <<< "$runs"; then echo "CI FAILED" >&2; return 1; fi
        echo "CI green"; return 0
      fi
    fi
    (( SECONDS > deadline )) && die "CI did not finish in time"
    sleep 20
  done
}

cmd_merge() {
  local pr=${1:?usage: merge <pr>}
  cmd_ci "$pr" >/dev/null || die "PR #$pr is not green — fix before merging"
  local title
  title=$(api "repos/$R/pulls/$pr" --jq .title)
  api -X PUT "repos/$R/pulls/$pr/merge" -f merge_method=squash -f commit_title="$title (#$pr)" --jq .message
  for n in $(api "repos/$R/pulls/$pr" --jq '.body // ""' | grep -oiE '(closes|fixes) #[0-9]+' | grep -oE '[0-9]+'); do
    api -X DELETE "repos/$R/issues/$n/labels/status:in-progress" >/dev/null 2>&1 || true
  done
  git fetch -q origin main && git switch -q main 2>/dev/null && git reset -q --hard origin/main || true
  echo "merged PR #$pr; local main synced"
}

cmd_block() {
  local n=${1:?usage: block <issue> <reason>}; shift
  api -X POST "repos/$R/issues/$n/labels" -f 'labels[]=status:blocked' >/dev/null
  api -X DELETE "repos/$R/issues/$n/labels/status:in-progress" >/dev/null 2>&1 || true
  api "repos/$R/issues/$n/comments" -f body="🚧 Blocked: $*" --jq .html_url
}

cmd_comment() {
  local n=${1:?usage: comment <issue> <text>}; shift
  api "repos/$R/issues/$n/comments" -f body="$*" --jq .html_url
}

sub=${1:-}; shift || true
case "$sub" in
  next|show|start|pr|ci|merge|block|comment) "cmd_$sub" "$@" ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac
