# Модуль `health`

Метка дорожки: `area:health`. Задачи: `scripts/agent.sh next health`.

- **Пишет в таблицы:** `sleepLogs` (через `saveSleep`); `settings` — только свои ключи `health.*` (будильник, импорт); `workoutLogs` — только через `saveWorkout` (импорт). Остальные таблицы — только чтение через `db` из `src/core/db.ts`.
- **Суть модуля:** блок «Сон» — журнал сна, график и цель на ночь. Дневник еды переехал в `nutrition`, журнал тренировок — в `training` (#107).
- **Сон пишется ТОЛЬКО через `saveSleep()` (перенос ночи на другой день — `deleteSleep()` старой + `saveSleep()` новой) из `src/core/logging/sleep.ts`** (валидация и «одна запись на ночь»),
  удаление записи за ночь — `deleteSleep(log.id)` (кнопка `components/DeleteSleep.tsx`),
  интерпретация введённых часов — `sleepWindow()` из `src/core/logging/sleepTime.ts`. Тот же путь использует утренний экран `today`.
- **Импорт тренировок (M7)** пишет их ТОЛЬКО через `saveWorkout()` из `src/core/logging/workout.ts` (валидация zod, ADR-0007) — тот же путь использует блок `training`.
- **Будильник** (#129): только через `platform.ts` (`setAlarm` / `cancelAlarm` / `onAlarmDismissed`). `logic/alarm.ts` — окно «6:30–7:00» из `wakeTime` и `wakeWindowMin` цели дня подъёма, следующий звонок — начало окна сегодня или завтра (умный момент внутри окна — после NV4), «Я встал» — сон с подъёмом во время выключения и отбоем из цели. `data/alarm.ts` — ключи `settings` этого модуля: `health.alarm` (вкл/выкл и на когда поставлен), `health.alarm.dismissal` (выключение, ещё не отвеченное «Я встал» / «Не сейчас»). `components/AlarmBackground` (фон модуля в `index.ts`): нативный будильник однократный — пока он включён, ставит следующий при каждом запуске приложения и сохраняет выключение. `components/AlarmCard` на «Сне»: окно, переключатель, «Я встал»; на вебе — «доступен в приложении для телефона».
- **Импорт из Health Connect / HealthKit** (#131): `logic/healthImport.ts` (30 дней, только основные ночи, оценка сна по умолчанию, RPE тренировки 5, минуты 1–1440), `data/healthImport.ts` (`connectHealthImport` — окно доступа + первый импорт, `runHealthImport`, `importIfDue` — не чаще раза в час; ключ `health.import`), `components/HealthImportCard` («Подключить» / «Обновить» / «Отключить», отказ — ошибка и ручной ввод) и `HealthImportBackground` (импорт при запуске и возвращении приложения: утром ночь уже записана, шаг «Сон» утреннего потока выполнен). Сон — через `saveSleep` с `sourceId` + `externalId` (#227: без дублей, ночь, записанная вручную, не перезаписывается), тренировки — через `saveWorkout` (#218). Фон модуля — `components/HealthBackground` (будильник + импорт).
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
