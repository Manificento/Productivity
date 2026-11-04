# Архитектура LifeOS

Короткая карта системы. Почему она такая — в [ADR](adr/).

## Контекст

```mermaid
flowchart LR
  user([Пользователь<br/>телефон / ноутбук]) -->|PWA, офлайн| app[LifeOS<br/>в браузере]
  app -->|IndexedDB| db[(Локальная БД<br/>Dexie)]
  app -->|только поиск продуктов| off[Open Food Facts API]
  app -->|экспорт / импорт| file[[JSON-файл<br/>резервной копии]]
```

Сервера нет. Все данные — на устройстве пользователя ([ADR-0001](adr/0001-local-first-pwa.md)).

## Модульный монолит

```mermaid
flowchart TB
  subgraph shell[app — оболочка]
    router[Роутинг и навигация<br/>из манифестов модулей]
  end
  subgraph modules[modules — фичи, параллельная разработка]
    today[today<br/>адаптация, «Сегодня»]
    tasks[tasks]
    habits[habits]
    time[time]
    health[health]
    cognition[cognition<br/>тесты внимания и тренажёры]
    settings[settings]
    planned[nutrition · training · meditation<br/>notes · progress — SPEC 0.3, M5]
  end
  subgraph kernel[core — общее ядро]
    types[types.ts<br/>доменные типы]
    dbm[db.ts<br/>все таблицы]
    engine[adaptation/<br/>computeDailyTargets]
  end
  ui[ui — мини-кит]

  shell --> modules
  modules --> kernel
  modules --> ui
  today -. пишет .-> engine
```

Правила, которые проверяет CI (`npm run deps`, файл `.dependency-cruiser.cjs`):

| Правило                   | Смысл                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `no-cross-module-imports` | модуль не импортирует другой модуль; обмен данными — через БД |
| `core-is-independent`     | ядро не знает о модулях, оболочке и UI                        |
| `ui-is-independent`       | UI-кит не знает о модулях и БД                                |
| `logic-is-pure`           | `modules/*/logic/` и движок адаптации — без React и без БД    |
| `no-circular`             | нет циклических зависимостей                                  |

## Внутреннее устройство модуля

```
src/modules/<id>/
  index.ts          манифест AppModule (маршрут, иконка, порядок в навигации)
  CLAUDE.md         владение, таблицы, ссылки на issues — читается агентом автоматически
  logic/            ЧИСТЫЕ функции: вычисления, правила, парсеры (+ *.test.ts рядом)
  data/             чтение/запись своих таблиц Dexie, хуки useLiveQuery
  components/       React-компоненты модуля
  <Name>Page.tsx    страница и вложенные маршруты
```

Поток данных: **компонент → хук из `data/` → Dexie**; вычисления — **чистые функции из `logic/`**.
Это «функциональное ядро, императивная оболочка» ([ADR-0003](adr/0003-adaptation-as-pure-rules.md)):
всё, что можно ошибиться посчитать, тестируется без браузера и базы.

## Слой адаптации

```mermaid
flowchart LR
  ev[(lifeEvents)] --> load
  sl[(sleepLogs)] --> load
  ci[(checkIns)] --> load
  bl[(settings:<br/>adaptation.baseline)] --> load
  load[loadDailyTargets] --> eng[computeDailyTargets<br/>чистая функция]
  eng --> dt{{DailyTargets}}
  dt --> t[tasks: ёмкость, фокус-проект]
  dt --> tm[time: норма Pomodoro]
  dt --> h[health: сон, тренировка, еда]
  dt --> td[today: цели и причины]
```

Модули только **читают** `DailyTargets`. Новое правило добавляется в `core/adaptation/rules.ts`
с тестом — ни один модуль не меняется.

## Владение таблицами

| Модуль    | Пишет в таблицы                                                                       |
| --------- | ------------------------------------------------------------------------------------- |
| tasks     | `projects`, `tasks`                                                                   |
| habits    | `habits`, `habitLogs`                                                                 |
| time      | `timeCategories`, `timeEntries`                                                       |
| health    | `sleepLogs` (через `core/logging/saveSleep`), `foods`, `mealLogs`, `workoutLogs`      |
| today     | `lifeEvents`, `checkIns`, `settings` (`adaptation.*`); сон — только через `saveSleep` |
| cognition | `cognitiveTests`                                                                      |
| settings  | `settings` (остальные ключи), импорт всех таблиц через `core/backup`                  |

Читать можно любые таблицы. Общий путь записи для таблицы, которую заполняют два модуля, живёт в `src/core/logging/`
([ADR-0007](adr/0007-shared-write-paths.md)): сейчас это только сон.

## Расширение по SPEC 0.3

[SPEC 0.3](SPEC.md) добавляет пять блоков и переносит два журнала. Таблицы и каркасы появляются контрактной
issue «каркасы блоков» (веха M5); до её слияния этих модулей и таблиц **нет**, писать в них нельзя.

| Модуль (план) | Будет писать в таблицы                                                          | Читает                               |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| nutrition     | `weightLogs`, `settings` (`nutrition.*`); после переноса — `foods`, `mealLogs`  | `sleepLogs`, `workoutLogs`, цели дня |
| training      | `programs`, `plannedSessions`; журнал — только через `core/logging/saveWorkout` | `workoutLogs`, цели дня              |
| meditation    | `meditationSessions`                                                            | цели дня                             |
| cognition     | `cognitiveTests`, `mindSessions` (новая)                                        | цели дня                             |
| notes         | `notes`                                                                         | `projects`, `lifeEvents`             |
| progress      | `xpEvents`                                                                      | все таблицы (только чтение)          |
| health        | после переноса — только `sleepLogs` через `saveSleep`                           | цели дня                             |

Второй общий путь записи — `saveWorkout()`: журнал тренировок заполняют `health` (ручная запись, импорт из
Health Connect / HealthKit) и `training` (выполнение плана).

Платформа: нативные возможности (будильник, датчики, уведомления, Health) доступны модулям только через
`src/core/platform.ts` ([ADR-0008](adr/0008-web-and-native-one-codebase.md)); флаги возможностей говорят,
что доступно на текущей платформе, модуль показывает объяснение вместо недоступной функции.

Навигация: при 12 блоках нижняя панель держит «Сегодня», закреплённые вкладки и «Все блоки»; манифест
`AppModule` получает группу блока (контрактная issue «навигация», веха M5).
