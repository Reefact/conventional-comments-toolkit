// Le texte que la page d'options met dans le presse-papiers pour un développeur : une ligne du
// journal (§9.4), ou le journal entier, avec de quoi le situer
// (version, navigateur, état de configuration).
//
// Du JSON dans un bloc de code Markdown : il se colle tel quel dans une issue, et un outil le lit
// sans rien deviner. Tout vient du journal local et du navigateur. Une ligne de sélecteur porte
// un relevé de l'INTERFACE au dernier échec (`SelectorEvidence`, adapters/shared) — attributs
// d'une liste fermée, texte des boutons —, jamais la valeur d'un champ ni le texte d'un
// commentaire ; PRIVACY.md dit ce qu'il contient, et pourquoi le rapport se relit avant d'être
// partagé.

import type { JournalEntry } from '../journal-entry.js';

export interface ReportEnvironment {
  /** `v1.0.0-beta.17`, ou null si le navigateur ne donne pas de manifeste. */
  extension: string | null;
  browser: string;
  language: string;
  /** La dernière lecture de configuration, telle que la page d'options l'affiche. */
  degradedState: string | null;
  /** Instant de la copie : le journal vieillit, le rapport doit dire de quand il date. */
  generatedAt: string;
}

/** Une clôture plus longue que toute suite d'accents graves du contenu : un sélecteur ou une
 * adresse n'en contient normalement pas, mais un bloc qui se referme en son milieu corrompt le
 * rapport sans rien signaler. */
function fence(body: string): string {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function block(payload: unknown): string {
  const json = JSON.stringify(payload, null, 2);
  const marks = fence(json);
  return `${marks}json\n${json}\n${marks}`;
}

function header(env: ReportEnvironment): Record<string, unknown> {
  return {
    extension: env.extension,
    browser: env.browser,
    language: env.language,
    degradedState: env.degradedState,
    generatedAt: env.generatedAt,
  };
}

/** Une ligne, avec l'environnement : ce qu'on colle sous « ce sélecteur ne répond plus ». */
export function entryReport(entry: JournalEntry, env: ReportEnvironment): string {
  return block({ ...header(env), entry });
}

/** Tout le journal, dans l'ordre où la page l'affiche. */
export function journalReport(entries: readonly JournalEntry[], env: ReportEnvironment): string {
  return block({ ...header(env), entries });
}
