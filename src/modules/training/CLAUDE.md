# Модуль `training`

Метка дорожки: `area:training`. Задачи: `scripts/agent.sh next training`.

- **Пишет в таблицы:** `programs`, `plannedSessions`, `workoutLogs` (удаление записи — `data/workouts.ts`). **Журнал тренировок (`workoutLogs`) — ТОЛЬКО через `saveWorkout()` из `src/core/logging/workout.ts`** (валидация zod; тот же путь использует `health` для импорта из Health Connect / HealthKit). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Читает:** `workoutLogs`, цели дня (`workoutIntensity`, позже `deload`).
- **Суть модуля:** программы и шаблоны → выполнение плана пишет журнал через `saveWorkout()` и ставит `plannedSessions.status = done` с `workoutLogId` → периодизация к дате события (SPEC 0.3, раздел 3 и 5.6).
- **Цели дня:** `useDailyTargets(todayKey())` из `src/core/adaptation/useDailyTargets.ts` — только чтение. Своих правил адаптации в модуле нет.
- **План на день:** `plannedSessions` с уникальной парой `&[programId+date]` (БД отклонит вторую сессию программы на тот же день — обновляй существующую в одной транзакции, как `saveSleep`); `exercises` — копия на день, правки программы историю не переписывают.
- **Журнал и формы** (#107): `components/WorkoutsTab`, `WorkoutForm`, `WorkoutCard`; предупреждение об интенсивности по целям
  дня — `logic/adaptation.ts`.
- **Программы** (#111): `logic/programs.ts` (шаблоны, план на 4 недели, разбор черновика), `data/programs.ts` (создание программы вместе с планом, архив удаляет будущие сессии, «Сегодня»), `components/ProgramsSection` + `ProgramForm`. План не продлевается сам: по окончании «Сегодня» показывает «План завершён» и кнопку продления (#183).
- **Выполнение сессии** (#112): `components/SessionRunner` (подходы, замена упражнения, «Завершить»), `logic/session.ts` (черновик → вход `saveWorkout()`), `data/programs.ts`: `completeSession` (журнал + статус `done` в одной транзакции), `skipMissedSessions` (прошедшие невыполненные → `skipped`, план не сдвигается), `replaceExercise` (только в этой сессии). Удаление записи журнала (`deleteWorkout`) возвращает связанную сессию в `planned`/`skipped`.
- **Периодизация** (#113): `logic/periodization.ts` — чистые правила по целям дня (`deload` → вес и объём −40 %, `rest` → совет перенести + «Всё равно выполнить», `light` → «сегодня легче» для RPE ≥ 7); `components/PlanOutlook` — план на 2 недели с отметками «Разгрузка» / «День отдыха» по целям будущих дат. Своих правил адаптации нет, только отображение целей. Подстройка сессии фиксируется при открытии (смена целей не сбрасывает отмеченные подходы). План на 2 недели — один живой запрос `useDailyTargetsRange(from, to)` (#182).
- **Пропуски и продление** (#183): `logic/plan.ts` (`rescheduleError`, `needsExtension` — меньше 7 дней до конца, `extensionPlan` — 4 недели по тем же дням недели с конца плана или с сегодня), `data/programs.ts` (`rescheduleSession`, `extendProgram`, `extendEndedPrograms`, `loadMissedSessions`), `components/MissedSessions` («пропущена» серым + «Перенести», одна сессия программы в день) и `ExtendPlan` (карточка «Продлить план на 4 недели»).
- **Адаптивный план** (#226): `logic/carry.ts` — `planCarryOver` (чистая): упражнения пропущенной сессии (за 2 недели) уходят в ближайшие сессии программы с объёмом −30 % и `carriedFrom`; не в разгрузку и не в день отдыха (цели дня), не раньше 48 ч после последней тренировки главной группы, одна перенесённая на главную группу в сессии, недельный объём каждой группы ≤ 120 % плана (перенесённые — не план), лишнее — в следующую сессию/неделю. Константы — там же. `data/carry.ts`: `applyCarryOver` (одна транзакция, пропуск помечается `carriedOut` — повторный запуск ничего не добавляет), `removeExercise` («Убрать» у перенесённого — не вернётся), `loadMuscleBalance`; `rescheduleSession` пропущенной сессии забирает её перенесённые копии. `logic/balance.ts` + `components/MuscleBalance` — «Баланс групп мышц» (план/факт за эту и прошлую неделю, «недобор»). Группы — `muscleGroups ?? muscleGroupsOf(name)` из `src/core/exercises.ts`.
- **Навигация:** блок открывается через «Блоки» (#106). Пока у блока нет полезной функции, он помечен «скоро»
  (`comingSoon: true` в `index.ts`); с первой полезной функцией `comingSoon` убрать (у этого блока уже снят). `navOrder` не задавать — это
  закреплённая вкладка нижней панели (не больше трёх), закрепление вкладок — отдельная issue.

Структура (создавай папки по мере надобности):

```
index.ts        манифест AppModule — не меняй path без issue type:contract
logic/          чистые функции + *.test.ts рядом (без React и Dexie — проверяет npm run deps)
data/           чтение/запись своих таблиц, хуки на useLiveQuery
components/     компоненты модуля (+ *.test.tsx)
*Page.tsx       страница; вложенные маршруты — <Routes> внутри страницы
```

Нельзя: импортировать `src/modules/<другой>/`, менять `src/core`, `src/ui`, `src/app`, добавлять зависимости.
