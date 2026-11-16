export const meta = {
  name: 'assess-saas-readiness',
  description: 'Read-only audit of main against the nine goal points of the first working SaaS, with adversarial check of each status',
  phases: [
    { title: 'Audit', detail: 'one reader per group of goal points, evidence from code, tests, CI and issues' },
    { title: 'Challenge', detail: 'a skeptic re-checks every status marked done or partly' },
  ],
}

const COMMON = `
You are auditing the repository at /home/user/Productivity (project LifeOS, branch equals origin/main at commit e85b42c). READ ONLY: do not edit, commit, push, create issues or comments, and do not start development. Do not run the full test suite; you may run single cheap commands (grep, ls, git log, reading files, "gh api" GET requests for issues of repo Manificento/Productivity, e.g. gh api repos/Manificento/Productivity/issues/279).

Context: the owner (non-programmer) wants an honest assessment of how close the project is to its goal "first working SaaS". The goal has nine points. You audit only the points given below. Sources of truth: code and tests on main, .github/workflows, docs/ (SPEC.md, product-decisions.md, architecture.md, adr/0009, 0010, 0011, 0012, 0013), infra/supabase/README.md, README.md, and GitHub issues. Issue #223 lists owner decisions and actions.

For every goal point return a status:
- "done" only if the capability exists on main AND is proven by a test or CI job you can name;
- "partly" if foundations exist but a user cannot use it yet (say exactly what exists and what is missing);
- "not_started" if nothing usable exists;
- "blocked_on_owner" if the remaining part cannot be done by agents (accounts, money, legal, secrets).
Evidence must be concrete: file paths, test names, workflow job names, PR/issue numbers. Do not guess: if you did not open the file, do not claim it. State open issues that cover the missing parts (number + title), and note any missing part that has NO issue.
Write evidence in plain English, short sentences.
`

const SCHEMA = {
  type: 'object',
  properties: {
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          point: { type: 'number' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['done', 'partly', 'not_started', 'blocked_on_owner'] },
          existsOnMain: { type: 'string' },
          missing: { type: 'string' },
          coveringIssues: { type: 'array', items: { type: 'string' } },
          gapsWithoutIssue: { type: 'array', items: { type: 'string' } },
          ownerActions: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
        },
        required: ['point', 'title', 'status', 'existsOnMain', 'missing', 'coveringIssues', 'gapsWithoutIssue', 'ownerActions', 'evidence'],
      },
    },
    extra: { type: 'string' },
  },
  required: ['points', 'extra'],
}

const GROUPS = [
  {
    key: 'account-privacy',
    prompt: `Goal points to audit:
1) "Account by e-mail (magic link) with a consent screen per ADR-0009: separate logged consents for cloud copy and sync, for analytics, for transfer to third parties; age 16+ (Kazakhstan 18+ or legal guardian), younger users stay local-first without an account."
7) "A privacy policy page, store texts and consent texts aligned with ADR-0009."
Look at src/core/account/, infra/supabase/migrations/0002_account_consents.sql, docs/adr/0013-*, src/modules/settings/ (is there any sign-in / consent / age screen? any privacy policy page? see src/core/privacyPolicy.test.ts and where the policy text lives), any store listing texts (search for "store", "Google Play", "listing", fastlane, docs/). Issues to check: #278 (closed), #283, #133, #286, #313, #314, #315, #316, #317, #318, #319.
In "extra": can a user of today's build sign in at all (is there any UI path)? Is the build configured with a backend by default (VITE_SUPABASE_URL_*)?`,
  },
  {
    key: 'sync-e2e',
    prompt: `Goal points to audit:
2) "One free cloud copy and paid sync on self-hosted Supabase (planned order: #274 -> #275 -> #277, then #133, #134, #266, #265)."
8) "An e2e test 'two devices sync' on a local Supabase in CI, and the existing e2e 'exam rebuilds all blocks' stays green."
Look at src/core/sync/ (what is there: protocol pure functions, client, config, outbox? is there a sync ENGINE that actually pushes/pulls on a schedule, a cloud copy/restore function?), src/core/db.ts (tombstones, outbox, deviceId), infra/supabase/migrations/, infra/supabase/tests/, .github/workflows/*.yml (which jobs run), e2e/ (exam-all-blocks.spec.ts, any two-device spec), infra/supabase/deploy.sh (are migrations applied on deploy?). Issues: #274, #275, #277 (closed), #279, #280, #281, #291, #303, #304, #266, #265 (closed), #133, #134, #287.
In "extra": state plainly whether any user data can leave the device in today's build, and what the shortest remaining chain of issues is before the first real round trip device -> server -> second device.`,
  },
  {
    key: 'flags-analytics',
    prompt: `Goal points to audit:
3) "Feature flags in src/core/features.ts plus server entitlements; the freemium boundary (#135)."
4) "Own consent-based usage analytics (#136)."
Check whether src/core/features.ts exists, any entitlement table or function in infra/supabase/migrations/, any gate in sync_push for the plan, any analytics code (track(), events queue/table), docs/product-decisions.md and ADR-0009 for what the freemium boundary is. Issues: #280, #281, #135, #282, #136.
In "extra": what consent kinds exist in the consent journal on main (names), and is "analytics" consent already recordable on the server even though analytics itself is not built?`,
  },
  {
    key: 'infra-native',
    prompt: `Goal points to audit:
5) "Production infrastructure ready for deployment in Kazakhstan (#259), parametrized by GitHub secrets."
6) "Native: Android debug APK in CI, release signing parametrized by secrets; iOS (#251) texts only."
Look at infra/supabase/ (README.md section for the owner, deploy.sh, deploy-remote.sh, provision.sh, backup.sh, restore.sh, healthcheck.sh, tests/), .github/workflows/ (deploy workflow, infra.yml, android.yml), android/ (Capacitor shell: which native plugins/features are present — alarms, notifications, health import, sensors?), capacitor config, README.md sections about Android release and the warning about installing debug/release APKs, ios/ (does it exist?), src/core/platform.ts. Issues: #259, #267, #266, #281, #284/#285/#295/#296/#297 (closed), #251, #306, #307, #308.
In "extra" answer precisely, for a non-programmer owner: (a) how the debug APK is produced (which workflow, which trigger, artifact name, retention) and how to download and install it; (b) what works in that APK today (list the app's modules from src/modules and any native-only features) and what does NOT (cloud, account, sync); (c) what happens to the data when later switching from the debug APK to a release/Play build (signatures, allowBackup, export/import JSON path in settings — verify the export/import feature exists and name the screen); (d) the minimum Android version (minSdkVersion) and the applicationId; (e) exactly which secrets/environments the owner must create for the KZ deploy and for the signed release, quoting the names from the README files.`,
  },
  {
    key: 'p1-rules',
    prompt: `Goal point to audit:
9) "All P1 issues of milestones M6, M7, M8 are closed or honestly blocked; coverage and module-boundary rules were never weakened."
Do this:
(a) With gh api (GET, paginate) list all issues of milestones 6 (M6), 7 (M7), 8 (M8) in repo Manificento/Productivity: counts open/closed per milestone, and for every OPEN issue: number, title, labels (priority, area, status:blocked / status:in-progress), and whether its "Зависит от:" dependencies are closed (i.e. whether it is ready to start now). Exclude pull requests.
(b) Check rule integrity: git log -p since 2026-11-14 for .dependency-cruiser.* , vitest/vite config coverage thresholds, package.json scripts "check"/"deps", oxlint config, .github/workflows/ci*.yml — were thresholds lowered, rules removed, tests skipped (search the diff of the last ~15 merged PRs for ".skip(", "it.todo", "test.skip", "coverage" excludes, "eslint-disable"/"oxlint-disable")? Report current thresholds.
(c) List PRs merged since 2026-11-15 (gh api repos/Manificento/Productivity/pulls?state=closed&per_page=50, filter merged_at) with number, title and the issue each closed. Also list currently open PRs (number, title, author) — dependabot ones included.
(d) Check that no .env* file is tracked in git (git ls-files | grep -i env) and say whether android/local.properties is tracked.
Put (a)-(d) details in "extra" as compact tables in markdown. Give ONE entry in "points" for point 9.`,
  },
]

phase('Audit')
const results = await pipeline(
  GROUPS,
  g => agent(COMMON + '\n' + g.prompt, { label: `audit ${g.key}`, phase: 'Audit', schema: SCHEMA }),
  (audit, g) => {
    if (!audit) return null
    return agent(
      `You are a skeptic checking an audit of the repository /home/user/Productivity (LifeOS, main at e85b42c). READ ONLY: no edits, commits, pushes, issues or comments.
Another agent produced the audit below for some goal points of "first working SaaS". The report built on it will be read by a non-programmer owner who will make decisions from it (install the app, buy accounts, plan time). Overstated readiness is the costly error.
For EACH point: try to refute the status and the concrete claims in existsOnMain/evidence by opening the named files, tests and workflows yourself (and gh api GET for issues of Manificento/Productivity). Check that named tests and CI jobs really exist, that claimed capabilities are reachable by a user and not only library code, and that the list of missing parts is complete (look for missing parts the audit did not mention). Also verify every factual statement in "extra" that an owner would act on (artifact names, secret names, screen names, versions).
Return, per point, the corrected status and a list of corrections (empty if the audit stands), plus corrections to "extra". Default to the more cautious status when uncertain. Plain English, short sentences.

AUDIT:
${JSON.stringify(audit)}`,
      {
        label: `challenge ${g.key}`,
        phase: 'Challenge',
        schema: {
          type: 'object',
          properties: {
            points: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  point: { type: 'number' },
                  auditStatus: { type: 'string' },
                  correctedStatus: { type: 'string', enum: ['done', 'partly', 'not_started', 'blocked_on_owner'] },
                  corrections: { type: 'array', items: { type: 'string' } },
                  missedGaps: { type: 'array', items: { type: 'string' } },
                },
                required: ['point', 'auditStatus', 'correctedStatus', 'corrections', 'missedGaps'],
              },
            },
            extraCorrections: { type: 'array', items: { type: 'string' } },
            confirmedFacts: { type: 'string' },
          },
          required: ['points', 'extraCorrections', 'confirmedFacts'],
        },
      },
    ).then(challenge => ({ key: g.key, audit, challenge }))
  },
)

return results.filter(Boolean)
