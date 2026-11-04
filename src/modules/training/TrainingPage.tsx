import { Card, Empty, Page } from '../../ui';

/** `/training` — the block is not built yet: name, one line of what it will do, and «скоро». */
export function TrainingPage() {
  return (
    <Page title="Тренировки">
      <Card>
        <Empty>
          Блок «Тренировки» — скоро.
          <br />
          <span className="text-zinc-400 dark:text-zinc-500">
            Программы и шаблоны, выполнение плана, прогрессия и разгрузка перед важным событием.
          </span>
        </Empty>
      </Card>
    </Page>
  );
}
