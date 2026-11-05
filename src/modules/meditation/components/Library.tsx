import { useState } from 'react';
import type { MeditationKind } from '../../../core/types';
import { Button, Card, Segmented } from '../../../ui';
import { guideMinutes, KIND_LABEL, KINDS, sessionsOfKind, type GuideSession } from '../logic/library';

export function Library({ onPick }: { onPick: (g: GuideSession) => void }) {
  const [kind, setKind] = useState<MeditationKind>('focus');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card title="Библиотека сессий">
      <Segmented
        label="Вид практики"
        value={kind}
        options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        onChange={(k) => {
          setKind(k);
          setOpen(null);
        }}
      />
      <ul className="flex flex-col gap-2">
        {sessionsOfKind(kind).map((g) => (
          <li key={g.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <button
              type="button"
              className="min-h-11 w-full text-left font-medium"
              aria-expanded={open === g.id}
              onClick={() => setOpen(open === g.id ? null : g.id)}
            >
              {g.title} · {guideMinutes(g)} мин
            </button>
            {open === g.id && (
              <>
                <ol className="mt-2 list-decimal pl-5 text-sm">
                  {g.steps.map((s, i) => (
                    <li key={i}>
                      {s.text} <span className="text-zinc-500 dark:text-zinc-400">({s.seconds} с)</span>
                    </li>
                  ))}
                </ol>
                <Button className="mt-3 w-full" onClick={() => onPick(g)}>
                  Начать «{g.title}»
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
