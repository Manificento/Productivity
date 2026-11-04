import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { todayKey } from '../../../core/dates';
import type { LifeEvent, Project } from '../../../core/types';
import { Button, Card, Empty, Page, Sheet } from '../../../ui';
import { useBaseline } from '../data/baseline';
import { deleteEvent, updateEvent, useEvent, useProjects } from '../data/events';
import {
  daysLabel,
  EVENT_TYPE_LABEL,
  eventTimeline,
  eventToForm,
  formatDay,
  formatRange,
  IMPORTANCE_LABEL,
  type EventTimeline,
} from '../logic/events';
import { EventForm } from './EventForm';
import { PlanPreview } from './PlanPreview';

const POSITION_LABEL: Record<EventTimeline['position'], string> = {
  before: 'до начала подготовки',
  prep: 'подготовка',
  taper: 'разгрузка',
  event: 'день события',
  recovery: 'восстановление',
  after: 'событие прошло',
};

function positionText(t: EventTimeline): string {
  const when = t.daysUntil >= 0 ? `событие ${daysLabel(t.daysUntil)}` : `событие было ${daysLabel(t.daysUntil)}`;
  return t.position === 'after'
    ? `Событие прошло · ${daysLabel(t.daysUntil)}`
    : `Сейчас: ${POSITION_LABEL[t.position]} · ${when}`;
}

const STATUS_CLASS = {
  done: 'border-zinc-300 text-zinc-500 dark:border-zinc-700',
  current: 'border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  upcoming: 'border-zinc-200 dark:border-zinc-800',
};

function Timeline({ timeline }: { timeline: EventTimeline }) {
  return (
    <Card title="Таймлайн">
      <p className="mb-3 text-sm font-medium">{positionText(timeline)}</p>
      <ol aria-label="Таймлайн" className="space-y-2">
        {timeline.steps.map((s, i) => (
          <li
            key={s.phase}
            aria-current={s.status === 'current' ? 'step' : undefined}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${STATUS_CLASS[s.status]}`}
          >
            <span className="font-medium">
              {s.status === 'done' ? '✓ ' : `${i + 1}. `}
              {s.label}
            </span>
            <span className="text-right">{formatRange(s.from, s.to)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Details({ event, projects }: { event: LifeEvent; projects: Project[] }) {
  const project = projects.find((p) => p.id === event.projectId);
  const rows: [string, string][] = [
    ['Тип', EVENT_TYPE_LABEL[event.type]],
    ['Дата', `${formatDay(event.date)}${event.time ? `, ${event.time}` : ''}`],
    ['Важность', IMPORTANCE_LABEL[event.importance]],
    ['Проект', project?.name ?? 'Без проекта'],
    ['Подготовка', `${event.prepDays} дн.`],
  ];
  return (
    <Card title="Детали">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-500">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const BACK = (
  <Link
    to="/today/events"
    className="mb-3 inline-flex min-h-11 items-center text-sm text-indigo-600 dark:text-indigo-400"
  >
    ← Все события
  </Link>
);

export function EventDetail() {
  const { id = '' } = useParams();
  const event = useEvent(id);
  const projects = useProjects() ?? [];
  const baseline = useBaseline();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  if (event === undefined) {
    return (
      <Page title="Событие">
        <Card>Загрузка…</Card>
      </Page>
    );
  }
  if (event === null) {
    return (
      <Page title="Событие">
        {BACK}
        <Empty>Событие не найдено</Empty>
      </Page>
    );
  }

  async function remove() {
    try {
      await deleteEvent(id);
      navigate('/today/events');
    } catch {
      setDeleteError('Не удалось удалить событие. Попробуйте ещё раз.');
    }
  }

  return (
    <Page title={event.title}>
      {BACK}
      <Timeline timeline={eventTimeline(event, todayKey())} />
      {baseline && (
        <section aria-label="Как изменятся следующие 10 дней">
          <Card title="Следующие 10 дней">
            <PlanPreview event={event} baseline={baseline} today={todayKey()} />
          </Card>
        </section>
      )}
      <Details event={event} projects={projects} />
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Изменить
        </Button>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Удалить
        </Button>
      </div>
      <Sheet open={editing} title="Изменить событие" onClose={() => setEditing(false)}>
        <EventForm
          initial={eventToForm(event)}
          projects={projects}
          preview={baseline && { baseline, today: todayKey() }}
          onSubmit={async (fields) => {
            await updateEvent(id, fields);
            setEditing(false);
          }}
        />
      </Sheet>
      <Sheet open={confirming} title="Удалить событие?" onClose={() => setConfirming(false)}>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          «{event.title}» будет удалено, цели дня пересчитаются без него.
        </p>
        {deleteError && (
          <p role="alert" className="mb-3 text-sm text-rose-600">
            {deleteError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Отмена
          </Button>
          <Button variant="danger" onClick={remove}>
            Удалить
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}
