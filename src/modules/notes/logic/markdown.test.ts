import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('Given текст с markdown When разбираю Then заголовки, списки и чекбоксы распознаются', () => {
    const blocks = parseMarkdown('# План\n\nТекст **важно**\n\n- [ ] билет\n- [x] паспорт\n- просто\n\n1. раз\n2. два');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, inlines: [{ type: 'text', text: 'План' }] },
      {
        type: 'paragraph',
        inlines: [
          { type: 'text', text: 'Текст ' },
          { type: 'bold', text: 'важно' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        items: [
          { checked: false, inlines: [{ type: 'text', text: 'билет' }] },
          { checked: true, inlines: [{ type: 'text', text: 'паспорт' }] },
          { inlines: [{ type: 'text', text: 'просто' }] },
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [{ inlines: [{ type: 'text', text: 'раз' }] }, { inlines: [{ type: 'text', text: 'два' }] }],
      },
    ]);
  });

  it('Given пустой текст When разбираю Then блоков нет', () => {
    expect(parseMarkdown('  \n\n')).toEqual([]);
  });

  it('Given курсив, код и ссылки When разбираю Then http-ссылки остаются ссылками, а javascript: — текстом', () => {
    const [p] = parseMarkdown('*а* `b` [ок](https://x.ru) [плохо](javascript:alert(1))');
    expect(p).toMatchObject({ type: 'paragraph' });
    const inlines = p.type === 'paragraph' ? p.inlines : [];
    expect(inlines).toContainEqual({ type: 'italic', text: 'а' });
    expect(inlines).toContainEqual({ type: 'code', text: 'b' });
    expect(inlines).toContainEqual({ type: 'link', text: 'ок', href: 'https://x.ru' });
    expect(inlines.some((i) => i.type === 'link' && i.href.startsWith('javascript'))).toBe(false);
  });

  it('Given HTML в тексте When разбираю Then он остаётся обычным текстом', () => {
    const [p] = parseMarkdown('<script>x</script>');
    expect(p).toEqual({ type: 'paragraph', inlines: [{ type: 'text', text: '<script>x</script>' }] });
  });
});
