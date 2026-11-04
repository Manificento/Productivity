# Модуль `settings`

Метка дорожки: `area:settings`. Задачи: `scripts/agent.sh next settings`.

- **Пишет в таблицы:** `settings` (кроме ключей `adaptation.*`, `time.*` и `nutrition.*` — они принадлежат модулям today, time и nutrition); импорт заменяет все таблицы через `core/backup`. Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** настройки, резервная копия, тема, демо-данные, импорт истории (#43).
- **Импорт истории:** задачи и проекты из Todoist — ТОЛЬКО через `importTasks({ projects, tasks }, { source: 'todoist' })` из
  `src/core/logging/tasks.ts` (парсер CSV — чистая функция в `logic/`, выдаёт `ImportTask[]` с `row` для сообщений об ошибках);
  ночи из Sleep Cycle — через `saveSleep()`. В `tasks` и `projects` напрямую не писать.
- **Демо-данные:** `logic/demo.ts` (чистая сборка 14 дней всех блоков + IELTS через 5 дней) → `data/demo.ts` загружает их через `importAll`, сохраняя строки `settings` пользователя. Таблицы каркасов SPEC 0.3 (`weightLogs`, `programs`, …) демо пока не заполняет — они очищаются; наполнять их — отдельные issues этой дорожки по мере роста блоков.
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
