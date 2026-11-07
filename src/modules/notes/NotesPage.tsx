import { useMemo, useState } from 'react';
import { Button, Card, Empty, Field, Input, Page, Select } from '../../ui';
import { NoteEditor } from './components/NoteEditor';
import { db } from '../../core/db';
import { useTodayKey } from '../../core/dates';
import { addNote, createPrepNote, deleteNote, openDayNote, useLinkTargets, useNotes } from './data/notes';
import type { LifeEvent } from '../../core/types';
import { filterNotes, noteTitle } from './logic/notes';
import { prepTitle } from './logic/template';

/** `/notes` — markdown notes linked to projects, events and days, with search and link filters. */
export function NotesPage() {
  const notes = useNotes();
  const targets = useLinkTargets();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');

  const shown = useMemo(
    () =>
      filterNotes(filterNotes(notes ?? [], { query, linkId: projectId || undefined }), {
        linkId: eventId || undefined,
      }),
    [notes, query, projectId, eventId],
  );
  // Upcoming events without a page of their own yet get a «подготовка» suggestion.
  const today = useTodayKey();
  const suggested = (targets?.events ?? []).filter(
    (e) => e.date >= today && !(notes ?? []).some((n) => n.linkIds.includes(e.id)),
  );
  const open = notes?.find((n) => n.id === openId);

  const create = async () => {
    try {
      setOpenId((await addNote()).id);
      setError('');
    } catch {
      setError('Не удалось создать заметку');
    }
  };

  const openToday = async () => {
    try {
      setOpenId((await openDayNote(today)).id);
      setError('');
    } catch {
      setError('Не удалось открыть страницу дня');
    }
  };
  const createPrep = async (event: LifeEvent) => {
    try {
      setOpenId((await createPrepNote(event, today)).id);
      setError('');
    } catch {
      setError('Не удалось создать страницу подготовки');
    }
  };

  /** A note nothing was typed into is not worth keeping. */
  const dropIfEmpty = async (id: string) => {
    const saved = await db.notes.get(id);
    if (saved && !saved.title.trim() && !saved.body.trim()) await deleteNote(id);
  };

  if (open)
    return (
      <Page title="Заметки">
        <NoteEditor
          key={open.id}
          note={open}
          onOpen={async (id) => {
            await dropIfEmpty(open.id);
            setOpenId(id);
          }}
          onClose={async () => {
            await dropIfEmpty(open.id);
            setOpenId(null);
          }}
        />
      </Page>
    );

  return (
    <Page
      title="Заметки"
      actions={
        <>
          <Button variant="secondary" onClick={() => void openToday()}>
            Сегодня
          </Button>
          <Button onClick={() => void create()}>Новая заметка</Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {notes !== undefined && suggested.length > 0 && (
        <Card title="Подготовка к событию">
          {suggested.map((e) => (
            <Button key={e.id} variant="secondary" className="mb-2 w-full" onClick={() => void createPrep(e)}>
              Создать страницу «{prepTitle(e)}»
            </Button>
          ))}
        </Card>
      )}
      {notes === undefined ? (
        <Card>
          <Empty>Загрузка…</Empty>
        </Card>
      ) : notes.length === 0 ? (
        <Card>
          <Empty>Заметок пока нет — начните с «Новая заметка»</Empty>
        </Card>
      ) : (
        <>
          <Card>
            <Field label="Поиск">
              {(id) => <Input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
            </Field>
            <Field label="По проекту">
              {(id) => (
                <Select id={id} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Все проекты</option>
                  {targets?.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="По событию">
              {(id) => (
                <Select id={id} value={eventId} onChange={(e) => setEventId(e.target.value)}>
                  <option value="">Все события</option>
                  {targets?.events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Card>
          <Card>
            {shown.length === 0 ? (
              <Empty>Ничего не найдено</Empty>
            ) : (
              <ul>
                {shown.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(n.id)}
                      className="min-h-11 w-full py-2 text-left text-sm font-medium"
                    >
                      {noteTitle(n)}
                      <span className="block truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        {n.body.slice(0, 80)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
