import type { ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '../logic/markdown';

function inline(i: Inline, key: number): ReactNode {
  switch (i.type) {
    case 'bold':
      return <strong key={key}>{i.text}</strong>;
    case 'italic':
      return <em key={key}>{i.text}</em>;
    case 'code':
      return (
        <code key={key} className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
          {i.text}
        </code>
      );
    case 'link':
      return (
        <a
          key={key}
          href={i.href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-indigo-600 underline dark:text-indigo-400"
        >
          {i.text}
        </a>
      );
    default:
      return i.text;
  }
}

const HEADING_CLASS = { 1: 'text-xl font-bold', 2: 'text-lg font-semibold', 3: 'text-base font-semibold' };

function block(b: Block, key: number): ReactNode {
  if (b.type === 'heading') {
    const Tag = `h${b.level + 1}` as 'h2' | 'h3' | 'h4';
    return (
      <Tag key={key} className={`mt-3 ${HEADING_CLASS[b.level]}`}>
        {b.inlines.map(inline)}
      </Tag>
    );
  }
  if (b.type === 'paragraph')
    return (
      <p key={key} className="my-2">
        {b.inlines.map(inline)}
      </p>
    );
  const List = b.ordered ? 'ol' : 'ul';
  return (
    <List key={key} className={`my-2 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>
      {b.items.map((item, n) => (
        <li key={n} className={item.checked === undefined ? '' : 'list-none -ml-5'}>
          {item.checked !== undefined && (
            <input
              type="checkbox"
              checked={item.checked}
              disabled
              readOnly
              aria-label={item.inlines.map((i) => i.text).join('')}
              className="mr-2"
            />
          )}
          {item.inlines.map(inline)}
        </li>
      ))}
    </List>
  );
}

/** Renders markdown as React elements — never as raw HTML. */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return <p className="text-sm text-zinc-500">Нечего показывать</p>;
  return <div className="text-sm text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">{blocks.map(block)}</div>;
}
