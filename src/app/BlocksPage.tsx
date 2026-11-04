import { Link } from 'react-router-dom';
import { Card, Chip, Page } from '../ui';
import { MODULE_GROUPS, MODULES } from './modules';
import type { ModuleGroup } from './moduleTypes';

/** Module root without the '/*' suffix. */
export function rootPath(path: string): string {
  return path.replace(/\/\*$/, '') || '/';
}

/** «Все блоки»: every module by group — icon, name and one line of what it is for. */
export function BlocksPage() {
  const groups = Object.entries(MODULE_GROUPS) as [ModuleGroup, string][];
  return (
    <Page title="Все блоки">
      {groups.map(([group, label]) => {
        const modules = MODULES.filter((m) => m.group === group);
        if (modules.length === 0) return null;
        return (
          <section key={group} aria-label={label}>
            <Card title={label}>
              <ul className="-my-1 flex flex-col">
                {modules.map((m) => (
                  <li key={m.id}>
                    <Link to={rootPath(m.path)} className="flex min-h-11 items-center gap-3 py-2">
                      <span aria-hidden className="text-2xl leading-none">
                        {m.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{m.title}</span>
                        <span className="block text-xs text-zinc-500">{m.summary}</span>
                      </span>
                      {m.comingSoon && <Chip>скоро</Chip>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </Page>
  );
}
