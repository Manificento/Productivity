# Модуль `health`

Метка дорожки: `area:health`. Задачи: `scripts/agent.sh next health`.

- **Пишет в таблицы:** `sleepLogs` (через `saveSleep`); позже — `workoutLogs` только через `saveWorkout` при импорте из Health Connect / HealthKit (M7). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** блок «Сон» — журнал сна, график и цель на ночь. Дневник еды переехал в `nutrition`, журнал тренировок — в `training` (#107).
- **Сон пишется ТОЛЬКО через `saveSleep()` (перенос ночи на другой день — `deleteSleep()` старой + `saveSleep()` новой) из `src/core/logging/sleep.ts`** (валидация и «одна запись на ночь»),
  удаление записи за ночь — `deleteSleep(log.id)` (кнопка `components/DeleteSleep.tsx`),
  интерпретация введённых часов — `sleepWindow()` из `src/core/logging/sleepTime.ts`. Тот же путь использует утренний экран `today`.
- **Импорт тренировок (M7)** пишет их ТОЛЬКО через `saveWorkout()` из `src/core/logging/workout.ts` (валидация zod, ADR-0007) — тот же путь использует блок `training`.
- **Цели дня:** `useDailyTargets(todayKey())` из `src/core/adaptation/useDailyTargets.ts` — только чтение.

Структура (создавай папки по мере надобности):

```
index.ts        манифест AppModule — не меняй path без issue type:contract
logic/          чистые функции + *.test.ts рядом (без React и Dexie — проверяет npm run deps)
data/           чтение/запись своих таблиц, хуки на useLiveQuery
components/     компоненты модуля (+ *.test.tsx)
*Page.tsx       страница; вложенные маршруты — <Routes> внутри страницы
```

Нельзя: импортировать `src/modules/<другой>/`, менять `src/core`, `src/ui`, `src/app`, добавлять зависимости.
