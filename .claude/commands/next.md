---
description: Take the next ready issue in a lane and deliver it end to end (TDD → PR → CI → review → merge)
argument-hint: <area> (tasks | habits | time | health | today | settings | core | infra) or an issue number
---

Deliver exactly one issue. Lane or issue: **$ARGUMENTS**

1. **Pick.** If `$ARGUMENTS` is a number, that is the issue. Otherwise run `scripts/agent.sh next $ARGUMENTS`.
   Exit code 2 means the lane is empty — report that and stop.
2. **Understand.** `scripts/agent.sh show <N>`. Re-read the parts of `docs/SPEC.md`, `docs/architecture.md`
   and the module's `CLAUDE.md` that the issue touches. Check the Definition of Ready in `docs/process.md`;
   if the issue is not ready (vague criteria, missing dependency), `scripts/agent.sh block <N> "<what is missing>"` and stop.
3. **Start.** `scripts/agent.sh start <N>` (marks in progress, creates `feat/<N>` from fresh `main`).
4. **Plan briefly** in your head: which pure functions in `logic/`, which data hooks in `data/`, which components,
   which tests per acceptance criterion. Stay inside the issue's area (rule 1 in `CLAUDE.md`).
5. **TDD loop** per acceptance criterion: write the failing test named after the criterion → run it, see it fail →
   implement → green → refactor. Commit after each criterion with a Conventional Commit message
   (`feat(<area>): …`, `test(<area>): …`).
6. **UI stories:** add or extend a scenario in `e2e/` and run `npm run e2e`.
7. Run `/ship <N>`.
