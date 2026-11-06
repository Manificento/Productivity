# LifeOS

Блок «Продуктивность» будущего супер-приложения: задачи, привычки, учёт времени и Pomodoro,
журналы сна, еды и тренировок — и **слой адаптации**, который перестраивает весь режим под важное
событие (экзамен, дедлайн, собеседование).

PWA, local-first: данные хранятся только на устройстве, работает офлайн, ставится на домашний экран.

[![CI](https://github.com/Manificento/Productivity/actions/workflows/ci.yml/badge.svg)](https://github.com/Manificento/Productivity/actions/workflows/ci.yml)

## Быстрый старт

```bash
npm ci
npm run dev        # http://localhost:5173
npm run check      # все проверки качества
npm run e2e        # сквозные тесты в Chrome на экране телефона
```

## Документация

| Документ                                                     | О чём                                             |
| ------------------------------------------------------------ | ------------------------------------------------- |
| [SPEC](docs/SPEC.md)                                         | продукт: что строим, приоритеты, слой адаптации   |
| [Архитектура](docs/architecture.md)                          | модули, границы, поток данных, владение таблицами |
| [ADR](docs/adr/)                                             | ключевые решения и их причины                     |
| [Процесс](docs/process.md)                                   | Definition of Ready/Done, метки, ветки, коммиты   |
| [Агентам](CLAUDE.md)                                         | правила для ИИ-агентов                            |
| [Бэклог](https://github.com/Manificento/Productivity/issues) | пользовательские истории с критериями приёмки     |

## Как работают агенты

Работа — это GitHub Issues по дорожкам: `area:tasks`, `area:habits`, `area:time`, `area:health`, `area:today`,
`area:cognition`, `area:settings`, `area:infra`, а с [SPEC 0.3](docs/SPEC.md) — `area:nutrition`, `area:training`,
`area:meditation`, `area:notes`, `area:progress`.
Облачная сессия Claude Code получает команду `/lane tasks` и сама проходит дорожку:
issue → ветка → тесты и код → `npm run check` → PR → CI → независимое ревью → squash-слияние.
Подробности — [docs/process.md](docs/process.md).

## Деплой

Любой статический хостинг: команда сборки `npm run build`, папка `dist`. Рекомендуется Cloudflare Pages или
Netlify — подключите репозиторий, и каждый `main` будет публиковаться автоматически. На телефоне откройте
сайт и выберите «Добавить на главный экран».

### Android (Capacitor)

Тот же бандл в нативной оболочке ([ADR-0008](docs/adr/0008-web-and-native-one-codebase.md)). Нужны JDK 21 и
Android SDK (`ANDROID_HOME`):

```
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # android/app/build/outputs/apk/debug/app-debug.apk
```

CI собирает debug APK на каждом PR, который меняет `android/`, `src/core/platform.ts` или `capacitor.config.ts`,
и прикладывает его артефактом `lifeos-debug-apk` (workflow «Android»). iOS — после аккаунта Apple.
