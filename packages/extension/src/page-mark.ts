// Marque de page pour le journal de dégradation de sélecteurs (§9.4).
//
// Le journal enregistre l'adresse de la page où chaque chaîne a échoué, mais l'écrire en
// clair dans la ligne la rendrait illisible — une URL de revue déborde largement la colonne.
// La page d'options affiche donc une MARQUE : deux lignes de même marque viennent de la même
// page, ce qui est la seule question à laquelle le journal ne savait pas répondre.
//
// « Marque », et non « empreinte » : `specifications-fr.md` réserve ce mot à
// `configFingerprint` (§6.3.1, §8.1.3), qui décide du blocage d'envoi. Deux sens pour un mot
// dans un dépôt où l'un des deux est normatif est une dette gratuite.
//
// CE QUE LA MARQUE N'EST PAS : une protection. C'est un FNV-1a, inversible par force brute
// sur un espace de clés énumérable, et l'adresse complète est de toute façon dans l'info-bulle
// juste à côté. La raison de la raccourcir est la mise en page, rien d'autre — l'écrire
// autrement serait une cause inventée, démentie trois caractères plus loin par le survol.
//
// POURQUOI UN HACHAGE REVIENT ICI, alors que le dépôt en a RETIRÉ un. `scriptIdFor()` —
// même FNV-1a, même base 36 — a été supprimé en `d95daf8` : il nommait un enregistrement de
// script PAR ORIGINE, donc devait être injectif, et une collision y désinscrivait une origine
// en en révoquant une autre. Rien de tel ici : aucun comportement ne dépend de la marque, et
// deux pages qui la partageraient se départageraient au survol. Le besoin n'est pas
// d'identifier, seulement de DISTINGUER à l'œil.
//
// Ces deux fonctions ne servent qu'au RENDU. Le script de contenu, lui, stocke l'URL brute et
// n'importe rien d'ici : la normalisation appliquée au rendu vaut donc aussi pour les entrées
// déjà écrites, et ce module ne quitte jamais le bundle de la page d'options.

/** Les paramètres de requête qui désignent une VUE, et non une préférence d'affichage.
 *
 * `_a` est celui d'Azure DevOps (`?_a=files`, `?_a=overview`) — un écran par valeur, un DOM par
 * écran. La liste est courte et le restera : y ajouter un paramètre revient à dire qu'il change
 * ce que la page REND, ce qui se mesure avant de s'écrire. */
const VIEW_PARAMS = ['_a'];

/** La page, réduite à ce qui l'identifie : origine, chemin, et la vue quand elle est en requête.
 *
 * Le critère est la VUE, pas la ponctuation de l'URL : deux adresses qui rendent le même DOM
 * sont une seule page. Le fragment n'en change jamais (`#discussion_r1` déroule un fil), et la
 * plupart des paramètres non plus (`?diff=split` change la mise en forme d'un diff) : ils
 * sortent. Le chemin, lui, reste — `/pull/48/files` et `/pull/48/changes` sont deux DOM
 * différents, et c'est la distinction qu'un diagnostic de sélecteurs doit rendre visible.
 *
 * Mais toutes les plateformes ne mettent pas la vue dans le chemin. **Azure DevOps la met dans
 * la requête** : `/pullrequest/42?_a=files` et `/pullrequest/42?_a=overview` sont deux écrans,
 * et les réduire à la même clé rendait FAUSSE, sur une plateforme supportée, la légende « même
 * marque = même page » — précisément là où le journal doit aider (revue Reefact, PR #70). Les
 * paramètres qui désignent une vue sont donc conservés, et eux seuls.
 *
 * `http:` et `https:` UNIQUEMENT. Un script de contenu ne s'exécute que là, mais cette valeur
 * est relue depuis le stockage pour fabriquer un `href` : le schéma se vérifie donc ici, une
 * fois, plutôt qu'au moment d'écrire le lien. Le reste rend `null` — dont les origines opaques
 * (`about:`, `data:`), où `URL.origin` vaut la chaîne `"null"` et fabriquerait une clé
 * absurde.
 *
 * Ne lève jamais : un diagnostic ne fait pas échouer son appelant. */
export function pageKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  // Slash final retiré, sauf s'il EST le chemin : `/pull/48/` et `/pull/48` sont la même
  // page, la racine et la chaîne vide ne le seraient pas.
  const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
  // Rendus dans l'ordre de VIEW_PARAMS, jamais dans celui de l'URL : la clé est alors la même
  // que la page ait été atteinte par un lien ou par un retour d'historique, qui réordonne.
  const view = VIEW_PARAMS.reduce<string[]>((kept, name) => {
    const value = parsed.searchParams.get(name);
    return value === null ? kept : [...kept, `${name}=${value}`];
  }, []);
  return `${parsed.origin}${path}${view.length > 0 ? `?${view.join('&')}` : ''}`;
}

/** FNV-1a 32 bits, rendu en base 36 sur SIX caractères exactement.
 *
 * La largeur fixe n'est pas cosmétique : les marques forment une colonne en tête d'un bloc
 * monospace, et une valeur de sept caractères décalerait sa ligne. Or `padStart` complète
 * sans tronquer, et 36⁶ (2 176 782 336) est INFÉRIEUR à 2³² : près de la moitié des valeurs
 * d'un hachage 32 bits sortent sur sept caractères. D'où le modulo, qui borne par le haut là
 * où `padStart` ne borne que par le bas.
 *
 * Le hachage porte sur des unités UTF-16 (`charCodeAt`), pas sur des octets UTF-8 : c'est
 * déterministe, et ce n'est pas le FNV-1a canonique — le dire plutôt que de laisser croire. */
export function pageMark(page: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < page.length; i++) {
    hash ^= page.charCodeAt(i);
    // `Math.imul` : la multiplication FNV déborde 32 bits, et `*` la mènerait en virgule
    // flottante, où les bits de poids faible — les seuls qui comptent ici — sont perdus.
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 2176782336).toString(36).padStart(6, '0');
}
