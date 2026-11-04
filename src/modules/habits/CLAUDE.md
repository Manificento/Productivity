# Модуль `habits`

Метка дорожки: `area:habits`. Задачи: `scripts/agent.sh next habits`.

- **Пишет в таблицы:** `habits`, `habitLogs`. Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** привычки с расписанием, отметки, серии, статистика.
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
