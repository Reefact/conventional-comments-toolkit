import { en } from './en.js';
import { fr } from './fr.js';

const catalogs: Record<string, Record<string, string>> = { en, fr };

export type Lang = string;

/** Résout la langue vers un catalogue disponible ; l'anglais est le repli terminal. */
export function resolveLang(lang: string | null | undefined): 'fr' | 'en' {
  if (!lang) return 'en';
  const base = lang.toLowerCase().split(/[-_]/)[0]!;
  return base === 'fr' ? 'fr' : 'en';
}

/** Interpolation `{clé}` simple, sans échappement — les messages sont du texte brut. */
export function t(lang: string | null | undefined, key: string, params?: Record<string, string | number>): string {
  const catalog = catalogs[resolveLang(lang)] ?? en;
  let template = catalog[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.split(`{${k}}`).join(String(v));
    }
  }
  // Les paramètres non fournis restent visibles plutôt que de casser le message.
  return template;
}

export const availableLanguages = ['fr', 'en'] as const;
