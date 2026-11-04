/**
 * Architecture rules enforced in CI (`npm run deps`). See docs/adr/0002-modular-monolith.md.
 * A violation here means the change breaks a module boundary — fix the design, don't weaken the rule.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-imports',
      comment: 'A module must not import another module. Share data through the DB, logic through src/core.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/$1/' },
    },
    {
      name: 'core-is-independent',
      comment: 'src/core is the shared kernel: it must not depend on modules, the app shell or UI.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(modules|app|ui)/' },
    },
    {
      name: 'ui-is-independent',
      comment: 'The UI kit must stay generic: no modules, no app shell, no database.',
      severity: 'error',
      from: { path: '^src/ui/' },
      to: { path: '^src/(modules|app)/|^src/core/db' },
    },
    {
      name: 'modules-use-only-module-types-from-app',
      comment: 'Modules may only import the AppModule type from the shell.',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/app/', pathNot: '^src/app/moduleTypes\\.ts$' },
    },
    {
      name: 'logic-is-pure',
      comment:
        'Functional core: src/modules/*/logic and src/core/adaptation rules/engine are pure — no React, no Dexie, no DB.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/logic/|^src/core/adaptation/(engine|rules)\\.ts$' },
      to: { path: '^src/core/db\\.ts$|node_modules/(react|react-dom|dexie|dexie-react-hooks)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-test-imports-in-production',
      severity: 'error',
      from: { pathNot: '\\.test\\.tsx?$|^src/test/' },
      to: { path: '\\.test\\.tsx?$|^src/test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};
