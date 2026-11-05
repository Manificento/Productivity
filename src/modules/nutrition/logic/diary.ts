/** Word stems (Russian and Latin); a name matches when one of its words starts with a stem. */
const CAFFEINE_STEMS = [
  'кофе',
  'кофей',
  'эспрессо',
  'капучино',
  'латте',
  'американо',
  'мокко',
  'чай',
  'чая',
  'мате',
  'кола',
  'колы',
  'энергетик',
  'coffee',
  'espresso',
  'cappuccino',
  'latte',
  'cola',
  'tea',
  'mate',
  'energy',
  'nescafe',
  'redbull',
];

/** Foods carry no caffeine field, so a whole-word name check is the soft heuristic behind the warning. */
export function hasCaffeine(foodName: string): boolean {
  const name = foodName
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replaceAll('é', 'e')
    .replace('red bull', 'redbull');
  const words = name.split(/[^\p{L}]+/u).filter(Boolean);
  return words.some((w) => CAFFEINE_STEMS.some((stem) => w === stem || (stem.length >= 4 && w.startsWith(stem))));
}

/** Caffeine is late after the cutoff and before getting up ('HH:mm' strings compare as text). */
export function cutoffPassed(nowTime: string, cutoff: string, wakeTime = '00:00'): boolean {
  return nowTime >= cutoff || nowTime < wakeTime;
}

export interface Remaining {
  eaten: number;
  target: number;
  /** Target minus eaten; negative when over. */
  left: number;
}

export function remaining(eaten: number, target: number): Remaining {
  return { eaten, target, left: Math.round((target - eaten) * 10) / 10 };
}
