import { useEffect, useRef, useState } from 'react';
import { Button, Card, Field, Input, Sheet, Textarea } from '../../../ui';
import type { Note } from '../../../core/types';
import { noteTitle, relatedNotes, toggleLink } from '../logic/notes';
import { deleteNote, saveNote, useLinkTargets, useNotes } from '../data/notes';
import { Markdown } from './Markdown';

const SAVE_DELAY_MS = 600;

/** Editor with autosave (debounced, and flushed on blur / leaving) and a markdown preview. */
export function NoteEditor({
  note,
  onClose,
  onOpen,
}: {
  note: Note;
  onClose: () => void;
  /** Opens another note (from «Связано»). */
  onOpen: (id: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [linkIds, setLinkIds] = useState(note.linkIds);
  const [preview, setPreview] = useState(false);
  const [day, setDay] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const targets = useLinkTargets();
  const allNotes = useNotes();
  const latest = useRef({ title, body, linkIds });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Saves pending edits; false when saving failed (the error stays on screen and the edits stay pending). */
  const flush = async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    try {
      await saveNote(note.id, latest.current);
      setError('');
      return true;
    } catch {
      dirty.current = true;
      setError('Не удалось сохранить заметку');
      return false;
    }
  };
  const change = (next: Partial<typeof latest.current>) => {
    latest.current = { ...latest.current, ...next };
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };
  // Save when the app is hidden or closed (a swipe away on a phone) and when the editor unmounts.
  useEffect(() => {
    const onHide = () => {
      if (dirty.current)
        saveNote(note.id, latest.current).then(
          () => (dirty.current = false),
          () => undefined,
        );
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [note.id]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current) saveNote(note.id, latest.current).catch(() => undefined);
    },
    [note.id],
  );

  const setLinks = (next: string[]) => {
    setLinkIds(next);
    change({ linkIds: next });
    void flush();
  };
  const related = relatedNotes(allNotes ?? [], { id: note.id, linkIds });
  const dayKeys = linkIds.filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id));

  return (
    <Card>
      <Field label="Название">
        {(id) => (
          <Input
            id={id}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              change({ title: e.target.value });
            }}
            onBlur={() => void flush()}
          />
        )}
      </Field>
      <div className="mb-3 flex gap-2">
        <Button variant={preview ? 'secondary' : 'primary'} onClick={() => setPreview(false)}>
          Текст
        </Button>
        <Button variant={preview ? 'primary' : 'secondary'} onClick={() => setPreview(true)}>
          Предпросмотр
        </Button>
      </div>
      {preview ? (
        <div aria-label="Предпросмотр заметки" className="mb-3 min-h-24">
          <Markdown source={body} />
        </div>
      ) : (
        <Field label="Текст заметки" hint="Markdown: # заголовок, - список, - [ ] чекбокс, **жирный**">
          {(id) => (
            <Textarea
              id={id}
              rows={10}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                change({ body: e.target.value });
              }}
              onBlur={() => void flush()}
            />
          )}
        </Field>
      )}
      <fieldset className="mb-3">
        <legend className="mb-1 text-sm font-medium">Привязки</legend>
        {targets && targets.projects.length + targets.events.length === 0 && (
          <p className="text-sm text-zinc-500">Нет проектов и событий для привязки — можно привязать день.</p>
        )}
        {targets?.projects.map((p) => (
          <LinkBox
            key={p.id}
            label={`Проект: ${p.name}`}
            checked={linkIds.includes(p.id)}
            onChange={() => setLinks(toggleLink(linkIds, p.id))}
          />
        ))}
        {targets?.events.map((e) => (
          <LinkBox
            key={e.id}
            label={`Событие: ${e.title}`}
            checked={linkIds.includes(e.id)}
            onChange={() => setLinks(toggleLink(linkIds, e.id))}
          />
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dayKeys.map((d) => (
            <Button
              key={d}
              variant="secondary"
              aria-label={`Убрать день ${d}`}
              onClick={() => setLinks(toggleLink(linkIds, d))}
            >
              День {d} ✕
            </Button>
          ))}
        </div>
        <Field label="Привязать день">
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              <Button
                disabled={!day}
                onClick={() => {
                  if (day && !linkIds.includes(day)) setLinks([...linkIds, day]);
                  setDay('');
                }}
              >
                Привязать
              </Button>
            </div>
          )}
        </Field>
      </fieldset>
      {related.length > 0 && (
        <section aria-label="Связано" className="mb-3">
          <h3 className="mb-1 text-sm font-medium">Связано</h3>
          <ul>
            {related.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="min-h-11 w-full py-2 text-left text-sm"
                  onClick={async () => {
                    if (await flush()) onOpen(n.id);
                  }}
                >
                  {noteTitle(n)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p role="alert" className="mb-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            if (await flush()) onClose();
          }}
        >
          Готово
        </Button>
        <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
          Удалить
        </Button>
      </div>
      <Sheet open={confirmDelete} title="Удалить заметку?" onClose={() => setConfirmDelete(false)}>
        <p className="mb-3 text-sm">«{noteTitle({ title })}» будет удалена. Ссылки других заметок останутся.</p>
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              clearTimeout(timer.current);
              dirty.current = false;
              try {
                await deleteNote(note.id);
                onClose();
              } catch {
                setConfirmDelete(false);
                setError('Не удалось удалить заметку');
              }
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Отмена
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

function LinkBox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-5" />
      {label}
    </label>
  );
}
