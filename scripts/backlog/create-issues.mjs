#!/usr/bin/env node
/**
 * Seeds GitHub labels, milestones and issues from backlog.mjs. Idempotent: re-running skips
 * labels, milestones and issues that already exist (issues are matched by a hidden backlog key).
 * Uses only the REST API through `gh api` (GraphQL is blocked in Claude Code cloud sessions).
 *
 *   node scripts/backlog/create-issues.mjs            # create
 *   node scripts/backlog/create-issues.mjs --dry-run  # print what would be created
 *   node scripts/backlog/create-issues.mjs --update=HL2,HL5  # also rewrite title/body/labels/milestone of existing issues
 */
import { execFileSync } from 'node:child_process';
import { BACKLOG, MILESTONES } from './backlog.mjs';

const REPO = process.env.REPO ?? 'Manificento/Productivity';
const DRY = process.argv.includes('--dry-run');
const UPDATE = new Set(
  (process.argv.find((a) => a.startsWith('--update=')) ?? '--update=')
    .slice('--update='.length)
    .split(',')
    .filter(Boolean),
);

const LABELS = [
  ...[
    'core',
    'tasks',
    'habits',
    'time',
    'health',
    'today',
    'cognition',
    'settings',
    'infra',
    // SPEC 0.3
    'nutrition',
    'training',
    'meditation',
    'notes',
    'progress',
  ].map((a) => ({
    name: `area:${a}`,
    color: '1d76db',
    description: `Lane: ${a}`,
  })),
  { name: 'type:feature', color: '0e8a16', description: 'User-facing functionality' },
  { name: 'type:bug', color: 'd73a4a', description: 'Something is broken' },
  { name: 'type:chore', color: 'c5def5', description: 'Tooling, infra, tests' },
  { name: 'type:contract', color: 'b60205', description: 'Changes shared core (src/core, src/ui, src/app, config)' },
  { name: 'priority:P0', color: 'e99695', description: 'MVP' },
  { name: 'priority:P1', color: 'f9d0c4', description: 'Next release' },
  { name: 'priority:P2', color: 'fef2c0', description: 'Later' },
  { name: 'size:S', color: 'ededed', description: '≤ 1 h of agent work' },
  { name: 'size:M', color: 'd4c5f9', description: '≤ 3 h of agent work' },
  { name: 'size:L', color: 'bfd4f2', description: '≤ 1 day of agent work' },
  { name: 'status:in-progress', color: 'fbca04', description: 'An agent is working on it' },
  { name: 'status:blocked', color: '000000', description: 'Needs a human decision — see comments' },
];

function gh(args, input) {
  if (DRY) return '[]';
  return execFileSync('gh', ['api', ...args], {
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: 'utf8',
  });
}

/**
 * Reads every page by explicit `page=N`. `gh api --paginate` follows the Link header, which points at
 * `repositories/{id}/…` URLs — the proxy in Claude Code cloud sessions rejects those (HTTP 403).
 */
function paged(path) {
  if (DRY) return [];
  const perPage = Number(/per_page=(\d+)/.exec(path)?.[1] ?? 30);
  const all = [];
  for (let page = 1; ; page++) {
    const chunk = JSON.parse(execFileSync('gh', ['api', `${path}&page=${page}`], { encoding: 'utf8' }));
    all.push(...chunk);
    if (chunk.length < perPage) return all;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Finds an issue created from this backlog key (a failed POST may still have created it). */
function findByKey(key) {
  // Search every issue, not just the latest page: a timed-out POST can land a few seconds later.
  return paged(`repos/${REPO}/issues?state=all&per_page=100`).find((i) =>
    (i.body ?? '').includes(`backlog-key: ${key} `),
  )?.number;
}

/** POST with retries on 5xx; never creates duplicates. */
function createIssue(key, payload) {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(gh([`repos/${REPO}/issues`, '--input', '-'], payload)).number;
    } catch (e) {
      sleep(10000 * attempt);
      const existing = findByKey(key);
      if (existing) return existing;
      if (attempt >= 4) throw e;
      console.log(`retry  ~ ${key} (attempt ${attempt + 1})`);
    }
  }
}

function labelsFor(item) {
  return [`area:${item.area}`, `type:${item.type ?? 'feature'}`, `priority:${item.priority}`, `size:${item.size}`];
}

function bodyFor(item, numbers) {
  const deps = [
    ...(item.deps ?? []).map((k) => `#${numbers.get(k) ?? `<${k}>`}`),
    // Issues that were not created from the backlog (e.g. filed by an agent), by number.
    ...(item.depIssues ?? []).map((n) => `#${n}`),
  ];
  return [
    '## История',
    item.story,
    '',
    '## Критерии приёмки',
    ...item.ac.map((c) => `- [ ] ${c}`),
    '',
    ...(item.notes?.length ? ['## Технические заметки', ...item.notes.map((n) => `- ${n}`), ''] : []),
    ...(deps.length ? [`Зависит от: ${deps.join(', ')}`, ''] : []),
    ...(item.out ? ['## Не входит в задачу', item.out, ''] : []),
    '---',
    `Definition of Done — [docs/process.md](https://github.com/${REPO}/blob/main/docs/process.md). Модуль: \`src/modules/${item.area}/\`.`,
    `<!-- backlog-key: ${item.key} -->`,
  ].join('\n');
}

// Labels
const existingLabels = new Set(paged(`repos/${REPO}/labels?per_page=100`).map((l) => l.name));
for (const l of LABELS) {
  if (existingLabels.has(l.name)) continue;
  gh([`repos/${REPO}/labels`, '--input', '-'], l);
  console.log(`label  + ${l.name}`);
}

// Milestones
const milestoneNumbers = new Map(
  paged(`repos/${REPO}/milestones?state=all&per_page=100`).map((m) => [m.title, m.number]),
);
for (const m of MILESTONES) {
  if (milestoneNumbers.has(m.title)) continue;
  const created = JSON.parse(gh([`repos/${REPO}/milestones`, '--input', '-'], m));
  milestoneNumbers.set(m.title, created.number ?? 0);
  console.log(`milestone + ${m.title}`);
}

// Issues (backlog order is topological: dependencies come first)
const numbers = new Map();
for (const issue of paged(`repos/${REPO}/issues?state=all&per_page=100`)) {
  const key = /backlog-key: (\w+)/.exec(issue.body ?? '')?.[1];
  if (key) numbers.set(key, issue.number);
}
for (const item of BACKLOG) {
  if (numbers.has(item.key)) {
    const n = numbers.get(item.key);
    if (UPDATE.has(item.key)) {
      // Keep workflow labels (status:*) that agents may have set; rewrite everything else from the backlog.
      const current = DRY ? [] : JSON.parse(gh([`repos/${REPO}/issues/${n}`])).labels.map((l) => l.name);
      const keep = current.filter((l) => l.startsWith('status:'));
      gh([`repos/${REPO}/issues/${n}`, '-X', 'PATCH', '--input', '-'], {
        title: item.title,
        body: bodyFor(item, numbers),
        labels: [...labelsFor(item), ...keep],
        milestone: milestoneNumbers.get(item.milestone),
      });
      console.log(`issue  ~ ${item.key} #${n} updated`);
    } else {
      console.log(`issue  = ${item.key} #${n} (exists)`);
    }
    continue;
  }
  const missing = (item.deps ?? []).filter((k) => !numbers.has(k) && !DRY);
  if (missing.length) throw new Error(`${item.key}: dependencies not created yet: ${missing.join(', ')}`);
  const payload = {
    title: item.title,
    body: bodyFor(item, numbers),
    labels: labelsFor(item),
    milestone: milestoneNumbers.get(item.milestone),
  };
  if (DRY) {
    console.log(`issue  + ${item.key} ${item.title}\n${payload.body}\n`);
    continue;
  }
  const number = createIssue(item.key, payload);
  numbers.set(item.key, number);
  console.log(`issue  + ${item.key} #${number} ${item.title}`);
  sleep(1500); // stay under GitHub's secondary rate limit for content creation
}
