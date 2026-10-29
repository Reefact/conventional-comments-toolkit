// @vitest-environment happy-dom
// CA-50 — l'ordre des boutons (§5.1, §5.2) : par défaut celui de la configuration, et une
// préférence personnelle, UNE seule liste pour les deux zones, qui place des labels en tête de
// leur zone. La barre d'outils et la liste de complétion disent le même ordre.

import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig, type EffectiveConfig } from '@cct/core';
import type { EditorHandle, PlatformAdapter } from '@cct/adapter-shared';
import { labelsByZone, normalizeStoredOrder, parseLabelOrder } from '../src/ui/label-order.js';
import { buildToolbar } from '../src/ui/toolbar.js';
import { attachQuickInput } from '../src/ui/quickinput.js';

const resolved = (doc: object): EffectiveConfig =>
  resolveConfig(null, { status: 'absent' }, { status: 'found', text: JSON.stringify(doc) }, null, false).config;
const ids = (zone: { id: string }[]) => zone.map((l) => l.id);

const REMARK = ['praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'typo', 'polish', 'reviewed'];
const REPLY = ['thanks', 'done', 'ack', 'decision', 'disagree'];

describe('CA-50 — ordre des boutons', () => {
  it('sans préférence : l’ordre de la configuration — conventionalcomments.org, puis du plus conciliant au plus tranché', () => {
    const zones = labelsByZone(defaultConfig());
    expect(ids(zones.remark)).toEqual(REMARK);
    expect(ids(zones.reply)).toEqual(REPLY);
  });

  it('les labels créés suivent, dans l’ordre d’écriture ; redéclarer ne déplace pas', () => {
    const zones = labelsByZone(resolved({ labels: [{ id: 'merci', kind: 'reply' }, { id: 'perf' }, { id: 'praise', color: '#123456' }] }));
    expect(ids(zones.remark)).toEqual([...REMARK, 'perf']);
    expect(ids(zones.reply)).toEqual([...REPLY, 'merci']);
  });

  it('la liste passe en tête de CHAQUE zone, le reste suit dans l’ordre par défaut', () => {
    const zones = labelsByZone(defaultConfig(), parseLabelOrder('suggestion,nitpick,disagree,praise,ack').order);
    expect(ids(zones.remark)).toEqual(['suggestion', 'nitpick', 'praise', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'typo', 'polish', 'reviewed']);
    expect(ids(zones.reply)).toEqual(['disagree', 'ack', 'thanks', 'done', 'decision']);
  });

  it('lecture : virgules, TOUS les espaces supprimés, casse ignorée, doublon compté une fois, jeton invalide écarté', () => {
    expect(parseLabelOrder(' Disagree , praise ')).toEqual({ order: ['disagree', 'praise'], rejected: [] });
    expect(parseLabelOrder('disagree praise')).toEqual({ order: ['disagreepraise'], rejected: [] });
    expect(parseLabelOrder('ack,ACK,,ack')).toEqual({ order: ['ack'], rejected: [] });
    expect(parseLabelOrder('follow-up,issue,é')).toEqual({ order: ['issue'], rejected: ['follow-up', 'é'] });
    // Ce que le stockage rend vient de dehors : malformé, il vaut « aucune préférence ».
    expect(normalizeStoredOrder('issue')).toEqual([]);
    expect(normalizeStoredOrder(['Issue', 3, 'done'])).toEqual(['issue', 'done']);
  });

  it('un nom inconnu, désactivé, ou un alias ne place rien et ne lève aucune erreur', () => {
    const config = resolved({ labels: [{ id: 'typo', enabled: false }] });
    const zones = labelsByZone(config, ['inconnu', 'typo', 'fixed', 'note']);
    expect(ids(zones.remark)[0]).toBe('note');
    expect(ids(zones.remark)).not.toContain('typo');
    expect(ids(zones.reply)).toEqual(REPLY); // `fixed` est un alias de `done` : il ne le déplace pas
  });

  it('contre-épreuve : un label déclaré `reply` par le dépôt se place en tête de la zone `reply`, jamais à gauche', () => {
    const zones = labelsByZone(resolved({ labels: [{ id: 'note', kind: 'reply' }] }), ['note', 'issue']);
    expect(ids(zones.reply)[0]).toBe('note');
    expect(ids(zones.remark)).not.toContain('note');
    expect(ids(zones.remark)[0]).toBe('issue');
  });

  it('la barre d’outils suit la préférence', () => {
    const bar = buildToolbar({
      config: defaultConfig(),
      lang: 'fr',
      onLabel: () => {},
      onFreeDecoration: () => {},
      currentPrefix: () => ({ hasPrefix: false, label: null, writtenLabel: null, decorations: [], malformedDecorations: false }),
      labelOrder: ['done', 'issue'],
    }).element;
    const buttons = [...bar.querySelectorAll('.cct-label-button')].map((b) => (b as HTMLElement).dataset['label']);
    expect(buttons[0]).toBe('issue');
    const zone = [...bar.querySelectorAll('.cct-reply-row .cct-label-button')].map((b) => (b as HTMLElement).dataset['label']);
    expect(zone).toEqual(['done', 'thanks', 'ack', 'decision', 'disagree']);
  });
});

describe('CA-50 — la liste de complétion dit le même ordre', () => {
  let dispose: (() => void) | null = null;
  afterEach(() => {
    dispose?.();
    dispose = null;
    document.body.innerHTML = '';
  });

  function listAfter(typed: string, labelOrder?: string[]): string[] {
    dispose?.(); // un champ à la fois : sa liste est la seule du document
    document.body.innerHTML = '';
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const editor = { id: 'e', element: textarea } as unknown as EditorHandle;
    const adapter = { writeValue: () => {} } as unknown as PlatformAdapter;
    dispose = attachQuickInput({ editor, adapter, config: defaultConfig(), lang: 'fr', ...(labelOrder ? { labelOrder } : {}) }).dispose;
    textarea.value = typed;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('.cct-quick-list li')].map((li) => li.textContent!.replace(/: $/, ''));
  }

  it('sans préférence : zone `remark`, puis zone `reply`', () => {
    expect(listAfter('/')).toEqual([...REMARK, ...REPLY]);
  });

  it('avec préférence : le même ordre que la barre, filtré par la frappe', () => {
    expect(listAfter('/', ['disagree', 'praise'])).toEqual([
      'praise', ...REMARK.filter((id) => id !== 'praise'), 'disagree', ...REPLY.filter((id) => id !== 'disagree'),
    ]);
    expect(listAfter('/d', ['disagree'])).toEqual(['disagree', 'done', 'decision']);
  });
});
