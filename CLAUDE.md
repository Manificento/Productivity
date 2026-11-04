# LifeOS — инструкции для агентов

Local-first PWA, блок «Продуктивность» супер-приложения. Владелец не пишет код руками:
код пишут агенты, поэтому он должен быть простым, покрытым тестами и не ломать чужие модули.

## Перед любой работой

- Что строим: `docs/SPEC.md` и `docs/product-decisions.md` (решения владельца — при сомнениях следуй им). Как устроено: `docs/architecture.md`. Почему так: `docs/adr/`.
- Как работаем (DoR, DoD, метки, ветки, коммиты): `docs/process.md`.
- Работа берётся **только из GitHub Issues**: `scripts/agent.sh next <area>` → `show <N>`.
  Делай ровно то, что в критериях приёмки issue. Идея сверх scope → новая issue, не код.

## Команды

```
npm run dev            # http://localhost:5173
npm run check          # формат, типы, линт, границы модулей, тесты + покрытие, сборка — перед каждым PR
npm run e2e            # Playwright, Chrome, экран 360×740 (для историй с UI)
npm run format         # Prettier (хук форматирует файлы автоматически после Write/Edit)
scripts/agent.sh …     # next | show | start | pr | ci | merge | block | comment
```

Слэш-команды: `/lane <area>` — автономно пройти дорожку; `/next <area>` — одна issue; `/ship` — выпустить PR.

## Жёсткие правила

1. **Своя зона.** Пиши только в `src/modules/<area>/` своей issue и в `e2e/`. Ядро (`src/core`, `src/ui`,
   `src/app`, конфиги, зависимости) меняется только issue с меткой `type:contract`.
2. **Свои таблицы.** Пиши только в таблицы своего модуля (таблица владения — `docs/architecture.md`). Читать можно все.
3. **Никаких импортов между модулями.** Проверяется `npm run deps` — не ослабляй правила, исправляй дизайн.
4. **Логика в `logic/` — чистая**: без React, без Dexie. БД — в `data/`, UI — в `components/`.
5. **Адаптация — только через `useDailyTargets(date)`.** Своих правил адаптации в модулях нет.
6. **Даты дней — только `DateKey` из `src/core/dates.ts`.** Никогда `toISOString().slice(0, 10)` (это UTC).
7. **TDD**: сначала тест по критерию приёмки (имя теста = критерий), потом код. Время и сеть в тестах — фиксированы/замоканы.
8. **Интерфейс** на русском, mobile-first (360 px, кнопки ≥ 44 px), тёмная тема (`dark:`), пустые и ошибочные состояния.
9. **Не пушь в `main` и не форсируй push.** Только ветка `feat/<N>` → PR → зелёный CI → ревью → `agent.sh merge`.
10. **Застрял — не гадай:** `scripts/agent.sh block <N> "<причина>"` и бери следующую issue.

## Стек

Vite · React 19 · TypeScript 6 strict · Tailwind v4 · Dexie · react-router (HashRouter) · date-fns · zod ·
Vitest + Testing Library + fake-indexeddb · Playwright · Prettier · oxlint · dependency-cruiser.
