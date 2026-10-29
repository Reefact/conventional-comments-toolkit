// Les labels de réponse sur la page d'options (§3.2, §8.2).
//
// Ces labels sont livrés ACTIVÉS et n'ont pas de clé de configuration propre : une équipe qui
// veut s'en tenir à Conventional Comments les désactive par une entrée chacun dans `labels[]`.
// Le prix de ce choix est la découvrabilité — rien dans un fichier de configuration ne dit
// « réponse » —, et c'est ici qu'il se rattrape. La page ne peut pas les désactiver : elle
// n'écrit pas le fichier d'un dépôt, et ne le doit pas, la configuration appartenant au dépôt
// et à l'organisation (§8.1.2). Elle donne donc le bloc à coller. Le bouton dit « Copier »,
// jamais « Désactiver » : un bouton qui annoncerait un effet sans le produire mentirait.

import { ADDED_LABELS } from '@cct/core';

/** Le bloc à coller dans `.conventional-comments.json` pour DÉSACTIVER la famille — une
 * entrée minimale par label. Construit depuis la définition livrée, jamais recopié : un label
 * ajouté à la famille y apparaît sans que cette page ait à le savoir. */
export function responseLabelsSnippet(): string {
  // Une entrée par ligne, comme dans le README, plutôt que `JSON.stringify(…, null, 2)` qui
  // en met une PROPRIÉTÉ par ligne : seize lignes pour trois labels, vingt pour quatre. Le bloc était alors assez
  // haut pour que la fiche de la visite guidée ne tienne ni dessous ni dessus, et sortait de la
  // fenêtre — mesuré par `spikes/options-tour.mjs`. Le texte reste du JSON valide, et le test
  // le relit comme tel.
  const entries = ADDED_LABELS.map((l) => `    { "id": ${JSON.stringify(l.id)}, "enabled": false }`);
  return `{\n  "labels": [\n${entries.join(',\n')}\n  ]\n}`;
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
