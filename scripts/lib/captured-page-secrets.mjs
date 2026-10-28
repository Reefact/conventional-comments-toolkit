// Les SECRETS d'une page capturée sur une plateforme, et leur masquage.
//
// Une page de PR copiée depuis les outils de développement porte la session de la personne
// qui l'a prise : jetons CSRF, nonces, canaux temps réel signés, session du socket. Ces pages
// deviennent des fixtures publiques (`packages/adapters/<id>/test/fixtures/pages/`) ; tout ce
// qui authentifie doit donc y être remplacé par `REDACTED` AVANT le commit.
//
// Un masquage fait à la main nomme les champs qu'il connaît et laisse passer les autres :
// les `<input data-csrf="true">` ressemblent à n'importe quel champ caché. D'où une liste
// unique, qui sert aux DEUX usages : `redactCapturedPage()` masque, `findCapturedPageSecrets()` refuse ce qui
// ne l'est pas. Un champ ajouté ici est masqué et contrôlé du même coup.
//
// Ce que la liste NE couvre pas, et doit être lu par un humain : un secret sous un nom qu'elle
// ignore. Elle est faite de ce que GitHub sert aujourd'hui, mesuré sur les captures du
// 2026-10-28 ; une autre plateforme ajoutera les siens.

export const MASK = 'REDACTED';

/** Les attributs dont la valeur EST un secret, quel que soit l'élément. `data-session-id`
 * (le `<link rel="shared-web-socket">`) se tient À CÔTÉ du `session=` de l'URL du socket, et
 * masquer l'un ne masque pas l'autre. Pour vérifier qu'il n'en reste pas d'autre, on a
 * cherché les valeurs opaques communes à des captures de PR DIFFÉRENTES : une donnée de
 * session est la même partout, une donnée de PR non. Hors celle-ci, il ne restait que des
 * empreintes de version du site (`x-pjax-*-version`, `release`). */
const SECRET_ATTRIBUTES = ['nonce', 'data-nonce', 'data-channel', 'data-hydro-click-hmac', 'data-session-id'];

/** Les `<input>` dont la valeur est un secret, reconnus par l'attribut qui les désigne. */
const SECRET_INPUTS = [/\bname="authenticity_token"/, /\bname="timestamp_secret"/, /\bdata-csrf="true"/];

/** Les `<meta>` dont le contenu est un secret ou identifie la session. */
const SECRET_METAS = [
  'visitor-payload',
  'visitor-hmac',
  'request-id',
  'html-safe-nonce',
  'fetch-nonce',
  'octolytics-actor-hash',
  'octolytics-actor-id',
  'octolytics-dimension-user_id',
];

/** Les secrets ÉCRITS DANS DU TEXTE — JSON embarqué, URL —, hors de tout attribut nommé.
 * Chaque expression capture (1) ce qui précède le secret, (2) le secret. */
const SECRET_TEXT = [
  // Jeton client des données React embarquées.
  /("clientToken"\s*:\s*")([^"]*)/g,
  // Canaux temps réel signés (`liveChannels`, `…Channel`) : un JSON en base64 suivi de sa
  // signature. Seule la forme signée est visée — un nom de canal en clair n'est pas un secret.
  /("(?:[A-Za-z]*Channel|pullRequest[A-Za-z]*)"\s*:\s*")(eyJ[^"]*)/g,
  // Session du socket temps réel, dans l'URL du `<link>` qui l'annonce.
  /(_sockets\/u\/\d+\/ws\?session=)([^"&]*)/g,
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Toutes les occurrences secrètes de la page, sous la forme `{ kind, value }`. Une valeur
 * vide ou déjà masquée n'en est pas une. */
export function findCapturedPageSecrets(html) {
  const found = [];
  const keep = (kind, value) => {
    if (value && value !== MASK) found.push({ kind, value });
  };
  for (const attr of SECRET_ATTRIBUTES) {
    for (const m of html.matchAll(new RegExp(`\\s${esc(attr)}="([^"]*)"`, 'g'))) keep(attr, m[1]);
  }
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const rule = SECRET_INPUTS.find((r) => r.test(tag));
    if (rule) keep(`input ${rule.source}`, /\svalue="([^"]*)"/.exec(tag)?.[1]);
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/g)) {
    const tag = m[0];
    const name = /\sname="([^"]*)"/.exec(tag)?.[1];
    if (name && SECRET_METAS.includes(name)) keep(`meta ${name}`, /\scontent="([^"]*)"/.exec(tag)?.[1]);
  }
  for (const re of SECRET_TEXT) {
    for (const m of html.matchAll(re)) keep(re.source, m[2]);
  }
  // L'identifiant numérique du compte dans l'URL du socket accompagne la session : masqué
  // aussi, et contrôlé par la même règle (`0` est la valeur de masquage, un nombre restant).
  for (const m of html.matchAll(/_sockets\/u\/(\d+)\/ws/g)) if (m[1] !== '0') keep('socket user id', m[1]);
  return found;
}

/** La page, secrets remplacés par `REDACTED`. Idempotente : une page déjà masquée revient
 * identique. */
export function redactCapturedPage(html) {
  let out = html;
  for (const attr of SECRET_ATTRIBUTES) {
    out = out.replace(new RegExp(`(\\s${esc(attr)}=")[^"]*(")`, 'g'), `$1${MASK}$2`);
  }
  out = out.replace(/<input\b[^>]*>/g, (tag) =>
    SECRET_INPUTS.some((r) => r.test(tag)) ? tag.replace(/(\svalue=")[^"]*(")/, `$1${MASK}$2`) : tag
  );
  out = out.replace(/<meta\b[^>]*>/g, (tag) => {
    const name = /\sname="([^"]*)"/.exec(tag)?.[1];
    return name && SECRET_METAS.includes(name) ? tag.replace(/(\scontent=")[^"]*(")/, `$1${MASK}$2`) : tag;
  });
  for (const re of SECRET_TEXT) out = out.replace(re, `$1${MASK}`);
  out = out.replace(/(_sockets\/u\/)\d+(\/ws)/g, '$10$2');
  return out;
}
