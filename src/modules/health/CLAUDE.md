# Модуль `health`

Метка дорожки: `area:health`. Задачи: `scripts/agent.sh next health`.

- **Пишет в таблицы:** `sleepLogs`, `foods`, `mealLogs`, `workoutLogs`. Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** журналы сна, еды (КБЖУ, Open Food Facts — единственный разрешённый внешний API) и тренировок.
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
