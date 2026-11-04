# Модуль `tasks`

Метка дорожки: `area:tasks`. Задачи: `scripts/agent.sh next tasks`.

- **Пишет в таблицы:** `projects`, `tasks` — напрямую через `data/`. Импорт истории (Todoist, модуль `settings`) пишет в них
  ТОЛЬКО через `importTasks()` из `src/core/logging/tasks.ts` (ADR-0007, #150): zod-валидация, привязка к существующему проекту по имени,
  повторный импорт обновляет задачу по `[source+externalId]`. Поля `Task.source?` / `Task.externalId?` модуль не трогает.
  Правило «одно и то же имя проекта» — `sameProjectName` из `src/core/projectNames.ts`, общее с импортом. Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** задачи, проекты, повторы, быстрый ввод на русском. Учитывает ёмкость дня и фокус-проект из целей.
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

## Повторяющиеся задачи — связь с копией

Выполнение повторяющейся задачи создаёт копию в той же транзакции и с тем же `now`, поэтому
`copy.createdAt === original.completedAt` — это и есть связь (см. `logic/recurrence.ts`, `isNextCopyOf`).
Не меняй `createdAt` при редактировании и не создавай копии с другим временем — иначе снятие отметки
не найдёт копию. Название в связи не участвует: его можно редактировать.
