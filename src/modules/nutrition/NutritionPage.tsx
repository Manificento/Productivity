import { Card, Empty, Page } from '../../ui';

/** `/nutrition` — the block is not built yet: name, one line of what it will do, and «скоро». */
export function NutritionPage() {
  return (
    <Page title="Питание">
      <Card>
        <Empty>
          Блок «Питание» — скоро.
          <br />
          <span className="text-zinc-400 dark:text-zinc-500">
            Журнал веса и тренд, адаптивная оценка расхода энергии, цели по калориям и макросам по фазам события.
          </span>
        </Empty>
      </Card>
    </Page>
  );
}
