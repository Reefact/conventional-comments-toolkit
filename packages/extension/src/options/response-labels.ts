// Les labels de réponse sur la page d'options (§3.2, §8.2).
//
// Ces labels n'ont pas de clé de configuration propre : on les active par une entrée chacun
// dans `labels[]`. Le prix de ce choix est la découvrabilité — rien dans un fichier de
// configuration ne dit « réponse » —, et c'est ici qu'il se rattrape. La page ne peut pas les
// activer : elle n'écrit pas le fichier d'un dépôt, et ne le doit pas, la configuration
// appartenant au dépôt et à l'organisation (§8.1.2). Elle donne donc le bloc à coller. Le
// bouton dit « Copier », jamais « Activer » : un bouton qui annoncerait une activation sans
// en produire aucune affirmerait un effet que rien ne réalise.

import { RESPONSE_LABELS } from '@cct/core';

/** Le bloc à coller dans `.conventional-comments.json` — la forme MINIMALE, celle que le §8.2
 * recommande. Construit depuis la définition livrée, jamais recopié : un label ajouté à la
 * famille y apparaît sans que cette page ait à le savoir. */
export function responseLabelsSnippet(): string {
  return JSON.stringify({ labels: RESPONSE_LABELS.map((l) => ({ id: l.id, enabled: true })) }, null, 2);
}

/** Ce qui s'est RÉELLEMENT passé, pour que la page le dise tel quel : `copied` quand le
 * presse-papiers a accepté le texte, `manual` sinon — API absente, promesse rejetée faute de
 * permission ou de geste utilisateur. Le cas `manual` sélectionne le bloc, de sorte qu'un
 * Ctrl+C suffise : la page ne prétend pas avoir copié ce qu'elle n'a pas copié. */
export async function copySnippet(
  text: string,
  clipboard: { writeText(text: string): Promise<void> } | undefined,
  selectForManualCopy: () => void
): Promise<'copied' | 'manual'> {
  try {
    if (clipboard === undefined) throw new Error('no clipboard');
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    selectForManualCopy();
    return 'manual';
  }
}
