import type { Phase } from '../logic/pomodoro';

const MESSAGES: Record<Phase, string> = {
  work: 'Фокус-сессия завершена — время отдохнуть',
  shortBreak: 'Перерыв закончился — можно начинать следующую сессию',
  longBreak: 'Длинный перерыв закончился — можно начинать следующую сессию',
};

function beep(): void {
  const Ctx = globalThis.AudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio blocked until the user interacts with the page — vibration/notification still work.
  }
}

function notify(text: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification('LifeOS · Pomodoro', { body: text });
  } catch {
    // Android Chrome only allows notifications through the service worker.
    void navigator.serviceWorker
      ?.getRegistration()
      .then((r) => r?.showNotification('LifeOS · Pomodoro', { body: text }));
  }
}

/** Sound + vibration, and a system notification when the user allowed them. */
export function signalPhaseEnd(phase: Phase): void {
  navigator.vibrate?.([300, 150, 300]);
  beep();
  notify(MESSAGES[phase]);
}

export function notificationsState(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}
