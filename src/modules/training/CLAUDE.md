# Модуль `training`

Метка дорожки: `area:training`. Задачи: `scripts/agent.sh next training`.

- **Пишет в таблицы:** `programs`, `plannedSessions`. **Журнал тренировок (`workoutLogs`) — ТОЛЬКО через `saveWorkout()` из `src/core/logging/workout.ts`** (валидация zod; тот же путь использует `health` для импорта из Health Connect / HealthKit). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Читает:** `workoutLogs`, цели дня (`workoutIntensity`, позже `deload`).
- **Суть модуля:** программы и шаблоны → выполнение плана пишет журнал через `saveWorkout()` и ставит `plannedSessions.status = done` с `workoutLogId` → периодизация к дате события (SPEC 0.3, раздел 3 и 5.6).
- **Цели дня:** `useDailyTargets(todayKey())` из `src/core/adaptation/useDailyTargets.ts` — только чтение. Своих правил адаптации в модуле нет.
- **План на день:** `plannedSessions` с уникальной парой `&[programId+date]` (БД отклонит вторую сессию программы на тот же день — обновляй существующую в одной транзакции, как `saveSleep`); `exercises` — копия на день, правки программы историю не переписывают.
- **Журнал и формы** пока живут в `health/components/Workouts*` — переезжают сюда issue #107 (`git mv`), не копируй их раньше.
- **Навигация:** модуль скрыт из нижней панели (`navOrder` не задан) до первой полезной функции; показать его — отдельная issue
  после контракта «навигация для 12 блоков» (#106).

Структура (создавай папки по мере надобности):

```
index.ts        манифест AppModule — не меняй path без issue type:contract
logic/          чистые функции + *.test.ts рядом (без React и Dexie — проверяет npm run deps)
data/           чтение/запись своих таблиц, хуки на useLiveQuery
components/     компоненты модуля (+ *.test.tsx)
*Page.tsx       страница; вложенные маршруты — <Routes> внутри страницы
```

Нельзя: импортировать `src/modules/<другой>/`, менять `src/core`, `src/ui`, `src/app`, добавлять зависимости.
