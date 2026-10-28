// @vitest-environment happy-dom
// CA-47 — une abréviation LIVRÉE ne se déplie que vers un label actif (§5.2). La table livre
// `?a`, `?do`, `?di` et `?r` pour les labels de réponse, qu'un dépôt peut désactiver (§3.2) : sans
// garde, `?do` puis Tab composait `done: `, que le validateur rejette au caractère suivant. Le défaut précédait la
// famille — `?ty`, `?po`, `?qui` étaient déjà livrées pour trois labels désactivés —, pendant
// que la liste de complétion, elle, ne montre que les labels actifs.

import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig, type EffectiveConfig } from '@cct/core';
import type { EditorHandle, PlatformAdapter } from '@cct/adapter-shared';
import { attachQuickInput } from '../src/ui/quickinput.js';

let disposers: (() => void)[] = [];
afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  document.body.innerHTML = '';
});

/** Frappe `typed` dans un champ neuf, puis Tab ; rend la valeur obtenue et si Tab a été pris. */
function tabAfter(typed: string, config: EffectiveConfig): { value: string; consumed: boolean } {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  const editor = { id: 'e', element: textarea } as unknown as EditorHandle;
  // L'adaptateur n'est sollicité que pour écrire : le faux fait ce que fait le vrai à ce
  // point précis (§9.3, écriture par le setter natif), sans rien prétendre d'autre.
  const adapter = {
    writeValue: (_e: EditorHandle, text: string) => {
      textarea.value = text;
    },
  } as unknown as PlatformAdapter;
  const { dispose } = attachQuickInput({ editor, adapter, config, lang: 'fr' });
  disposers.push(dispose);
  textarea.value = typed;
  textarea.selectionStart = textarea.selectionEnd = typed.length;
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  textarea.dispatchEvent(event);
  return { value: textarea.value, consumed: event.defaultPrevented };
}

const resolving = (doc: object) =>
  resolveConfig(null, { status: 'absent' }, { status: 'found', text: JSON.stringify(doc) }, null, false).config;

describe('CA-47 — une abréviation livrée ne se déplie que vers un label actif', () => {
  it('famille désactivée : `?do` ne compose pas `done: `, et Tab garde son rôle', () => {
    const off = resolving({ labels: ['ack', 'done', 'disagree', 'reviewed'].map((id) => ({ id, enabled: false })) });
    for (const abbr of ['?a', '?do', '?di', '?r']) {
      const r = tabAfter(abbr, off);
      expect(r, abbr).toEqual({ value: abbr, consumed: false });
    }
  });

  it('famille active — le défaut : les quatre se déplient', () => {
    expect(tabAfter('?a', defaultConfig()).value).toBe('ack: ');
    expect(tabAfter('?do', defaultConfig()).value).toBe('done: ');
    expect(tabAfter('?di', defaultConfig()).value).toBe('disagree: ');
    expect(tabAfter('?r', defaultConfig()).value).toBe('reviewed: ');
  });

  it('contre-épreuve sur le défaut antérieur : `?ty`, `?po`, `?qui` livrées pour des labels éteints', () => {
    for (const abbr of ['?ty', '?po', '?qui']) expect(tabAfter(abbr, defaultConfig()).value, abbr).toBe(abbr);
    expect(tabAfter('?ty', resolving({ labels: [{ id: 'typo', enabled: true }] })).value).toBe('typo: ');
  });

  it('une abréviation écrite par une configuration n’est pas concernée', () => {
    // Une équipe qui déclare sa propre abréviation l'obtient, même vers un label éteint : ce
    // qu'elle écrit lui appartient. Seule la table LIVRÉE est gardée.
    const team = resolving({ shortcuts: { abbreviations: { '?fx': 'done: ' } } });
    expect(tabAfter('?fx', team).value).toBe('done: ');
  });

  it('les abréviations des labels actifs se déplient toujours', () => {
    expect(tabAfter('?i', defaultConfig()).value).toBe('issue: ');
    expect(tabAfter('?ib', defaultConfig()).value).toBe('issue (blocking): ');
  });
});
