# Модуль `today`

Метка дорожки: `area:today`. Задачи: `scripts/agent.sh next today`.

- **Пишет в таблицы:** `lifeEvents`, `checkIns`, `settings` (только ключи `adaptation.*`). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** главный экран, важные события, чек-ин, базовый режим, инсайты. Владеет и движком `src/core/adaptation/` — его можно ДОПОЛНЯТЬ правилами и полями (issues этой дорожки), но не переименовывать и не удалять существующие поля `DailyTargets`.
- **Утренний поток:** сон записывай только через `saveSleep()` + `sleepWindow()` из `src/core/logging/`;
  тест внимания — переход на `/cognition/pvt?return=/` (без импорта модуля `cognition`).
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

## Решения модуля

- **Онбординг (#41)** показывается на `/` при первом запуске: нет событий и нет `settings` `adaptation.onboardingDone`
  (`data/onboarding.ts`). «Начать» и «Пропустить» записывают отметку. Решение «показывать ли» фиксируется на весь
  визит (`TodayIndex`), чтобы созданное в онбординге событие не переключило экран до показа плана.
  Тесты, открывающие «Сегодня», записывают отметку в `beforeEach`; E2E — `skipOnboarding()` из `e2e/helpers.ts`.
