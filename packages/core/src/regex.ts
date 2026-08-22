// Expression régulière de référence (§3.4.2).
// Drapeau `u` obligatoire, drapeau `v` interdit — vérifié par un test dédié (§3.4.2).
//
// Le motif est écrit avec des échappements (️ pour le sélecteur de variante,
// ‍ pour le ZWJ) : ce sont les mêmes points de code que dans la spécification,
// rendus visibles pour la relecture.

export const REFERENCE_REGEX_SOURCE =
  '^(?:(?:\\p{RI}\\p{RI}|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)[ \\t]*)?' +
  '(?<label>[A-Za-z]+)' +
  '(?:[ \\t]*\\((?<decorations>[^)\\r\\n]*)\\))?' +
  ':(?:[ \\t]+(?<subject>.*?)[ \\t]*)?$';

export const REFERENCE_REGEX_FLAGS = 'u';

export const REFERENCE_REGEX = new RegExp(REFERENCE_REGEX_SOURCE, REFERENCE_REGEX_FLAGS);

export interface PrefixMatch {
  /** Préfixe emoji éventuel, toléré en entrée et ignoré pour l'analyse (§3.4.2). */
  emoji: string | null;
  label: string;
  /** Contenu brut entre parenthèses, ou null si le groupe est absent.
   * Un groupe présent mais vide (`issue (): x`) est capturé : la regex reconnaît,
   * le validateur tranche (§3.4.2). */
  decorations: string | null;
  /** Sujet, ou null s'il est absent (`issue:`) — ce qui rend E-EMPTY-SUBJECT atteignable. */
  subject: string | null;
  /** Vrai si la source portait `label(` sans espace avant la parenthèse (W-DECORATION-STYLE). */
  missingSpaceBeforeParen: boolean;
}

/** Applique la regex de référence à une ligne de préfixe déjà normalisée (§3.4.1, étape 7). */
export function matchPrefix(line: string): PrefixMatch | null {
  const m = REFERENCE_REGEX.exec(line);
  if (!m || !m.groups) return null;
  const label = m.groups['label']!;
  const decorations = m.groups['decorations'] ?? null;
  const subject = m.groups['subject'] ?? null;
  // L'emoji n'est pas capturé par un groupe nommé : il se lit en tête, avant le label.
  const labelStart = line.indexOf(label, 0);
  const emoji = labelStart > 0 ? line.slice(0, labelStart).trimEnd() || null : null;
  // Espace manquante avant la parenthèse ouvrante (§3.3, W-DECORATION-STYLE).
  let missingSpaceBeforeParen = false;
  if (decorations !== null) {
    const parenIdx = line.indexOf('(', labelStart + label.length);
    missingSpaceBeforeParen = parenIdx === labelStart + label.length;
  }
  return { emoji, label, decorations, subject, missingSpaceBeforeParen };
}
