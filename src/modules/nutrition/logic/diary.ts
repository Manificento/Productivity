const CAFFEINE_WORDS = [
  'кофе',
  'эспрессо',
  'капучино',
  'латте',
  'американо',
  'мокко',
  'чай',
  'мате',
  'кола',
  'энергетик',
];

/** Foods carry no caffeine field, so a name check is the soft heuristic behind the warning. */
export function hasCaffeine(foodName: string): boolean {
  const name = foodName.toLocaleLowerCase('ru').replaceAll('ё', 'е');
  return CAFFEINE_WORDS.some((w) => name.includes(w));
}

/** 'HH:mm' strings compare as text. */
export function cutoffPassed(nowTime: string, cutoff: string): boolean {
  return nowTime >= cutoff;
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
