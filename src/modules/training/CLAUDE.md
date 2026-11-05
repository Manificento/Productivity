# Модуль `training`

Метка дорожки: `area:training`. Задачи: `scripts/agent.sh next training`.

- **Пишет в таблицы:** `programs`, `plannedSessions`, `workoutLogs` (удаление записи — `data/workouts.ts`). **Журнал тренировок (`workoutLogs`) — ТОЛЬКО через `saveWorkout()` из `src/core/logging/workout.ts`** (валидация zod; тот же путь использует `health` для импорта из Health Connect / HealthKit). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Читает:** `workoutLogs`, цели дня (`workoutIntensity`, позже `deload`).
- **Суть модуля:** программы и шаблоны → выполнение плана пишет журнал через `saveWorkout()` и ставит `plannedSessions.status = done` с `workoutLogId` → периодизация к дате события (SPEC 0.3, раздел 3 и 5.6).
- **Цели дня:** `useDailyTargets(todayKey())` из `src/core/adaptation/useDailyTargets.ts` — только чтение. Своих правил адаптации в модуле нет.
- **План на день:** `plannedSessions` с уникальной парой `&[programId+date]` (БД отклонит вторую сессию программы на тот же день — обновляй существующую в одной транзакции, как `saveSleep`); `exercises` — копия на день, правки программы историю не переписывают.
- **Журнал и формы** (#107): `components/WorkoutsTab`, `WorkoutForm`, `WorkoutCard`; предупреждение об интенсивности по целям
  дня — `logic/adaptation.ts`.
- **Программы** (#111): `logic/programs.ts` (шаблоны, план на 4 недели, разбор черновика), `data/programs.ts` (создание программы вместе с планом, архив удаляет будущие сессии, «Сегодня»), `components/ProgramsSection` + `ProgramForm`. План не продлевается сам: по окончании показывается «План закончился».
- **Выполнение сессии** (#112): `components/SessionRunner` (подходы, замена упражнения, «Завершить»), `logic/session.ts` (черновик → вход `saveWorkout()`), `data/programs.ts`: `completeSession` (журнал + статус `done` в одной транзакции), `skipMissedSessions` (прошедшие невыполненные → `skipped`, план не сдвигается), `replaceExercise` (только в этой сессии). Удаление записи журнала (`deleteWorkout`) возвращает связанную сессию в `planned`/`skipped`.
- **Периодизация** (#113): `logic/periodization.ts` — чистые правила по целям дня (`deload` → вес и объём −40 %, `rest` → совет перенести + «Всё равно выполнить», `light` → «сегодня легче» для RPE ≥ 7); `components/PlanOutlook` — план на 2 недели с отметками «Разгрузка» / «День отдыха» по `useDailyTargets(date)` будущих дат. Своих правил адаптации нет, только отображение целей.
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
