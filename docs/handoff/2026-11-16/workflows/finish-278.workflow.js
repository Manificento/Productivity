export const meta = {
  name: 'finish-278',
  description: 'Finish PR #311 (issue #278): verify security findings, fix review round 2, re-review',
  phases: [
    { title: 'Verify', detail: 'adversarial check of the security findings against the pinned GoTrue source and the stack' },
    { title: 'Fix', detail: 'one agent fixes confirmed findings on feat/278, pushes, waits for CI' },
    { title: 'Re-review', detail: 'two independent reviewers on the fix diff' },
  ],
}

const WT = '/home/user/wt-278'
const COMMON = `Repository LifeOS (Manificento/Productivity). PR #311 / issue #278 (core contract: account by e-mail, device session, consent journal, age rule, account deletion) is checked out on branch feat/278 in the worktree ${WT} — work ONLY there (cd ${WT}), never in /home/user/Productivity. node_modules is a symlink to the main checkout. The cloud is self-hosted Supabase in infra/supabase/ (Postgres, GoTrue image supabase/gotrue:v2.197.0, Kong, Caddy proxy with network_mode: host). Design docs: docs/adr/0009-*.md, docs/adr/0013-*.md, infra/supabase/README.md.`

const VERDICT = {
  type: 'object',
  properties: {
    real: { type: 'boolean', description: 'true only if the finding holds against the actual code and the actual upstream behaviour' },
    severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'not_real'] },
    evidence: { type: 'string', description: 'what you checked: files/lines of this repo, upstream source file and lines (version), commands run and their output' },
    corrections: { type: 'string', description: 'anything in the finding that is wrong or imprecise (numbers, mechanism)' },
    recommendedFix: { type: 'string', description: 'the smallest correct fix in this repo, concrete settings/values/files, and how to test it in infra/supabase/tests/' },
  },
  required: ['real', 'severity', 'evidence', 'recommendedFix'],
}

const UPSTREAM = `The upstream source of the pinned Auth server is reachable: e.g. \`curl -sSL https://proxy.golang.org/github.com/supabase/auth/@v/v2.197.0.zip\` (or the nearest existing tag listed at https://proxy.golang.org/github.com/supabase/auth/@v/list; raw.githubusercontent.com/supabase/auth also answers). Unpack it under /tmp/claude-0/-home-user-Productivity/87374550-7021-512f-a789-ab410f65d4e2/scratchpad/<your-own-new-dir> and READ the code (internal/api/middleware.go, verify.go, otp.go, mail.go, options.go, internal/conf/configuration.go) — do not answer from memory. A Docker daemon is running locally (Docker Hub sometimes answers 429 — retry), so you may bring the test stack up the way infra/supabase/tests/*.test.sh do and try the attack for real; if you do, use your own compose project name and tear it down. Do not edit files in the worktree.`

const FINDINGS = [
  {
    key: 'ipv6-otp',
    text: `FINDING S1 (reported as major). infra/supabase/volumes/proxy/Caddyfile sets \`header_up X-Real-IP {remote_host}\`; Caddy runs with network_mode: host and no bind, so it accepts IPv6. GoTrue (GOTRUE_RATE_LIMIT_HEADER: X-Real-IP) keys its limiter on the header value, and there is claimed to be NO per-account counter of failed code attempts. Claimed attack: attacker calls POST /auth/v1/otp for the victim's address (code valid OTP_EXPIRY=900 s), then guesses the six-digit code via POST /auth/v1/verify {type:"email", email, token}, taking a fresh IPv6 source address from one /64 every 30 tries (claimed default verify limit: 30 per 5 min per address), so the whole 10^6 space is reachable within the window; ADR-0013 and the PR claim the header limit stops code guessing. Questions to settle from the source: how exactly is the limiter keyed and sized for /verify and for /otp (per header value? token bucket? defaults?); is there any per-user/per-token failed-attempt limit or does a failed verify invalidate the token; does requesting a new letter replace the code; does a distributed IPv4 attacker have the same power; what is the best mitigation available with GoTrue settings + Caddy (IPv4-only bind vs mapping IPv6 to /64, explicit GOTRUE_RATE_LIMIT_VERIFY, shorter OTP expiry, longer code via GOTRUE_MAILER_OTP_LENGTH) and what residual risk remains.`,
  },
  {
    key: 'email-limit',
    text: `FINDING S2 (reported as major). infra/supabase/docker-compose.yml does not set GOTRUE_RATE_LIMIT_EMAIL_SENT, so GoTrue's default (claimed 30 letters per hour) applies, and it is claimed to be ONE GLOBAL limiter, not per client; the per-address limit on /otp is claimed to be 30 per 5 minutes. Claimed attack: one anonymous client sends 30 POST /auth/v1/otp with random addresses and uses up the region's hourly budget of letters; every real user's sign-in then gets 429 over_email_send_rate_limit for the rest of the hour; repeat hourly. Each request also creates an auth.users row + a profiles row for an address the attacker typed and sends a real letter to a third party. Questions to settle from the source: is the e-mail limiter global, what are the real defaults and the env names in this version (GOTRUE_RATE_LIMIT_EMAIL_SENT, GOTRUE_RATE_LIMIT_OTP, GOTRUE_SMTP_MAX_FREQUENCY / per-address resend interval, anything else), does a per-client limit on /otp exist and how is it keyed, and what settings make "one client cannot exhaust the region" true (per-client otp limit strictly below the global letter budget, global budget an env setting sized to the SMTP quota). Also check how the existing tests in infra/supabase/tests/account.test.sh would be affected by lower limits (they request several letters).`,
  },
  {
    key: 'password-routes',
    text: `FINDING S4 (reported as minor). The design says sign-in is by e-mail letter only, "no passwords" (src/core/account/authApi.ts header comment, ADR-0013), but GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true' plus the Kong route for /auth/v1/ (infra/supabase/volumes/api/kong.yml) are claimed to leave POST /auth/v1/signup {email,password}, POST /auth/v1/token?grant_type=password and PUT /auth/v1/user {password} working with the public anon key. Claimed consequence: someone holding a stolen session can set a password and keep access after signOut() revokes that session; anyone can create password accounts (bypassing the letter). Questions to settle from the source and, if you can, on the real stack: are these three routes really reachable and working with the current settings (mailer autoconfirm? does signup with a password for an existing address do anything? does PUT /user password need reauthentication/nonce in this version?); what is the smallest robust way to close them in this repo — a Kong rule, a GoTrue setting, or a trigger on auth.users in infra/supabase/migrations/0002_account_consents.sql that never lets encrypted_password be set — and which of those does not break the letter/OTP flow (GoTrue itself writes auth.users on sign-up and on verify); and what check should be added to infra/supabase/tests/account.test.sh.`,
  },
]

phase('Verify')
const verdicts = await parallel(FINDINGS.map(f => () =>
  agent(`${COMMON}

You are an adversarial verifier. A security reviewer reported the finding below. Your job is to try to REFUTE it — and to say precisely what is true. Do not trust the reviewer's numbers or their description of upstream behaviour; establish them yourself.

${f.text}

${UPSTREAM}

Return the verdict. "real" = the weakness exists in this repo as it would be deployed by infra/supabase (provision.sh / deploy-remote.sh, proxy profile). Give the corrected facts (actual defaults, actual limiter keys) and the smallest correct fix with concrete values, plus how to test it.`,
    { label: `verify ${f.key}`, phase: 'Verify', schema: VERDICT, effort: 'high' })
    .then(v => v && { key: f.key, finding: f.text, ...v })))

const confirmed = verdicts.filter(Boolean)
log(`verified: ${confirmed.map(v => `${v.key}=${v.real ? v.severity : 'refuted'}`).join(', ')}`)

const securityBlock = confirmed.map(v => `### ${v.key} — verifier: ${v.real ? 'REAL, ' + v.severity : 'NOT REAL'}
Finding: ${v.finding}
Verifier evidence: ${v.evidence}
Verifier corrections: ${v.corrections || '-'}
Recommended fix: ${v.recommendedFix}`).join('\n\n')

const FIX_LIST = `
A. SECURITY (each was checked by an independent verifier against the pinned GoTrue source — fix every one marked REAL; skip the ones marked NOT REAL and say so):

${securityBlock}

A-extra (small, fix as written):
- infra/supabase/provision.sh always writes KONG_TRUSTED_IPS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 but keeps whatever KONG_BIND the server's settings file has. With KONG_BIND other than 127.0.0.1 every client reaching Kong directly from a private address (IPv6 via docker-proxy, a neighbour in a 10.x provider network) could name any X-Real-IP and evade every Auth limit. Fix: provision.sh also forces KONG_BIND=127.0.0.1 with the proxy profile (or dies when it differs), with a test in the existing shell tests. Also infra/supabase/env.example says "(deploy-remote.sh sets it)" — it is provision.sh.
- src/core/account/pkce.ts: outside a secure context it falls back to the "plain" challenge method, which sends the verifier itself with the letter request. The app only runs in a secure context: throw AccountError('unavailable') instead of falling back (test first).
- Comments that promise more than is true — correct them: src/core/account/pkce.ts and docs/adr/0013 say a link read by somebody else signs nobody in (PKCE protects only the ?code= of the redirect; the letter itself — its code and its link token — is a bearer credential for its lifetime); src/core/account/authApi.ts (doc of requestLetter) says a new address gets an account "when the sign-in is completed", while the account is created when the letter is asked for (create_user: true) — which is why the age rule must come before the call; docs/adr/0013 line ~141 says modules and the engine need only useAccount()/useConsents()/getAccessToken() though the sync engine (#279) is not React — say that the engine reads the device's copy through core internals or will add its own readers in #279; docs/adr/0013 line ~157 says account.test.sh keeps the in-memory fake server (src/test/fakeAccountServer.ts) consistent with the migration — it does not test the fake; reword truthfully.

B. CLIENT STATE (each was reproduced by a reviewer with a throwaway test; write the failing test first, test name = the behaviour):
B1. src/core/account/consentStore.ts (recordConsent, ~lines 96-121): when the device's copy already holds a LATER row id of that kind than the row the server just stored (server restored from a backup, or another tab) the new row is not cached and the only correction is askServer(...).catch(() => undefined). If that GET fails, a WITHDRAWAL the server has stored (granted:false) leaves the device showing the consent as granted — and until #279 the client is the only check of the cloud consent. Fix: fail closed — when behind and the journal cannot be read, a withdrawal is still written into the copy. Add the withdrawal variant of the existing test (consents.test.ts ~219-249 covers only granted→granted).
B2. Same file: when the server answers 403 details:age_required to recordConsent while the device's copy says age is granted (age withdrawn on another device, server restored), the copy is never corrected and every retry fails the same way. Fix: on age_required from the server, refresh the copy from the journal (best effort) before rethrowing; assert the copy in the test (consents.test.ts ~358).
B3. Same file (~66-70 and ~112-118): a late server answer writes the consent copy back AFTER signOut() erased it, or over another user's copy after a switch of account. Fix: inside the rw transactions re-read account.session and write only when it is signedIn with the same userId (same idea as ifUnchanged in session.ts).
B4. src/core/account/authApi.ts (refreshSession) + session.ts (~136): ANY refresh answer that is not 5xx/429 becomes session_expired and erases a valid session on the device — e.g. Kong's 404 "no Route matched" during a deploy. Fix: erase only on Auth's own verdict that the session is over (400/401/403 with the error_code values GoTrue of this version really returns for a dead refresh token/session/user — check the upstream source for the exact codes); every other answer is AccountError('server') and keeps the session.
B5. src/core/account/http.ts: no request timeout, so signOut() can hang on a dead network before it erases anything, breaking "sign-out works offline". Fix: an abort timeout in send() (about 15 s) mapped to AccountError('network'); test with fake timers.
B6. src/test/fakeAccountServer.ts (~252 vs ~154): new journal rows get id journal.length+1, but delete_account removes rows, so ids are reused and a later withdrawal can get a lower id than an earlier grant. Fix: a counter that only grows.

NOT in this round (the orchestrator files issues for them — do not implement): forced token refresh + retry on a 401 from the API and the 401 of /logout; consents in force computed from at most the newest 1000 journal rows; \`details\` on SyncRequestError; link scanners burning the code; scheduled cleanup of accounts without a confirmed age; the server-side check of the cloud consent in sync_push; region choice at sign-in; container log retention; switching to a longer code (the acceptance criterion says six digits — keep six).`

const FIX_RESULT = {
  type: 'object',
  properties: {
    headSha: { type: 'string' },
    ciGreen: { type: 'boolean', description: 'true only if every check run on headSha finished green' },
    checkGreenLocally: { type: 'boolean' },
    fixed: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, what: { type: 'string' }, test: { type: 'string' } }, required: ['item', 'what', 'test'] } },
    notFixed: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, why: { type: 'string' } }, required: ['item', 'why'] } },
    residualRisks: { type: 'string', description: 'what remains true after the fixes (e.g. distributed guessing), in plain words — it goes to the owner' },
    notes: { type: 'string' },
  },
  required: ['headSha', 'ciGreen', 'checkGreenLocally', 'fixed', 'notFixed', 'residualRisks'],
}

const fixPrompt = (list, round) => `${COMMON}

You are the engineer who fixes review round ${round} of PR #311 on branch feat/278. The previous author is gone; three reviewers (boundaries, data loss, security) re-reviewed head d86958b and the items below must be fixed before the merge. Read \`scripts/agent.sh show 278\` and the PR description first (\`gh api repos/Manificento/Productivity/pulls/311 --jq .body\`).

Before anything: \`git fetch origin && git merge --no-edit origin/main\` in ${WT} (main has a new guard in src/test/setup.ts that fails a test ending with a pending database write). Never rebase, never force-push.

WHAT TO FIX
${list}

HOW
- TDD: for every item first a test that fails on the current code (name = the behaviour), then the fix. Client tests: vitest (\`npx vitest run <file>\`), time and network fixed/mocked, no test may end with a pending Dexie write. Server/infra items: extend the existing shell tests in infra/supabase/tests/ (account.test.sh, deploy-remote.test.sh, …) — they run in CI job by job (.github/workflows/infra.yml). A Docker daemon is running locally, so run the affected infra tests yourself the way infra/supabase/README.md and the workflow do (Docker Hub may answer 429 — retry; if Docker turns out unusable, rely on CI).
- Stay inside the zone of the issue: src/core/account/, src/core/sync/, infra/supabase/, .github/workflows/infra.yml, docs, plus the two files the PR already touches outside it (src/core/backup.ts, src/test/fakeAccountServer.ts). Do not weaken coverage thresholds, dependency-cruiser rules or lint; no .env* files; no secrets in the repo; GitHub Actions stay pinned by full SHA.
- Record every decision that changes the design (limits, expiry, IPv6 handling, password routes, residual risk of distributed code guessing) in docs/adr/0013-account-session-consents.md and keep infra/supabase/README.md, env.example and docs/architecture.md true to the code (there are tests that read these docs).
- \`npm run check\` must be green in ${WT} before you push (if the node_modules symlink causes trouble, run \`npm ci\` there). Commit with Conventional Commits in English (several small commits are fine); end every commit message with these two lines:
Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ALH91nyuYT662qF6fftLNT
- \`git push origin feat/278\`, then \`scripts/agent.sh ci 311\` (run it from ${WT}); if a job is red, read its log, fix the cause, push again — until every check is green. Never skip or disable a test.
- Then append to the PR description (read the current body, keep it, add at the end, before the footer lines) a section «## Ревью, раунд ${round + 1 > 2 ? 3 : 2}: что исправлено» in Russian, plain words: each fixed item with its test, and «Отложено в отдельные issue» with the NOT-in-this-round list. Use the GitHub MCP tool update_pull_request (load it with ToolSearch: select:mcp__github__update_pull_request) for owner "manificento", repo "productivity", pullNumber 311.
- Do NOT merge the PR, do NOT create issues, do NOT comment on issues.

Return the structured result: the pushed head SHA, whether CI is green on it, each item fixed with the test that proves it, anything you did not fix and why, and the residual risks in plain words.`

phase('Fix')
let fix = await agent(fixPrompt(FIX_LIST, 2), { label: 'fix #278 r2', phase: 'Fix', schema: FIX_RESULT, effort: 'high' })
if (!fix) return { stage: 'fix-failed', confirmed }

const REVIEW = {
  type: 'object',
  properties: {
    approve: { type: 'boolean', description: 'true when there are no blockers and no majors' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          location: { type: 'string' },
          problem: { type: 'string' },
          scenario: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'location', 'problem', 'fix'],
      },
    },
    checked: { type: 'string', description: 'what you ran and read' },
  },
  required: ['approve', 'findings', 'checked'],
}

const LENSES = [
  { key: 'security', text: `Lens: SECURITY of the fixes — Auth rate limits (per client vs global; IPv4 and IPv6 through Caddy; can one client still exhaust the region's letters or guess a code faster than the ADR now claims?), password routes closed without breaking the letter/code flow, KONG_BIND/KONG_TRUSTED_IPS in provision.sh, the PKCE change, nothing secret committed, workflow actions pinned. Check every claim the fix makes about GoTrue against the upstream source of the pinned version (curl https://proxy.golang.org/github.com/supabase/auth/@v/v2.197.0.zip, unpack under the scratchpad /tmp/claude-0/-home-user-Productivity/87374550-7021-512f-a789-ab410f65d4e2/scratchpad/ in a new directory) rather than from memory. Do the new shell tests really fail without the fix?` },
  { key: 'data', text: `Lens: DATA, STATE and BOUNDARIES of the fixes — the consent copy on the device (withdrawal fails closed; copy corrected on age_required; no write after sign-out or over another user's copy — look for new races the guards introduced, e.g. transactions spanning a network call), token refresh (a valid session is never erased by a non-Auth answer; a really dead session IS erased — are the error codes the ones GoTrue v2.197.0 returns?), the request timeout (signOut offline; does the timeout abort leave the shared refresh promise or a Dexie transaction hanging?), the fake server's ids, tests named after behaviour that would fail without the fix and do not end with pending Dexie writes; files outside the issue's zone; docs (ADR-0013, architecture.md, README) true to the code; coverage/deps/lint rules untouched. Run \`npx vitest run src/core/account src/core/sync src/core/backup.test.ts\` and \`npm run deps\`.` },
]

let review = []
for (let round = 2; round <= 3; round++) {
  phase('Re-review')
  review = (await parallel(LENSES.map(l => () =>
    agent(`${COMMON}

Re-review of review round ${round} fixes for issue #278. Head before the fixes: d86958b; the fixes are \`git log d86958b..HEAD\` / \`git diff d86958b..HEAD -- . ':!package-lock.json'\` in ${WT} (the range also contains a merge of origin/main — ignore files the PR itself does not change: \`git diff origin/main...HEAD --stat\`). The engineer's own report of what was fixed:
${JSON.stringify(fix.fixed, null, 1)}
Not fixed: ${JSON.stringify(fix.notFixed)}
Residual risks stated: ${fix.residualRisks}

The items they were asked to fix:
${FIX_LIST}

${l.text}

Do not edit files in the worktree (throwaway probes go under the scratchpad directory, outside the repo). A Docker daemon is running locally if you need the real stack (use your own compose project name, tear it down). Report only what you verified in the code, most severe first. Items listed as "NOT in this round" are deferred on purpose — do not raise them. blocker = a fix is wrong/unsafe or a criterion of the issue broke; major = likely bug or a fix whose test would pass without it; minor = clarity.`,
      { label: `re-review #278 r${round} ${l.key}`, phase: 'Re-review', schema: REVIEW, agentType: 'reviewer' })
      .then(r => r && { lens: l.key, ...r })))).filter(Boolean)

  const serious = review.flatMap(r => r.findings.filter(f => f.severity !== 'minor').map(f => ({ lens: r.lens, ...f })))
  log(`re-review r${round}: ${review.map(r => `${r.lens}=${r.approve ? 'approve' : 'changes'}`).join(', ')}; serious findings: ${serious.length}`)
  if (!serious.length || round === 3) break

  phase('Fix')
  const list = serious.map((f, i) => `${i + 1}. [${f.severity}] (${f.lens}) ${f.location} — ${f.problem}\n   Scenario: ${f.scenario || '-'}\n   Suggested fix: ${f.fix}`).join('\n')
  const next = await agent(fixPrompt(`The re-review of your predecessor's round-2 fixes (already pushed; see git log d86958b..HEAD) found these. Check each against the code first: fix what is real; if one is wrong, say why in notFixed with evidence.\n\n${list}`, 3),
    { label: 'fix #278 r3', phase: 'Fix', schema: FIX_RESULT, effort: 'high' })
  if (!next) break
  fix = { ...next, fixed: [...fix.fixed, ...next.fixed] }
}

return { confirmed, fix, review }
