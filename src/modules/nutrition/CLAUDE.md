# Модуль `nutrition`

Метка дорожки: `area:nutrition`. Задачи: `scripts/agent.sh next nutrition`.

- **Пишет в таблицы:** `weightLogs`, `settings` (только ключи `nutrition.*`: `nutrition.goal`, `nutrition.expenditure`, `nutrition.profile`), `foods`, `mealLogs` (дневник еды, перенесён из `health` в #107). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Читает:** `sleepLogs`, `workoutLogs`, цели дня.
- **Суть модуля:** журнал веса и тренд → адаптивный расход энергии и цели КБЖУ → цели по фазам в дневнике еды (SPEC 0.3, раздел 3 и 5.6). Ядро расход энергии не считает — это делает этот модуль и кладёт результат в `settings` `nutrition.expenditure`.
- **Цели дня:** `useDailyTargets(todayKey())` из `src/core/adaptation/useDailyTargets.ts` — только чтение. Своих правил адаптации в модуле нет.
- **Вес:** одна запись на день (`weightLogs.date` — уникальный индекс): при повторном вводе обновляй запись дня, а не добавляй вторую.
- **Дневник еды** (#107): `components/FoodTab` и формы, `data/food.ts`, поиск Open Food Facts — единственный разрешённый
  внешний API (`data/openFoodFacts.ts`, `logic/openFoodFacts.ts`).
- **Навигация:** блок открывается через «Блоки» (#106); `navOrder` не задавать — закрепление вкладок отдельная issue.

Структура (создавай папки по мере надобности):

```
index.ts        манифест AppModule — не меняй path без issue type:contract
logic/          чистые функции + *.test.ts рядом (без React и Dexie — проверяет npm run deps)
data/           чтение/запись своих таблиц, хуки на useLiveQuery
components/     компоненты модуля (+ *.test.tsx)
*Page.tsx       страница; вложенные маршруты — <Routes> внутри страницы
```

Нельзя: импортировать `src/modules/<другой>/`, менять `src/core`, `src/ui`, `src/app`, добавлять зависимости.
