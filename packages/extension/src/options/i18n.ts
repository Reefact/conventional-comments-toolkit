// Langue de la page d'options (§10, Internationalisation).
//
// Cette page affichait du français en dur — tout en proposant un réglage « Langue de
// l'interface » qu'elle n'appliquait qu'AUX AUTRES. Un anglophone y réglait `en`, voyait
// l'extension parler anglais sur ses PR, et revenait à un écran de réglages resté français.
//
// La chaîne du §8.1.2 est « préférence locale, puis configuration effective, puis langue de
// la plateforme ». Le niveau du milieu N'EXISTE PAS ici, et il faut le dire plutôt que
// laisser croire à une omission : la configuration effective se résout pour un DÉPÔT, et
// cette page n'en affiche aucun. Le dernier niveau non plus — il n'y a pas de plateforme
// derrière un écran de réglages. Restent la préférence, puis la langue du navigateur, qui
// joue le rôle que la langue de la plateforme joue ailleurs : ce que l'utilisateur lit
// partout par défaut.

import { catalogs, ui } from '../ui/strings.js';

declare const chrome:
  | {
      storage?: {
        sync?: {
          get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
        };
      };
    }
  | undefined;

/** Langue réellement servie pour une préférence et une langue de navigateur données.
 *
 * Sépare la DÉCISION de sa source, ce qui la rend vérifiable sans navigateur ni stockage.
 * Une préférence inconnue du catalogue est ignorée plutôt que servie : `ui()` se rabattrait
 * sur l'anglais clé par clé, ce qui donnerait une page à moitié traduite là où l'utilisateur
 * a demandé une langue entière. */
export function resolveLanguage(preference: unknown, navigatorLanguage: unknown): string {
  for (const candidate of [preference, navigatorLanguage]) {
    if (typeof candidate !== 'string' || candidate === '') continue;
    const base = candidate.toLowerCase().split(/[-_]/)[0] ?? '';
    if (base in catalogs) return base;
  }
  return 'en';
}

/** Lit la préférence, puis la langue du navigateur. Ne rend jamais d'erreur : une page de
 * réglages illisible parce que le stockage a hoqueté serait pire que la même page en
 * anglais. */
export function currentLanguage(doc: Document = document): Promise<string> {
  return new Promise((resolve) => {
    const fallback = doc.defaultView?.navigator?.language;
    try {
      const sync = chrome?.storage?.sync;
      if (!sync) return resolve(resolveLanguage(null, fallback));
      sync.get(['language'], (items) => resolve(resolveLanguage(items?.['language'], fallback)));
    } catch {
      resolve(resolveLanguage(null, fallback));
    }
  });
}

/** Applique le catalogue aux nœuds porteurs d'une clé.
 *
 * `data-i18n` remplace le TEXTE d'un élément, `data-i18n-<attribut>` remplace un attribut —
 * `placeholder`, `aria-label`, `title`. Deux attributs séparés plutôt qu'une mini-syntaxe :
 * il n'y a rien à analyser, donc rien à mal analyser.
 *
 * Le texte, et jamais du HTML : pas un `innerHTML` dans cette extension, et ce n'est pas un
 * hasard — un catalogue qui porterait du balisage ferait de chaque traduction un fragment de
 * document à valider. Les phrases qui contiennent un `<code>` sont donc découpées en
 * segments de texte dans la page, pas recollées ici. */
const TRANSLATED_ATTRIBUTES = [
  {
    attribute: 'placeholder',
    data: 'data-i18n-placeholder',
    dataset: 'i18nPlaceholder',
  },
  {
    attribute: 'aria-label',
    data: 'data-i18n-aria-label',
    dataset: 'i18nAriaLabel',
  },
  { attribute: 'title', data: 'data-i18n-title', dataset: 'i18nTitle' },
] as const;

export function applyStaticStrings(doc: Document, lang: string): void {
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const key = el.dataset['i18n'];
    if (key) el.textContent = ui(lang, key);
  }
  for (const { attribute, data, dataset } of TRANSLATED_ATTRIBUTES) {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${data}]`))) {
      const key = el.dataset[dataset];
      if (key) el.setAttribute(attribute, ui(lang, key));
    }
  }
  const html = doc.documentElement;
  if (html) html.lang = lang;
}
