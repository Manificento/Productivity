# Модуль `settings`

Метка дорожки: `area:settings`. Задачи: `scripts/agent.sh next settings`.

- **Пишет в таблицы:** `settings` (кроме ключей `adaptation.*`); импорт заменяет все таблицы через `core/backup`. Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** настройки, резервная копия, тема, демо-данные.
- **Демо-данные:** `logic/demo.ts` (чистая сборка 14 дней всех блоков + IELTS через 5 дней) → `data/demo.ts` загружает их через `importAll`, сохраняя строки `settings` пользователя.
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
