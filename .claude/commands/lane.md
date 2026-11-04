---
description: Work autonomously through every ready issue of one or more lanes, in order, until they are empty
argument-hint: <area> [<area> …] (tasks | habits | time | health | today | cognition | settings | infra | nutrition | training | meditation | notes | progress)
---

Lanes for this session, in order: **$ARGUMENTS**. Finish the first lane, then move to the next one.
The owner is not watching: never wait for an answer.

Loop:

1. `scripts/agent.sh next <current lane>`. Exit code 2 (lane empty or everything waits on other lanes) → switch to the next lane
   in the list; after the last lane → go to "Finish". Before finishing, retry earlier lanes once: their dependencies may have merged meanwhile.
2. Deliver that issue exactly as `/next <N>` describes, including `/ship`.
3. After the merge, `git switch main && git pull --ff-only` and continue the loop.

Rules for the long run:

- One issue at a time; never leave a branch half-done. If an issue cannot be finished,
  `scripts/agent.sh block <N> "<reason and what is needed>"`, switch to `main`, continue the loop.
- Issues of other lanes may merge into `main` while you work — always start from fresh `main` and rebase before shipping.
- An issue that waits on another lane's issue is skipped automatically by `next` (its dependency is still open).
- `priority:P2` issues are skipped (they need the owner). P1 issues come after all ready P0 issues of the lane.
- If the same CI failure repeats three times, block the issue instead of looping.

Finish: post a summary comment on the lane's last issue you touched (`scripts/agent.sh comment <N> "…"`) listing merged PRs,
blocked issues with reasons, and suggested next issues; then stop.
