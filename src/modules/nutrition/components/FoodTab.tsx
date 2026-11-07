import { format } from 'date-fns';
import { useState } from 'react';
import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { useTodayKey } from '../../../core/dates';
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
import { cutoffPassed } from '../logic/diary';
import { AddFoodSheet } from './AddFoodSheet';
import { DayTargets } from './DayTargets';
import { MealItemSheet, type MealItemRef } from './MealItemSheet';

function MacrosLine({ m }: { m: Macros }) {
  return (
    <span className="tabular-nums">
      {formatGrams(m.kcal)} ккал · Б {formatGrams(m.protein)} · Ж {formatGrams(m.fat)} · У {formatGrams(m.carbs)}
    </span>
  );
}

/** «Еда»: today's meals with totals, quick add from recent foods, custom foods. */
export function FoodTab({
  today: todayProp,
  nowTime = format(new Date(), 'HH:mm'),
}: {
  today?: DateKey;
  /** 'HH:mm' now; injectable for tests. */
  nowTime?: string;
}) {
  // Follows local midnight while the screen stays open; tests may pin the day.
  const ownToday = useTodayKey();
  const today = todayProp ?? ownToday;
  const foods = useFoods();
  const meals = useDayMeals(today);
  const recentMeals = useRecentMeals(today);
  const targets = useDailyTargets(today);
  const [adding, setAdding] = useState<MealKind>();
  const [editing, setEditing] = useState<MealItemRef>();

  if (!foods || !meals || !recentMeals) return <Empty>Загрузка…</Empty>;

  const byId = new Map(foods.map((f) => [f.id, f]));
  const totals = dayTotals(meals, byId);
  const recent = recentFoodIds(recentMeals).flatMap((id) => byId.get(id) ?? []);

  return (
    <>
      <DayTargets targets={targets} eaten={totals.day} />

      <section aria-label="Итого за день">
        <Card title="Итого за день">
          <p className="text-sm">
            <MacrosLine m={totals.day} />
          </p>
        </Card>
      </section>

      {MEAL_KINDS.map(({ kind, label }) => {
        const items: MealItemRef[] = meals
          .filter((m) => m.kind === kind)
          .flatMap((m) =>
            m.items.map((it, index) => ({
              mealId: m.id,
              index,
              foodId: it.foodId,
              grams: it.grams,
              food: byId.get(it.foodId),
              mealLabel: label,
            })),
          );
        return (
          <section key={kind} aria-label={label}>
            <Card title={label}>
              {items.length === 0 ? (
                <p className="mb-2 text-sm text-zinc-500">Пока пусто</p>
              ) : (
                <>
                  <ul className="-mx-2 mb-2 text-sm">
                    {items.map((item) => {
                      const text = `${item.food?.name ?? 'Удалённый продукт'}, ${formatGrams(item.grams)} г`;
                      return (
                        <li key={`${item.mealId}/${item.index}`}>
                          <button
                            type="button"
                            aria-label={`Изменить: ${text}`}
                            onClick={() => setEditing(item)}
                            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            <span>{text}</span>
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {item.food ? `${formatGrams(macrosFor(item.food, item.grams).kcal)} ккал` : '—'}
                            </span>
                          </button>
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
        caffeineLate={targets ? cutoffPassed(nowTime, targets.caffeineCutoff, targets.wakeTime) : false}
        onClose={() => setAdding(undefined)}
      />
      <MealItemSheet item={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}
