// Les SURFACES de GitHub — les générations de rendu qui coexistent, et ce qui les distingue.
//
// Une chaîne de sélecteurs (§9.4) modélise la dérive dans le TEMPS : on essaie le nom
// d'aujourd'hui, puis celui d'hier, et le premier candidat qui ramène quelque chose gagne.
// C'est juste, et ce fichier ne remet pas ce mécanisme en cause — il l'emploie À L'INTÉRIEUR
// de chaque surface, où il veut dire ce qu'il dit.
//
// Ce qu'une chaîne ne modélise PAS, c'est deux surfaces vivantes EN MÊME TEMPS. `/pull/N` et
// `/pull/N/changes` coexistent : la vue des fichiers modifiés affiche des fils rendus par la
// génération héritée à côté de son propre composeur React. Réunies dans une seule chaîne, le
// premier candidat qui matche l'emportait et l'autre composeur devenait INVISIBLE — ni barre
// d'outils, ni saisie rapide, ni garde d'envoi (§5.4), sur la zone même où un `issue:` bloque
// réellement (§4.1, première ligne du tableau).
//
// Le commit 81e07bb avait vu le cas et n'en avait corrigé que le SILENCE : il compare les
// surfaces trouvées à celles que la page porte, et journalise le reste. La dégradation était
// donc tracée, et le champ toujours perdu. Les deux besoins cessent ici de partager un
// mécanisme : la dérive reste une chaîne, la coexistence devient une LISTE de surfaces dont on
// prend l'union.
//
// Ce que ce découpage n'est PAS : une reclassification de tout `selectors.ts`. Vingt et une des
// vingt-quatre chaînes y répondent à une question qui n'a qu'une bonne réponse par page — quel
// conteneur de fil, quel corps de commentaire rendu, quel bouton de fusion — et pour celles-là
// le premier candidat qui matche est la sémantique voulue. Seules les chaînes du COMPOSEUR se
// scindent, parce que seules elles ont montré le défaut.
//
// CE FICHIER NE DÉFINIT AUCUN SÉLECTEUR, et c'est une contrainte, pas un choix de présentation.
// Le §9.4 exige que les sélecteurs DOM soient « centralisés dans un fichier unique par
// adaptateur » ; une première version les écrivait ici, donnant DEUX fichiers de sélecteurs à
// l'adaptateur GitHub — enfreignant la règle même que toute cette PR sert à faire respecter
// (revue Reefact, PR #66). Les chaînes vivent donc dans `selectors.ts`, et ce fichier n'en porte
// que l'ASSEMBLAGE : quelle chaîne appartient à quelle surface.

import type { SelectorChain } from '@cct/adapter-shared';
import { selectors } from './selectors.js';

export interface GithubSurface {
  /** Nom stable, pour lire un diagnostic — jamais employé comme clé de journal : celui-ci
   * reste `editors`, la question posée à l'utilisateur étant « la détection des composeurs
   * a-t-elle pourri ? », pas « laquelle des trois ». */
  name: string;
  /** Les zones de saisie de CETTE surface. Chaîne à part entière : à l'intérieur d'une
   * génération, le repli d'un nom sur le précédent garde tout son sens. */
  editors: SelectorChain;
  /** Le châssis du composeur, quand cette surface le nomme — un ancêtre, possiblement
   * éloigné. `null` : la surface ne se prononce pas, et la règle géométrique du code partagé
   * s'applique (§9.2.3, `getEditorChrome`). */
  composerFrame: SelectorChain | null;
  /** La marque portée par la ZONE DE SAISIE elle-même, dont le châssis est alors son parent
   * direct. Question distincte de la précédente : l'une s'adresse aux ancêtres (`closest`),
   * l'autre au champ (`matches`). */
  composerFrameOnField: SelectorChain | null;
}

/** L'ORDRE compte pour la résolution du châssis — la première surface qui reconnaît le champ
 * répond —, et il reproduit exactement la cascade qui vivait dans le contrôleur partagé :
 * conteneur nommé d'abord, marque sur le champ ensuite, puis plus rien.
 *
 * Il ne compte PAS pour l'observation des éditeurs, qui prend l'UNION : c'est tout l'objet de
 * ce fichier. */
export const SURFACES: readonly GithubSurface[] = [
  {
    name: 'react-comment-box',
    editors: selectors.editorsReact,
    composerFrame: selectors.composerFrame,
    composerFrameOnField: selectors.composerFrameOnField,
  },
  {
    name: 'legacy',
    editors: selectors.editorsLegacy,
    // La boîte de commentaire héritée dessine son propre cadre, que la géométrie du code
    // partagé retrouve sans qu'on ait à le nommer. Un nom de moins est un nom qui ne pourrira
    // pas (§9.4).
    composerFrame: null,
    composerFrameOnField: null,
  },
  {
    name: 'changes',
    editors: selectors.editorsChanges,
    // Sur cette vue, l'ancêtre le plus proche portant un `data-testid` est la LISTE DE DIFFS
    // entière (mesuré, même relevé) : aucun conteneur de composeur à nommer. Le cadre y est
    // trouvé par la géométrie, qui l'a mesuré correctement.
    composerFrame: null,
    composerFrameOnField: null,
  },
];


/** Tous les candidats de toutes les surfaces, pour le seul usage qui a besoin d'une chaîne
 * PLATE : la sonde de dégradation, qui demande « la détection a-t-elle pourri ? » et se
 * journalise sous ce nom-là. Dérivée, jamais recopiée — une liste tenue en double finit
 * toujours par diverger de celle qui sert. */
export const ALL_EDITORS: SelectorChain = {
  name: 'editors',
  candidates: SURFACES.flatMap((s) => s.editors.candidates),
};
