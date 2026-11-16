import { describe, expect, it } from 'vitest';
import architecture from '../../../docs/architecture.md?raw';

/** The text of a `###` section of docs/architecture.md, from its heading to the next heading of the same level. */
function section(title: string): string {
  const start = architecture.search(new RegExp(`^### ${title}`, 'm'));
  if (start < 0) return '';
  const rest = architecture.slice(start + 4);
  const end = rest.search(/^#{2,3} /m);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('docs/architecture.md', () => {
  it('Given docs/architecture.md Then раздел «Синхронизация» с диаграммой потока и ссылкой на ADR-0009', () => {
    const sync = section('Синхронизация');
    expect(sync).toContain('](adr/0009-backend-sync-health-data.md)');
    expect(sync).toMatch(/```mermaid\nsequenceDiagram[\s\S]+sync_push[\s\S]+changes_since[\s\S]+```/);
    for (const name of ['buildPush', 'applyPull', 'merge', 'client.ts', 'protocol.ts', 'infra/supabase/migrations/']) {
      expect(sync).toContain(name);
    }
  });
});
