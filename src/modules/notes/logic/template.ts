import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DailyTargets, Phase } from '../../../core/adaptation/types';
import { fromDateKey } from '../../../core/dates';
import type { LifeEvent } from '../../../core/types';

const PHASE_LABEL: Record<Phase, string> = {
  normal: 'обычный день',
  prep: 'подготовка',
  taper: 'разгрузка',
  event: 'день события',
  recovery: 'восстановление',
};

/** Title of the «подготовка к событию» page. */
export function prepTitle(event: Pick<LifeEvent, 'title'>): string {
  return `Подготовка: ${event.title}`;
}

/** Markdown of the «подготовка к событию» template: a day-by-day plan from the daily targets, then a checklist. */
export function buildPrepTemplate(event: LifeEvent, rows: DailyTargets[]): string {
  const plan = rows.every((r) => r.phase === 'normal')
    ? ['Ближайшие 10 дней идут в обычном режиме — план появится ближе к событию.']
    : rows.map((r) => {
        const day = format(fromDateKey(r.date), 'd MMM', { locale: ru });
        return `- ${day} (${PHASE_LABEL[r.phase]}): задачи ${r.taskCapacityMin} мин, сон ${r.sleepHours} ч, фокус ${r.focusPomodoros}`;
      });
  return [`# ${prepTitle(event)}`, '', '## План по дням', ...plan, '', '## Что нужно сделать', '- [ ] ', ''].join('\n');
}
