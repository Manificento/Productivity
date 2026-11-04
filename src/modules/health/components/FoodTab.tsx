import { useState } from 'react';
import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card, Empty } from '../../../ui';
import { useDayMeals, useFoods, useRecentMeals } from '../data/food';
import {
  MEAL_KINDS,
  dayTotals,
  formatGrams,
  macrosFor,
  recentFoodIds,
  type Macros,
  type MealKind,
} from '../logic/nutrition';
import { AddFoodSheet } from './AddFoodSheet';

function MacrosLine({ m }: { m: Macros }) {
  return (
    <span className="tabular-nums">
      {formatGrams(m.kcal)} ккал · Б {formatGrams(m.protein)} · Ж {formatGrams(m.fat)} · У {formatGrams(m.carbs)}
    </span>
  );
}

/** «Еда»: today's meals with totals, quick add from recent foods, custom foods. */
export function FoodTab({ today = todayKey() }: { today?: DateKey }) {
  const foods = useFoods();
  const meals = useDayMeals(today);
  const recentMeals = useRecentMeals(today);
  const targets = useDailyTargets(today);
  const [adding, setAdding] = useState<MealKind>();

  if (!foods || !meals || !recentMeals) return <Empty>Загрузка…</Empty>;

  const byId = new Map(foods.map((f) => [f.id, f]));
  const totals = dayTotals(meals, byId);
  const recent = recentFoodIds(recentMeals).flatMap((id) => byId.get(id) ?? []);

  return (
    <>
      {targets && (
        <Card title="Цели дня">
          <p className="text-sm">
            Кофеин — до <strong>{targets.caffeineCutoff}</strong>
          </p>
          {targets.noNewFoods && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Сегодня лучше без новых продуктов</p>
          )}
        </Card>
      )}

      <section aria-label="Итого за день">
        <Card title="Итого за день">
          <p className="text-sm">
            <MacrosLine m={totals.day} />
          </p>
        </Card>
      </section>

      {MEAL_KINDS.map(({ kind, label }) => {
        const items = meals.filter((m) => m.kind === kind).flatMap((m) => m.items);
        return (
          <section key={kind} aria-label={label}>
            <Card title={label}>
              {items.length === 0 ? (
                <p className="mb-2 text-sm text-zinc-500">Пока пусто</p>
              ) : (
                <>
                  <ul className="mb-2 space-y-1 text-sm">
                    {items.map((item, i) => {
                      const food = byId.get(item.foodId);
                      return (
                        <li key={i} className="flex justify-between gap-2">
                          <span>
                            {food?.name ?? 'Удалённый продукт'}, {formatGrams(item.grams)} г
                          </span>
                          <span className="shrink-0 tabular-nums text-zinc-500">
                            {food ? `${formatGrams(macrosFor(food, item.grams).kcal)} ккал` : '—'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mb-2 text-xs text-zinc-500">
                    Итого: <MacrosLine m={totals.byKind[kind]} />
                  </p>
                </>
              )}
              <Button variant="secondary" className="w-full" onClick={() => setAdding(kind)}>
                + Добавить в «{label}»
              </Button>
            </Card>
          </section>
        );
      })}

      <AddFoodSheet
        kind={adding}
        date={today}
        foods={foods}
        recent={recent}
        noNewFoods={targets?.noNewFoods ?? false}
        onClose={() => setAdding(undefined)}
      />
    </>
  );
}
