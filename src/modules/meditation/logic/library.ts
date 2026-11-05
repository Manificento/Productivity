import type { MeditationKind } from '../../../core/types';

export interface GuideStep {
  text: string;
  seconds: number;
}

export interface GuideSession {
  id: string;
  kind: MeditationKind;
  title: string;
  steps: GuideStep[];
}

export const KIND_LABEL: Record<MeditationKind, string> = {
  breathing: 'дыхание',
  focus: 'фокус',
  sleep: 'сон',
  body: 'тело',
};

export const KINDS: MeditationKind[] = ['breathing', 'focus', 'sleep', 'body'];

function session(id: string, kind: MeditationKind, title: string, steps: [string, number][]): GuideSession {
  return { id, kind, title, steps: steps.map(([text, seconds]) => ({ text, seconds })) };
}

/** Text guides, each exactly 3 whole minutes, so the saved duration is a whole number of minutes. */
export const LIBRARY: GuideSession[] = [
  session('breathing-calm', 'breathing', 'Ровное дыхание', [
    ['Сядьте удобно, плечи опустите. Закройте глаза.', 30],
    ['Дышите носом ровно: вдох на 4 счёта, выдох на 6. Следите за животом.', 120],
    ['Вернитесь к обычному дыханию. Откройте глаза.', 30],
  ]),
  session('breathing-count', 'breathing', 'Счёт дыханий', [
    ['Расслабьте лицо и челюсть. Дышите естественно.', 30],
    ['Считайте выдохи от 1 до 10, затем начните снова. Сбились — начните с 1.', 120],
    ['Отпустите счёт, побудьте с дыханием пару вдохов.', 30],
  ]),
  session('breathing-wave', 'breathing', 'Дыхание-волна', [
    ['Положите руку на грудь. Почувствуйте её движение.', 30],
    ['С вдохом представляйте волну, что накатывает, с выдохом — отступает.', 120],
    ['Замедлите дыхание и мягко завершите практику.', 30],
  ]),
  session('focus-point', 'focus', 'Одна точка', [
    ['Выберите точку перед собой или закройте глаза и представьте её.', 30],
    ['Удерживайте внимание на точке. Отвлеклись — спокойно вернитесь.', 120],
    ['Расширьте внимание на всю комнату, затем потянитесь.', 30],
  ]),
  session('focus-sounds', 'focus', 'Звуки вокруг', [
    ['Закройте глаза и прислушайтесь к самому дальнему звуку.', 30],
    ['Переходите от дальних звуков к ближним, не оценивая их.', 120],
    ['Вернитесь к дыханию и откройте глаза.', 30],
  ]),
  session('focus-intent', 'focus', 'Намерение на задачу', [
    ['Сделайте три глубоких вдоха и отпустите лишние мысли.', 30],
    ['Назовите про себя одну задачу, с которой начнёте. Представьте первый шаг.', 120],
    ['Откройте глаза и приступайте к первому шагу.', 30],
  ]),
  session('sleep-scan', 'sleep', 'Сканирование тела перед сном', [
    ['Лягте на спину, руки вдоль тела. Выдохните медленно.', 30],
    ['Пройдите вниманием от стоп к макушке, расслабляя каждую часть тела.', 120],
    ['Не двигайтесь. Позвольте сну прийти.', 30],
  ]),
  session('sleep-count', 'sleep', 'Обратный счёт', [
    ['Лягте удобно, закройте глаза, дышите медленно.', 30],
    ['На каждом выдохе считайте назад от 30 до 0. Потерялись — продолжайте с любого числа.', 120],
    ['Прекратите считать и просто дышите.', 30],
  ]),
  session('sleep-place', 'sleep', 'Тихое место', [
    ['Выдохните и расслабьте плечи.', 30],
    ['Представьте тихое место: звуки, запахи, тепло. Двигайтесь по нему медленно.', 120],
    ['Оставайтесь там, пока дыхание не станет совсем ровным.', 30],
  ]),
  session('body-stretch', 'body', 'Мягкая разминка', [
    ['Встаньте, стопы на ширине плеч. Сделайте вдох и поднимите руки вверх.', 30],
    ['Медленные наклоны головы и плеч, круги плечами. Дышите глубоко.', 120],
    ['Встряхните кисти и вернитесь к стоянию.', 30],
  ]),
  session('body-scan', 'body', 'Сканирование тела', [
    ['Сядьте, ощутите опору под собой.', 30],
    ['Пройдите вниманием по телу от макушки до стоп; где напряжение — выдохните туда.', 120],
    ['Сделайте глубокий вдох и откройте глаза.', 30],
  ]),
  session('body-walk', 'body', 'Медленная ходьба', [
    ['Встаньте и почувствуйте вес тела на стопах.', 30],
    ['Идите очень медленно: подъём стопы, шаг, опора. Следите за ощущениями.', 120],
    ['Остановитесь, сделайте вдох и выдох.', 30],
  ]),
];

export const guideMinutes = (g: GuideSession): number => g.steps.reduce((s, x) => s + x.seconds, 0) / 60;

/** The step that is active after `elapsedMs`, with its start offset. */
export function stepAt(g: GuideSession, elapsedMs: number): { index: number; step: GuideStep } {
  let t = 0;
  for (let i = 0; i < g.steps.length; i++) {
    t += g.steps[i]!.seconds * 1000;
    if (elapsedMs < t) return { index: i, step: g.steps[i]! };
  }
  const last = g.steps.length - 1;
  return { index: last, step: g.steps[last]! };
}

export const sessionsOfKind = (kind: MeditationKind): GuideSession[] => LIBRARY.filter((g) => g.kind === kind);

/** The guide stretched (or squeezed) to `minutes`: the main middle step takes the difference. */
export function fitGuide(g: GuideSession, minutes: number): GuideSession {
  const total = g.steps.reduce((s, x) => s + x.seconds, 0);
  const mid = Math.floor(g.steps.length / 2);
  const seconds = g.steps[mid]!.seconds + minutes * 60 - total;
  if (seconds <= 0) return g;
  return { ...g, steps: g.steps.map((s, i) => (i === mid ? { ...s, seconds } : s)) };
}
