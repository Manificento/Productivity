# Модуль `health`

Метка дорожки: `area:health`. Задачи: `scripts/agent.sh next health`.

- **Пишет в таблицы:** `sleepLogs`, `foods`, `mealLogs`, `workoutLogs`. Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** журналы сна, еды (КБЖУ, Open Food Facts — единственный разрешённый внешний API) и тренировок.
- **Сон пишется ТОЛЬКО через `saveSleep()` (перенос ночи на другой день — `deleteSleep()` старой + `saveSleep()` новой) из `src/core/logging/sleep.ts`** (валидация и «одна запись на ночь»),
  удаление записи за ночь — `deleteSleep(log.id)` (кнопка `components/DeleteSleep.tsx`),
  интерпретация введённых часов — `sleepWindow()` из `src/core/logging/sleepTime.ts`. Тот же путь использует утренний экран `today`.
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
