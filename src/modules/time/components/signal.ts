import type { Phase } from '../logic/pomodoro';

const MESSAGES: Record<Phase, string> = {
  work: 'Фокус-сессия завершена — время отдохнуть',
  shortBreak: 'Перерыв закончился — можно начинать следующую сессию',
  longBreak: 'Длинный перерыв закончился — можно начинать следующую сессию',
};

let audio: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  const Ctx = globalThis.AudioContext;
  if (!Ctx) return undefined;
  try {
    audio ??= new Ctx();
    return audio;
  } catch {
    return undefined;
  }
}

/** Call from a click handler: browsers only start audio after a user gesture. */
export function unlockSound(): void {
  void audioContext()
    ?.resume()
    .catch(() => {});
}

function beep(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
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
