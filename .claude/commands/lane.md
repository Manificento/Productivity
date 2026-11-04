---
description: Work autonomously through every ready issue of one lane until it is empty
argument-hint: <area> (tasks | habits | time | health | today)
---

You own the **$ARGUMENTS** lane for this whole session. The owner is not watching: never wait for an answer.

Loop:

1. `scripts/agent.sh next $ARGUMENTS`. Exit code 2 (lane empty) → go to "Finish".
2. Deliver that issue exactly as `/next <N>` describes, including `/ship`.
3. After the merge, `git switch main && git pull --ff-only` and continue the loop.

Rules for the long run:

- One issue at a time; never leave a branch half-done. If an issue cannot be finished,
  `scripts/agent.sh block <N> "<reason and what is needed>"`, switch to `main`, continue the loop.
- Issues of other lanes may merge into `main` while you work — always start from fresh `main` and rebase before shipping.
- An issue that waits on another lane's issue is skipped automatically by `next` (its dependency is still open).
  If every remaining issue is waiting, go to "Finish".
- If the same CI failure repeats three times, block the issue instead of looping.

Finish: post a summary comment on the lane's last issue you touched (`scripts/agent.sh comment <N> "…"`) listing merged PRs,
blocked issues with reasons, and suggested next issues; then stop.
