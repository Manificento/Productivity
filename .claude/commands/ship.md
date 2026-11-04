---
description: Verify, review and merge the current issue branch (Definition of Done gate)
argument-hint: <issue number>
---

Ship issue **#$ARGUMENTS** from the current `feat/` branch. Do not skip steps.

1. `git fetch origin main && git rebase origin/main`; resolve conflicts if any.
2. `npm run check` must be green. For UI changes also `npm run e2e`. Fix failures — never weaken tests,
   coverage thresholds or `.dependency-cruiser.cjs` rules to get green.
3. `git diff --stat origin/main...HEAD`: only files of the issue's area (plus `e2e/`) may change,
   unless the issue is labelled `type:contract`. Revert anything else.
4. **Independent review**: launch the `reviewer` subagent with the issue number. Its model and effort are pinned
   in `.claude/agents/reviewer.md` (`opus`, `high`); do not override them from the session (no `model` parameter). Fix every `blocker` and `major`
   finding (commit `fix(<area>): …`). If you reject a finding, write why in the PR description.
5. Write the PR body to a temp file following `.github/pull_request_template.md` (summary, how each acceptance
   criterion is tested, DoD checklist ticked), then `PR_BODY_FILE=<file> scripts/agent.sh pr $ARGUMENTS` → PR number.
6. `scripts/agent.sh ci <PR>`. If red: read the failing job via
   `gh api repos/{owner}/{repo}/actions/runs?branch=feat/$ARGUMENTS`, fix, push, repeat.
7. Green → `scripts/agent.sh merge <PR>` (squash, closes the issue, syncs local `main`).
8. One-line report: issue, PR, what was delivered, anything deferred (deferred work = a new issue,
   created with `gh api repos/{owner}/{repo}/issues -f title=… -f body=…` using the story template).
