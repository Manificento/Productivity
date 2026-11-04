import { Card, Empty, Page } from '../../ui';

/** `/progress` — the block is not built yet: name, one line of what it will do, and «скоро». */
export function ProgressPage() {
  return (
    <Page title="Прогресс">
      <Card>
        <Empty>
          Блок «Прогресс» — скоро.
          <br />
          <span className="text-zinc-400 dark:text-zinc-500">
            Опыт и уровни поверх всех блоков, навыки по блокам, ежедневные квесты из целей дня.
          </span>
        </Empty>
      </Card>
    </Page>
  );
}
