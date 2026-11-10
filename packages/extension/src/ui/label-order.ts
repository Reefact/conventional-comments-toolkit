// Ordre d'affichage des labels (§5.1, §5.2) — préférence PERSONNELLE (§8.1.2), lue par la
// barre d'outils et par la liste de complétion, qui doivent dire le même ordre.
//
// Chaque type forme un groupe : la zone du dessus porte le groupe `remark` PUIS le groupe
// `status`, celle du dessous le groupe `reply` (§5.1). Dans un groupe, l'ordre par défaut est
// celui de la configuration résolue : rien d'autre n'est trié. La préférence ne fait que placer
// certains labels en tête de LEUR groupe ; elle ne déplace jamais un label d'un groupe à
// l'autre — le type (`labels[].kind`) appartient au dépôt, que la page d'options ne connaît pas,
// d'où une seule liste pour tous les groupes plutôt qu'une par groupe.

import { enabledLabels, type EffectiveConfig, type LabelConfig } from '@cct/core';

/** Clé de `chrome.storage.sync`, à côté de `directShortcuts` : la préférence suit la personne
 * d'un navigateur à l'autre, pas le dépôt. */
export const LABEL_ORDER_KEY = 'labelOrder';

/** La saisie de la page d'options : virgules comme séparateur, TOUS les espaces supprimés,
 * casse ignorée, première occurrence retenue. Un jeton qui n'est pas un identifiant de label
 * — lettres ASCII seulement (§3.2) — est rendu à part, pour que la page le dise. */
export function parseLabelOrder(raw: string): { order: string[]; rejected: string[] } {
  const order: string[] = [];
  const rejected: string[] = [];
  for (const token of raw.replace(/\s+/g, '').toLowerCase().split(',')) {
    if (token === '') continue;
    if (!/^[a-z]+$/.test(token)) rejected.push(token);
    else if (!order.includes(token)) order.push(token);
  }
  return { order, rejected };
}

/** Ce que le stockage rend vient de l'extérieur de ce module : une valeur malformée vaut
 * « aucune préférence », jamais une exception. */
export function normalizeStoredOrder(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return parseLabelOrder(stored.filter((x): x is string => typeof x === 'string').join(',')).order;
}

/** Les labels ACTIFS, rangés par zone — celle du dessus (`remark`, puis `status`), celle des
 * réponses : dans chaque groupe, ceux que la préférence nomme d'abord, dans son ordre, puis les
 * autres dans l'ordre de la configuration. Un nom inconnu ou désactivé sur ce dépôt n'a
 * simplement aucun label à placer.
 *
 * La zone du dessus garde le nom `remark` : elle porte les remarques, puis les labels `status`
 * QUI LES SUIVENT TOUJOURS — un label qu'une équipe crée, ajouté en fin de configuration, ne
 * s'intercale pas entre les remarques et `summary`, `reviewed`, qui ferment la rangée. */
export function labelsByZone(
  config: EffectiveConfig,
  order: readonly string[] = []
): { remark: LabelConfig[]; reply: LabelConfig[] } {
  const rank = new Map(order.map((id, i) => [id, i]));
  const key = (l: LabelConfig, i: number) => rank.get(l.id.toLowerCase()) ?? order.length + i;
  const sorted = enabledLabels(config)
    .map((l, i) => ({ l, k: key(l, i) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.l);
  return {
    remark: [...sorted.filter((l) => l.kind === 'remark'), ...sorted.filter((l) => l.kind === 'status')],
    reply: sorted.filter((l) => l.kind === 'reply'),
  };
}
