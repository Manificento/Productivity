let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor = globalThis.AudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Call from a tap («Начать»): browsers only let audio start after a user gesture. */
export function primeSignal(): void {
  void audio()
    ?.resume?.()
    ?.catch(() => undefined);
}

/** End-of-session signal: vibration plus a short generated tone (no files, no network). Never throws. */
export function playSignal(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* no vibration */
  }
  try {
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    gain.connect(c.destination);
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 528;
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 1.3);
  } catch {
    /* audio blocked: the screen text is still there */
  }
}
