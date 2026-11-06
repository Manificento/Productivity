/** How many days the event plan preview shows, starting today. */
export const PREVIEW_DAYS = 10;

/** Compact capacity for a narrow table: «6 ч», «3,5 ч», «45 мин». */
export function formatCapacity(min: number): string {
  if (min === 0) return '0';
  if (min < 60) return `${min} мин`;
  return `${(min / 60).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}
