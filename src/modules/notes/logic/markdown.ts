/** Small safe markdown subset: headings, paragraphs, lists with checkboxes, bold/italic/code/links. */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export interface ListItem {
  inlines: Inline[];
  /** Present only for «- [ ]» / «- [x]» items. */
  checked?: boolean;
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: ListItem[] };

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Only web and mail links are clickable; anything else (javascript:, data:) stays plain text. */
function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (text: string) => text && out.push({ type: 'text', text });
  for (const m of src.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (m[4] !== undefined && !isSafeHref(m[5])) continue;
    push(src.slice(last, index));
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'italic', text: m[2] });
    else if (m[3] !== undefined) out.push({ type: 'code', text: m[3] });
    else out.push({ type: 'link', text: m[4], href: m[5] });
    last = index + m[0].length;
  }
  push(src.slice(last));
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const CHECKBOX = /^\[([ xX])\]\s+(.*)$/;

function listItem(text: string): ListItem {
  const box = CHECKBOX.exec(text);
  if (box) return { checked: box[1] !== ' ', inlines: parseInline(box[2]) };
  return { inlines: parseInline(text) };
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      flush();
      const ordered = !bullet;
      const item = listItem((bullet ?? numbered)![1]);
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'list' && prev.ordered === ordered) prev.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}
