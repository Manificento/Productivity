import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import {
  advance,
  DEFAULT_POMODORO,
  IDLE,
  parsePomodoroSettings,
  remainingMs,
  restoreSettings,
  restoreState,
  sessionInCycle,
  startFocus,
  stop,
  type PomodoroState,
} from './pomodoro';

const MIN = 60_000;
const T0 = atLocalTime('2026-11-02', '09:00');
const target = { categoryId: 'study', taskId: 'task-1' };

/** Runs a full focus + break cycle starting at `at`; returns the idle state and the time it ended. */
function cycle(state: PomodoroState, at: number, settings = DEFAULT_POMODORO) {
  const running = startFocus(state, settings, target, at);
  const r = advance(running, settings, at + 60 * 60 * MIN);
  return r;
}

describe('pomodoro', () => {
  it('настройки по умолчанию: 25 мин работы, затем 5 мин отдыха; после 4 сессий — 15 мин', () => {
    let s = startFocus(IDLE, DEFAULT_POMODORO, target, T0);
    expect(s).toMatchObject({ status: 'running', phase: 'work', endsAt: T0 + 25 * MIN });

    // a second before the end the session is still running
    expect(advance(s, DEFAULT_POMODORO, T0 + 25 * MIN - 1000).state).toBe(s);

    let r = advance(s, DEFAULT_POMODORO, T0 + 25 * MIN);
    expect(r.state).toMatchObject({ status: 'running', phase: 'shortBreak', endsAt: T0 + 30 * MIN, completedWork: 1 });
    expect(r.finished).toEqual([{ phase: 'work', endedAt: T0 + 25 * MIN }]);

    r = advance(r.state, DEFAULT_POMODORO, T0 + 30 * MIN);
    expect(r.state).toEqual({ status: 'idle', completedWork: 1, idleSince: T0 + 30 * MIN });
    expect(r.finished).toEqual([{ phase: 'shortBreak', endedAt: T0 + 30 * MIN }]);

    s = r.state;
    const breaks: string[] = [];
    for (let i = 2; i <= 4; i++) {
      const at = (s.status === 'idle' && s.idleSince !== undefined ? s.idleSince : T0) + MIN;
      const focus = startFocus(s, DEFAULT_POMODORO, target, at);
      const afterWork = advance(focus, DEFAULT_POMODORO, at + 25 * MIN).state;
      if (afterWork.status !== 'running') throw new Error('break expected');
      breaks.push(`${afterWork.phase}:${(afterWork.endsAt - afterWork.startedAt) / MIN}`);
      s = advance(afterWork, DEFAULT_POMODORO, afterWork.endsAt).state;
    }
    expect(breaks).toEqual(['shortBreak:5', 'shortBreak:5', 'longBreak:15']);
    expect(s).toMatchObject({ status: 'idle', completedWork: 4 });
    // the fifth session starts a new cycle with a short break again
    const fifth = advance(
      startFocus(s, DEFAULT_POMODORO, target, T0 + 9 * 60 * MIN),
      DEFAULT_POMODORO,
      T0 + 10 * 60 * MIN,
    );
    expect(fifth.finished.map((f) => f.phase)).toEqual(['work', 'shortBreak']);
  });

  it('выбрана задача: завершённая фокус-сессия даёт запись с taskId', () => {
    const r = advance(startFocus(IDLE, DEFAULT_POMODORO, target, T0), DEFAULT_POMODORO, T0 + 25 * MIN);
    expect(r.records).toEqual([
      { categoryId: 'study', taskId: 'task-1', start: T0, end: T0 + 25 * MIN, date: '2026-11-02' },
    ]);
  });

  it('без задачи запись не содержит taskId', () => {
    const r = cycle(IDLE, T0);
    const noTask = advance(
      startFocus(IDLE, DEFAULT_POMODORO, { categoryId: 'work' }, T0),
      DEFAULT_POMODORO,
      T0 + 25 * MIN,
    );
    expect(r.records).toHaveLength(1);
    expect(noTask.records[0]).not.toHaveProperty('taskId');
  });

  it('вкладка в фоне 10 минут: оставшееся время считается по меткам времени', () => {
    const s = startFocus(IDLE, DEFAULT_POMODORO, target, T0);
    const back = advance(s, DEFAULT_POMODORO, T0 + 10 * MIN);
    expect(remainingMs(back.state, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(IDLE, T0)).toBe(0);
  });

  it('вкладка в фоне дольше фокуса и перерыва: догоняет все фазы сразу', () => {
    const r = cycle(IDLE, T0);
    expect(r.finished.map((f) => f.phase)).toEqual(['work', 'shortBreak']);
    expect(r.records).toHaveLength(1);
    expect(r.state).toEqual({ status: 'idle', completedWork: 1, idleSince: T0 + 30 * MIN });
  });

  it('новые длительности применяются со следующей сессии', () => {
    const custom = { ...DEFAULT_POMODORO, workMin: 50, shortBreakMin: 10 };
    const running = startFocus(IDLE, DEFAULT_POMODORO, target, T0);
    // settings changed mid-session: the current focus keeps its 25 min, the break uses the new 10 min
    const r = advance(running, custom, T0 + 25 * MIN);
    expect(r.state).toMatchObject({ phase: 'shortBreak', endsAt: T0 + 35 * MIN });
    expect(startFocus(IDLE, custom, target, T0)).toMatchObject({ endsAt: T0 + 50 * MIN });
  });

  it('стоп во время фокуса записывает уже прошедшее время (от минуты)', () => {
    const s = startFocus(IDLE, DEFAULT_POMODORO, target, T0);
    expect(stop(s, T0 + 12 * MIN)).toEqual({
      state: { status: 'idle', completedWork: 0, idleSince: T0 + 12 * MIN },
      records: [{ categoryId: 'study', taskId: 'task-1', start: T0, end: T0 + 12 * MIN, date: '2026-11-02' }],
    });
    expect(stop(s, T0 + 30_000).records).toEqual([]);
    expect(stop(IDLE, T0)).toEqual({ state: IDLE, records: [] });
  });

  it('стоп во время перерыва ничего не записывает', () => {
    const brk = advance(startFocus(IDLE, DEFAULT_POMODORO, target, T0), DEFAULT_POMODORO, T0 + 25 * MIN).state;
    expect(stop(brk, T0 + 27 * MIN)).toEqual({
      state: { status: 'idle', completedWork: 1, idleSince: T0 + 27 * MIN },
      records: [],
    });
  });

  it('номер сессии в цикле', () => {
    expect(sessionInCycle(IDLE, DEFAULT_POMODORO, T0)).toBe(1);
    const running = startFocus({ status: 'idle', completedWork: 3 }, DEFAULT_POMODORO, target, T0);
    expect(sessionInCycle(running, DEFAULT_POMODORO, T0)).toBe(4);
    const longBreak = advance(running, DEFAULT_POMODORO, T0 + 25 * MIN).state;
    expect(sessionInCycle(longBreak, DEFAULT_POMODORO, T0 + 25 * MIN)).toBe(4);
    expect(sessionInCycle({ status: 'idle', completedWork: 4 }, DEFAULT_POMODORO, T0)).toBe(1);
  });

  it('после долгой паузы (например, на следующее утро) цикл начинается заново', () => {
    const evening = { status: 'idle' as const, completedWork: 3, idleSince: atLocalTime('2026-11-02', '22:00') };
    const morning = atLocalTime('2026-11-03', '08:00');
    expect(sessionInCycle(evening, DEFAULT_POMODORO, morning)).toBe(1);
    expect(startFocus(evening, DEFAULT_POMODORO, target, morning)).toMatchObject({ completedWork: 0 });
    // a short pause keeps the cycle
    const soon = evening.idleSince + 20 * MIN;
    expect(startFocus(evening, DEFAULT_POMODORO, target, soon)).toMatchObject({ completedWork: 3 });
  });
});

describe('parsePomodoroSettings', () => {
  const valid = { workMin: '50', shortBreakMin: '10', longBreakMin: '20', sessionsBeforeLongBreak: '3' };

  it('сохраняет целые значения в допустимых пределах', () => {
    expect(parsePomodoroSettings(valid)).toEqual({
      ok: true,
      value: { workMin: 50, shortBreakMin: 10, longBreakMin: 20, sessionsBeforeLongBreak: 3 },
    });
  });

  it.each([
    ['workMin', '0'],
    ['workMin', '181'],
    ['shortBreakMin', '2.5'],
    ['longBreakMin', ''],
    ['sessionsBeforeLongBreak', 'abc'],
  ] as const)('%s = «%s» — ошибка у этого поля', (field, value) => {
    const r = parsePomodoroSettings({ ...valid, [field]: value });
    expect(r).toMatchObject({ ok: false, field });
  });
});

describe('restore', () => {
  it('восстанавливает сохранённое состояние и отбрасывает испорченное', () => {
    const running = startFocus({ status: 'idle', completedWork: 2 }, DEFAULT_POMODORO, target, T0);
    expect(restoreState(JSON.parse(JSON.stringify(running)))).toEqual(running);
    expect(restoreState({ status: 'idle', completedWork: 3 })).toEqual({ status: 'idle', completedWork: 3 });
    expect(restoreState({ status: 'idle', completedWork: 3, idleSince: 7 })).toEqual({
      status: 'idle',
      completedWork: 3,
      idleSince: 7,
    });
    expect(restoreState({ status: 'idle', completedWork: -1 })).toEqual(IDLE);
    expect(restoreState(null)).toEqual(IDLE);
    expect(restoreState({ status: 'running', phase: 'nap', startedAt: 1, endsAt: 2, target })).toEqual(IDLE);
    expect(restoreState({ status: 'running', phase: 'work', startedAt: 5, endsAt: 2, target })).toEqual(IDLE);
    expect(
      restoreState({
        status: 'running',
        phase: 'work',
        startedAt: 1,
        endsAt: 2,
        completedWork: 0,
        target: { categoryId: 'c' },
      }),
    ).toEqual({
      status: 'running',
      phase: 'work',
      startedAt: 1,
      endsAt: 2,
      completedWork: 0,
      target: { categoryId: 'c' },
    });
  });

  it('настройки: неверные поля заменяются значениями по умолчанию', () => {
    expect(restoreSettings(undefined)).toEqual(DEFAULT_POMODORO);
    expect(restoreSettings({ workMin: 40, shortBreakMin: 'x', longBreakMin: 999 })).toEqual({
      ...DEFAULT_POMODORO,
      workMin: 40,
    });
  });
});
