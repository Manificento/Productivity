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

### Подпись release-сборки Android

Google Play принимает только подписанную сборку (AAB). Подписывает её ключ загрузки владельца: он живёт у владельца
и в секретах окружения GitHub `android-release`, в репозитории его нет (`.gitignore` закрывает `*.jks`, `*.keystore`,
`*.p12`). Workflow «Android» собирает подписанные `app-release.aab` (для Play) и `app-release.apk` (для проверки на
отдельном тестовом телефоне — см. предупреждение ниже) при ручном запуске из `main` или по тегу `v*` на коммите из
истории `main`. На каждом PR путь подписи проверяется одноразовым ключом, созданным внутри задания.

> **Ключ нельзя терять.** Каждое обновление приложения в Play должно быть подписано тем же ключом. Храните файл
> keystore и оба пароля в двух местах вне репозитория (менеджер паролей и офлайн-копия). Если ключ загрузки всё же
> потерян или утёк, а в Play Console включена подпись приложений Google Play (по умолчанию для новых приложений),
> ключ загрузки можно сбросить через поддержку Play Console — это занимает дни. Никому не пересылайте ключ.

> **Не ставьте `app-release.apk` на свой основной телефон.** Debug APK, `app-release.apk` (ключ загрузки) и сборка из
> Play (с подписью приложений Google Play — ключ Google) — одно приложение `com.manificento.lifeos` с разными
> подписями. Android не обновляет приложение сборкой с другой подписью (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) и не
> ставит сборку с меньшим `versionCode`: остаётся только удалить приложение. Удаление стирает все данные LifeOS на
> телефоне — они живут только в нём, резервной копии Android нет (`allowBackup="false"`). Поэтому: на основной
> телефон — только из Play (внутреннее тестирование или internal app sharing, когда появится аккаунт, #223);
> `app-release.apk` и debug APK — на отдельное тестовое устройство. Если всё же меняете источник установки — сначала
> **Настройки → Резервная копия → «Экспорт в JSON»**, сохраните файл вне телефона, после установки — «Импорт из JSON».

1. **Создать keystore** (один раз, JDK 21; папка — вне репозитория):

   ```
   keytool -genkeypair -v -keystore ~/keys/lifeos-upload.jks -storetype PKCS12 \
     -alias lifeos-upload -keyalg RSA -keysize 4096 -validity 10000
   ```

   keytool спросит пароль и имя владельца. У PKCS12 один пароль на хранилище и ключ.

2. **Создать окружение `android-release`** — GitHub → Settings → Environments → New environment, имя
   `android-release`. В нём:
   - **Deployment branches and tags** → Selected branches and tags → добавить ветку `main` и тег `v*`. Так ключ получает
     только код из `main`: запуск из другой ветки GitHub не пустит, а шлюз задания дополнительно проверит, что тег
     стоит на коммите из истории `main`.
   - **Required reviewers** — по желанию себя: каждый release тогда ждёт вашего «Approve» в Actions.

   **Положить четыре секрета в это окружение** — там же, Environment secrets → Add environment secret (не «New
   repository secret»: секреты репозитория может прочитать workflow из любой ветки):

   | Секрет                      | Значение                                                                           |
   | --------------------------- | ---------------------------------------------------------------------------------- |
   | `ANDROID_KEYSTORE_BASE64`   | файл keystore в base64: `base64 -w0 ~/keys/lifeos-upload.jks` (macOS: `base64 -i`) |
   | `ANDROID_KEYSTORE_PASSWORD` | пароль keystore                                                                    |
   | `ANDROID_KEY_ALIAS`         | `lifeos-upload` (alias из шага 1)                                                  |
   | `ANDROID_KEY_PASSWORD`      | пароль ключа (у PKCS12 — тот же, что у keystore)                                   |

   Секреты не попадают в журнал (GitHub их маскирует), в сборки PR и в форки. Пока секретов нет, сборка release
   пропускается с уведомлением «Секретов подписи нет», CI зелёный; если задана только часть — запуск падает и
   называет недостающие.

3. **Запустить сборку** — Actions → Android → Run workflow (ветка `main`) или тегом на коммите из `main`:

   ```
   git switch main && git pull && git tag v0.1.0 && git push origin v0.1.0
   ```

   Запуск из другой ветки или тег на коммите не из `main` падает с ошибкой «Release только из main или тега v*» /
   «Тег не из истории main» — ключ ему не выдаётся.

   Задание «Android signed release (AAB + APK)» выгружает артефакт `lifeos-release-<номер запуска>`.
   `versionCode` — номер запуска workflow «Android» (растёт с каждым запуском, Play требует новый на каждую загрузку),
   `versionName` — тег без `v` или `version` из `package.json`. Задание проверяет подпись (`apksigner verify`, сертификат
   ключа из секретов), версию, права здоровья и политику конфиденциальности — так же, как у debug.

Локально (нужны JDK 21 и Android SDK) — те же переменные среды, путь к файлу вместо base64. `LIFEOS_VERSION_CODE` —
больше номера последнего запуска workflow «Android» (Actions → Android, номер вида `#123`; ниже — `124`): сборку с
меньшим `versionCode` Play не примет после любой загрузки из CI, а телефон не поставит поверх CI-сборки без удаления
приложения, которое стирает его данные (см. предупреждение выше).

```
npm run build && npx cap sync android
export ANDROID_KEYSTORE_FILE=~/keys/lifeos-upload.jks ANDROID_KEY_ALIAS=lifeos-upload LIFEOS_VERSION_CODE=124
read -rs ANDROID_KEYSTORE_PASSWORD && export ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
android/scripts/build-release.sh   # android/app/build/outputs/bundle/release/app-release.aab
```

Для загрузки в Play собирайте в CI: локальный `versionCode` легко совпадёт с номером одного из следующих запусков.

Вместо переменных среды подойдут свойства Gradle с теми же именами (`-PANDROID_KEY_ALIAS=…` или
`~/.gradle/gradle.properties` — вне репозитория). Без всех четырёх значений `assembleRelease` даёт неподписанный APK.
Проверка на одноразовом ключе, как в CI, — `android/scripts/test-release.sh`.
Аккаунт Google Play и публикация во внутренний тест — действие владельца (#223).
