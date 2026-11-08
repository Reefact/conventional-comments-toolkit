// @vitest-environment happy-dom
// JETABLE — exploration des captures pour écrire selectors.ts (skill plateforme, étape 4).
// Écrit son relevé dans le scratchpad et sera supprimé ensuite.
import { it } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pages');
const OUT = process.env.EXPLORE_OUT ?? '';
const short = (e: Element | null) =>
  !e
    ? '-'
    : `${e.tagName}${e.id ? '#' + e.id.slice(0, 24) : ''}${e.className ? '.' + e.className.toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''}${[...e.attributes]
        .filter((a) => /^data-(testid|discussion|note|user|username|id)/.test(a.name))
        .map((a) => `[${a.name}=${a.value.slice(0, 26)}]`)
        .join('')}`;

it('explore threads, bodies, authors', () => {
  const out: string[] = [];
  for (const f of readdirSync(PAGES).filter((x) => /^0[3-9]/.test(x) && x.endsWith('.html')).sort()) {
    const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, f), 'utf8'), 'text/html');
    out.push(`## ${f}`);
    for (const li of doc.querySelectorAll('li[id^="note_"]')) {
      // Ancêtres porteurs d'un identifiant de fil ou d'une marque de discussion.
      const anc: string[] = [];
      for (let a = li.parentElement; a && anc.length < 4; a = a.parentElement) {
        if ([...a.attributes].some((x) => /discussion/.test(x.name) || /discussion/.test(x.value) || /^discussion_/.test(a.id))) anc.push(short(a));
      }
      const body = li.querySelector('.note-text, .md');
      const bodyTags = body ? [...body.children].map((c) => c.tagName).join(',') : '-';
      const authorCands = [
        'a[data-user-id]',
        '[data-testid="author-name"]',
        '.note-header-author-name',
        'a.author-name-link',
        '[data-username]',
      ]
        .map((s) => {
          const el = li.querySelector(s);
          return el ? `${s}→${short(el)}` : '';
        })
        .filter(Boolean);
      const first = li.parentElement ? [...li.parentElement.children].filter((c) => c.matches('li[id^="note_"]'))[0] === li : '?';
      out.push(
        `  ${li.id} firstInList=${first}\n    body=${short(body)} children=${bodyTags}\n    threadAnc=${anc.join(' < ') || '-'}\n    author=${authorCands.join(' | ') || '-'}`
      );
    }
    const prev = doc.querySelector('.md-preview-holder');
    if (prev) out.push(`  preview: ${short(prev)} > ${[...prev.children].map(short).join(',')}`);
  }
  if (OUT) writeFileSync(OUT, out.join('\n'));
});
