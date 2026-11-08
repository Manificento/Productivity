# Supabase self-hosted — бэкенд LifeOS как код

Облачная часть по [ADR-0009](../../docs/adr/0009-backend-sync-health-data.md): Supabase в Docker на своём сервере,
**один регион (ячейка) — одно развёртывание**. Сейчас регион один — `kz` (данные в РК, ст. 12 закона № 94-V);
`eu` — staging только с синтетическими данными. Между регионами нет репликации и общих таблиц, у каждого свой Postgres
и свой Auth; общий только этот код.

В стеке только нужное: **Postgres**, **Auth** (GoTrue), **REST** (PostgREST) и шлюз **Kong**. Realtime, Storage,
imgproxy, Edge Runtime, Analytics и пулер убраны. Studio (админка базы) — по желанию, профилем `studio`.
Postgres не публикуется наружу: он доступен только внутри сети Docker.

| Файл                 | Что делает                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| `docker-compose.yml` | сервисы стека, версии образов закреплены                                            |
| `env.example`        | все настройки региона, **без секретов**                                             |
| `gen-env.sh`         | создаёт файл настроек со свежими секретами (пароль БД, JWT, ключи `anon`/`service`) |
| `deploy.sh`          | поднимает или обновляет стек, проверяет API и что Postgres закрыт                   |
| `backup.sh`          | `pg_dump` → gzip → шифрование → S3-совместимое хранилище; хранит 14 последних копий |
| `restore.sh`         | восстанавливает последнюю (или указанную) копию на новом пустом стеке               |
| `healthcheck.sh`     | проверяет контейнеры, API и диск; при проблеме — уведомление в webhook              |
| `tests/`             | проверки всего этого в CI (`.github/workflows/infra.yml`) или локально с Docker     |

Файл шаблона называется `env.example`, а не `.env.example`: агентам этого репозитория запрещено открывать файлы `.env*`.

## Разворот на VPS в Казахстане

Нужно: VPS в дата-центре на территории РК (2 vCPU, 4–8 ГБ, 40+ ГБ SSD; кандидаты — ADR-0009, раздел «Хостинг в
Казахстане»), домен, бакет объектного хранилища в РК (Yandex Object Storage, регион `kz1`), канал для уведомлений.

1. **Сервер.** Ubuntu 24.04, вход по SSH-ключу, файрвол: открыты только 22, 80 и 443.

   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/Manificento/Productivity.git /opt/lifeos
   cd /opt/lifeos/infra/supabase
   ```

2. **Настройки.** Секреты создаются на сервере и никуда не коммитятся; копию `.env` сохраните в менеджере паролей —
   без неё после потери сервера пользователям придётся войти заново (пароли и данные восстановятся из копии).

   ```bash
   ./gen-env.sh REGION=kz SUPABASE_PUBLIC_URL=https://api.example.kz \
     API_EXTERNAL_URL=https://api.example.kz/auth/v1 SITE_URL=https://app.example.kz > .env
   chmod 600 .env
   ```

   Затем допишите в `.env` SMTP (`SMTP_*`), бакет (`S3_*`, `AWS_*`) и `ALERT_WEBHOOK_URL`.

3. **Запуск.** `./deploy.sh` скачивает закреплённые образы, поднимает стек и проверяет, что `GET /auth/v1/health` и
   `GET /rest/v1/` отвечают 200, а порт Postgres не опубликован. Повторный запуск обновляет стек.

4. **Домен и TLS.** Kong слушает `127.0.0.1:8000`. Наружу его отдаёт обратный прокси с HTTPS, например Caddy:

   ```bash
   apt install -y caddy
   printf 'api.example.kz {\n  reverse_proxy 127.0.0.1:8000\n}\n' > /etc/caddy/Caddyfile
   systemctl reload caddy
   ```

5. **Расписание** (`crontab -e` от пользователя с доступом к Docker). Журналы — в системный журнал через `logger`
   (смотреть: `journalctl -t lifeos-backup`): у такого пользователя нет права писать в `/var/log`, и перенаправление
   туда молча отменило бы запуск. Если `backup.sh` упал, он сам шлёт уведомление на `ALERT_WEBHOOK_URL`.

   ```cron
   CRON_TZ=UTC
   # ежедневная копия в 22:00 UTC = 03:00 по Алматы
   0 22 * * * cd /opt/lifeos/infra/supabase && ./backup.sh 2>&1 | logger -t lifeos-backup
   # проверка каждые 5 минут
   */5 * * * * cd /opt/lifeos/infra/supabase && ./healthcheck.sh 2>&1 | logger -t lifeos-health
   ```

6. **Приложение.** Сборке клиента нужны адрес и публичный ключ региона — переменные `VITE_SUPABASE_URL_KZ` и
   `VITE_SUPABASE_ANON_KEY_KZ` (значения `SUPABASE_PUBLIC_URL` и `ANON_KEY` из `.env`). Регион пользователя берётся из
   его профиля (`src/core/sync/config.ts`); `SERVICE_ROLE_KEY` никогда не попадает в клиент.

Studio при необходимости: `docker compose --env-file .env -p lifeos-kz --profile studio up -d` и туннель
`ssh -L 3000:127.0.0.1:3000 <сервер>` → http://localhost:3000.

## Второй регион

Регион — это файл настроек, а не код:

```bash
./gen-env.sh REGION=eu KONG_HTTP_PORT=8001 SUPABASE_PUBLIC_URL=https://api.example.eu \
  API_EXTERNAL_URL=https://api.example.eu/auth/v1 > .env.eu
ENV_FILE=.env.eu ./deploy.sh
```

Каждый регион — отдельный проект Docker `lifeos-<регион>` со своими томами, ключами и бакетом для копий в своей
юрисдикции. Staging на Supabase Free (ЕС) разворачивать не нужно: это облачный проект, клиенту достаточно переменных
`VITE_SUPABASE_URL_EU` и `VITE_SUPABASE_ANON_KEY_EU`.

## Резервные копии

- Копия — сжатый и **зашифрованный** `pg_dump`: схема и данные `public` (данные приложения) и данные `auth` (пользователи, входы).
  Структура `auth` берётся из миграций GoTrue той же версии, поэтому копия восстанавливается на новом стеке.
- Шифрование — AES-256 (`openssl enc`, ключ из `BACKUP_ENCRYPTION_KEY` через PBKDF2) **до** отправки в бакет: утечка
  ключей бакета ничего не раскрывает. Ключ создаёт `gen-env.sh`; храните его в менеджере паролей **отдельно** от
  ключей бакета — без него ни одну копию не восстановить. Без ключа `backup.sh` не работает и шлёт уведомление: копия
  в открытом виде в бакет не попадает. Расшифровать вручную:
  `BACKUP_ENCRYPTION_KEY=… openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:BACKUP_ENCRYPTION_KEY < копия.sql.gz.enc | gunzip`.
- Имя: `lifeos-<регион>-<UTC-время>.sql.gz.enc` в `s3://$S3_BUCKET/lifeos/<регион>/` (префикс меняет `S3_PREFIX`).
  После загрузки остаются `BACKUP_KEEP` (по умолчанию 14) самых новых копий региона.
- Параметры хранилища — из переменных среды или `.env`: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Клиент S3 запускается из образа `amazon/aws-cli` — на сервере ничего
  ставить не нужно.
- Ошибка на любом шаге (`pg_dump`, загрузка, очистка старых копий) — код выхода не 0 и уведомление на
  `ALERT_WEBHOOK_URL`.
- **Ограничения.** В копию не попадают объекты вне `public`, привязанные к `auth` (например, триггер на `auth.users`), и свои
  расширения: когда появится серверная схема синхронизации, проверка восстановления должна применять её миграции
  и сверять такие объекты (#266).

**Восстановление после потери сервера:** новый сервер → шаги 1–3 с сохранённым `.env` → `./restore.sh` (последняя
копия) или `./restore.sh lifeos-kz-20261108T220000Z.sql.gz.enc` (нужен тот же `BACKUP_ENCRYPTION_KEY`). Скрипт откажется писать в базу, где уже есть таблицы
приложения или пользователи. На время загрузки API (Kong, Auth, REST) остановлен; копия загружается одной транзакцией:
при ошибке база остаётся пустой, а API запускается снова.

Восстановление проверяется в CI **каждую неделю** (workflow `Infra`, понедельник 03:17 UTC) и при каждом изменении
`infra/`: синтетический пользователь с заметками → копия в MinIO → стек удаляется → новый стек → `restore.sh` →
пользователь входит со старым паролем и видит свои заметки, чужие (без входа) не видны.

## Уведомления

`healthcheck.sh` ищет проблемы: сервис стека не создан, остановлен или `unhealthy`; `GET /auth/v1/health` не
отвечает; диск из `DISK_PATHS` заполнен на `DISK_ALERT_PERCENT` % и больше (по умолчанию 85). Если набор проблем
изменился, он шлёт `POST {"text": "…"}` на `ALERT_WEBHOOK_URL`, а когда всё снова в порядке — сообщение об этом.
Одинаковые проблемы не повторяются каждые 5 минут. Код выхода: 0 — всё хорошо, 1 — есть проблемы.

Подходит входящий webhook Slack или Mattermost, или Telegram-бот:
`ALERT_WEBHOOK_URL=https://api.telegram.org/bot<токен>/sendMessage?chat_id=<чат>`.

## Проверки локально

Нужен только Docker:

```bash
infra/supabase/tests/stack.test.sh           # состав стека, deploy, два региона, уведомления
infra/supabase/tests/backup-restore.test.sh  # копия в MinIO, 14 копий, восстановление на пустом стеке
```

Тесты поднимают стеки `lifeos-kz` и `lifeos-eu` на портах 8000 и 8001 и удаляют их вместе с томами.
