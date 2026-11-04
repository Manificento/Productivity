import { Card, Empty, Page } from '../../ui';

/** `/meditation` — the block is not built yet: name, one line of what it will do, and «скоро». */
export function MeditationPage() {
  return (
    <Page title="Медитация">
      <Card>
        <Empty>
          Блок «Медитация» — скоро.
          <br />
          <span className="text-zinc-400 dark:text-zinc-500">
            Таймер, дыхательные паттерны, библиотека текстовых сессий и план по фазам события.
          </span>
        </Empty>
      </Card>
    </Page>
  );
}
