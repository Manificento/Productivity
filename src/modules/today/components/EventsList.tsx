import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { daysBetween, todayKey } from '../../../core/dates';
import type { LifeEvent, Project } from '../../../core/types';
import { Button, Card, Chip, Empty, Page, Sheet } from '../../../ui';
import { createEvent, useEvents, useProjects } from '../data/events';
import { daysLabel, emptyEventForm, EVENT_TYPE_LABEL, formatDay, IMPORTANCE_LABEL, splitEvents } from '../logic/events';
import { EventForm } from './EventForm';

const IMPORTANCE_TONE = { 1: 'neutral', 2: 'accent', 3: 'danger' } as const;

function EventRow({ event, today, projects }: { event: LifeEvent; today: string; projects: Project[] }) {
  const project = projects.find((p) => p.id === event.projectId);
  return (
    <li>
      <Link
        to={`/today/events/${event.id}`}
        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{event.title}</span>
          <span className="block truncate text-sm text-zinc-500">
            {EVENT_TYPE_LABEL[event.type]} · {formatDay(event.date)}
            {event.time ? `, ${event.time}` : ''}
            {project ? ` · ${project.name}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm">{daysLabel(daysBetween(today, event.date))}</span>
          <Chip tone={IMPORTANCE_TONE[event.importance]}>{IMPORTANCE_LABEL[event.importance]}</Chip>
        </span>
      </Link>
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <Card title={title}>{children}</Card>
    </section>
  );
}

export function EventsList() {
  const events = useEvents();
  const projects = useProjects() ?? [];
  const [adding, setAdding] = useState(false);
  const today = todayKey();

  let content;
  if (!events) {
    content = <Card>Загрузка…</Card>;
  } else {
    const { upcoming, past } = splitEvents(events, today);
    content = (
      <>
        <Section title="Предстоящие">
          {upcoming.length ? (
            <ul>
              {upcoming.map((e) => (
                <EventRow key={e.id} event={e} today={today} projects={projects} />
              ))}
            </ul>
          ) : (
            <Empty>Пока нет событий. Добавьте экзамен, дедлайн или собеседование — режим перестроится заранее.</Empty>
          )}
        </Section>
        {past.length > 0 && (
          <Section title="Прошедшие">
            <ul>
              {past.map((e) => (
                <EventRow key={e.id} event={e} today={today} projects={projects} />
              ))}
            </ul>
          </Section>
        )}
      </>
    );
  }

  return (
    <Page title="События">
      <Link to="/" className="mb-3 inline-flex min-h-11 items-center text-sm text-indigo-600 dark:text-indigo-400">
        ← Сегодня
      </Link>
      <Button className="mb-3 w-full" onClick={() => setAdding(true)}>
        + Добавить событие
      </Button>
      {content}
      <Sheet open={adding} title="Новое событие" onClose={() => setAdding(false)}>
        <EventForm
          initial={emptyEventForm(today)}
          projects={projects}
          onSubmit={async (fields) => {
            await createEvent(fields);
            setAdding(false);
          }}
        />
      </Sheet>
    </Page>
  );
}
