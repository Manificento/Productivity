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
    planned[nutrition · training · meditation<br/>notes · progress — каркасы SPEC 0.3]
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
  index.ts          манифест AppModule (маршрут, иконка, порядок в навигации, фоновый компонент Background)
  CLAUDE.md         владение, таблицы, ссылки на issues — читается агентом автоматически
  logic/            ЧИСТЫЕ функции: вычисления, правила, парсеры (+ *.test.ts рядом)
  data/             чтение/запись своих таблиц Dexie, хуки useLiveQuery
  components/       React-компоненты модуля
  <Name>Page.tsx    страница и вложенные маршруты
```

`Background` (необязательно) оболочка монтирует один раз на всех страницах, вне маршрутов: для работы,
которая идёт, пока открыт другой модуль (таймер Pomodoro модуля `time`). Он ничего не рисует или рисует маленький fixed-элемент.

Поток данных: **компонент → хук из `data/` → Dexie**; вычисления — **чистые функции из `logic/`**.
Это «функциональное ядро, императивная оболочка» ([ADR-0003](adr/0003-adaptation-as-pure-rules.md)):
всё, что можно ошибиться посчитать, тестируется без браузера и базы.

## Слой адаптации

```mermaid
flowchart LR
  ev[(lifeEvents)] --> load
  sl[(sleepLogs)] --> load
  ci[(checkIns)] --> load
  wl[(workoutLogs)] --> load
  bl[(settings:<br/>adaptation.baseline)] --> load
  load[loadDailyTargets] --> eng[computeDailyTargets<br/>чистая функция]
  eng --> dt{{DailyTargets}}
  dt --> t[tasks: ёмкость, фокус-проект]
  dt --> tm[time: норма Pomodoro]
  dt --> h[health: сон, тренировка, еда]
  dt --> td[today: цели и причины]
```

`workoutLogs` нужны правилу «вчера тяжёлая тренировка (RPE ≥ 8) → сегодня не выше умеренной»; полный список
правил — [SPEC, раздел 5.4](SPEC.md#54-правила-декларативные-расширяемые).

Модули только **читают** `DailyTargets`. Новое правило добавляется в `core/adaptation/rules.ts`
с тестом — ни один модуль не меняется.

## Владение таблицами

| Модуль     | Пишет в таблицы                                                                                                                                                       | Читает (кроме своих)                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| tasks      | `projects`, `tasks`                                                                                                                                                   | цели дня                             |
| habits     | `habits`, `habitLogs`                                                                                                                                                 | цели дня                             |
| time       | `timeCategories`, `timeEntries`, `settings` (`time.*`, например `time.pomodoro`)                                                                                      | `tasks`, цели дня                    |
| health     | `sleepLogs` (через `core/logging/saveSleep`), `foods`, `mealLogs`; `workoutLogs` — только через `core/logging/saveWorkout` (импорт из Health Connect / HealthKit, M7) | цели дня                             |
| today      | `lifeEvents`, `checkIns`, `settings` (`adaptation.*`); сон — только через `saveSleep`                                                                                 | все таблицы (сводка, инсайты)        |
| cognition  | `cognitiveTests`, `mindSessions`                                                                                                                                      | цели дня                             |
| settings   | `settings` (остальные ключи), импорт всех таблиц через `core/backup`                                                                                                  | все таблицы (экспорт)                |
| nutrition  | `weightLogs`, `settings` (`nutrition.*`); после переноса дневника еды (#107) — `foods`, `mealLogs`                                                                    | `sleepLogs`, `workoutLogs`, цели дня |
| training   | `programs`, `plannedSessions`; журнал — только через `core/logging/saveWorkout`                                                                                       | `workoutLogs`, цели дня              |
| meditation | `meditationSessions`                                                                                                                                                  | цели дня                             |
| notes      | `notes`                                                                                                                                                               | `projects`, `lifeEvents`             |
| progress   | `xpEvents`                                                                                                                                                            | все таблицы (только чтение)          |

Ключ `time.pomodoro.running` = `{ phase, startedAt, endsAt }` (мс) — идущая фаза Pomodoro; ключа нет, когда таймер
не идёт. Пишет `time`, читают все (например, «Сегодня»); `endsAt <= now` — не идёт.

Таблица `settings` делится по префиксу ключа: модуль пишет только свои ключи `<модуль>.*` (`adaptation.*` — today,
`time.*` — time, `nutrition.*` — nutrition), остальные ключи — модуль `settings`.

Читать можно любые таблицы. Общий путь записи для таблицы, которую заполняют два модуля, живёт в `src/core/logging/`
([ADR-0007](adr/0007-shared-write-paths.md)): `saveSleep()` (сон: health и утренний поток today) и `saveWorkout()`
(тренировки: training — ручная запись и выполнение плана, health — импорт из Health Connect / HealthKit).

Чистое правило, которое нужно двум модулям одинаково, тоже живёт в ядре, а не копируется: расписание привычек
(`isDue`, неделя с понедельника) — `src/core/habitSchedule.ts`, им считают и «Привычки», и «Привычки: X из Y» на «Сегодня».

## Расширение по SPEC 0.3

[SPEC 0.3](SPEC.md) добавляет пять блоков и переносит два журнала. Таблицы (Dexie v3) и каркасы модулей
`nutrition`, `training`, `meditation`, `notes`, `progress` созданы контрактной issue «каркасы блоков» (#105, веха M5):
маршруты работают и показывают «скоро», в навигации модули скрыты (`navOrder` не задан) до первой полезной функции.
Типы — `src/core/types.ts` (раздел «SPEC 0.3, 5.6»), владение — таблица выше.

Платформа: нативные возможности (будильник, датчики, уведомления, Health) доступны модулям только через
`src/core/platform.ts` ([ADR-0008](adr/0008-web-and-native-one-codebase.md)); флаги возможностей говорят,
что доступно на текущей платформе, модуль показывает объяснение вместо недоступной функции.

Навигация: при 12 блоках нижняя панель держит «Сегодня», закреплённые вкладки и «Все блоки»; манифест
`AppModule` получает группу блока (контрактная issue «навигация», веха M5).
