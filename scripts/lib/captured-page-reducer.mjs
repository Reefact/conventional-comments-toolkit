// La forme RÉDUITE d'une page capturée : la seule qui se stocke dans le dépôt.
//
// Une page capturée porte la session de qui l'a prise. Le masquage (`captured-page-secrets.mjs`)
// retire ce qu'on SAIT dangereux, si bien qu'un secret qu'on ne connaît pas encore passe — c'est
// le cas de toute plateforme nouvelle. La réduction prend le problème à l'envers : elle ne garde
// que ce qu'on a choisi de garder, une LISTE BLANCHE, et tout le reste disparaît.
//
// Ce qu'elle garde, c'est ce qu'un test sur page réelle lit : la structure, le texte, les
// attributs d'interface. Ce qu'elle retire : scripts, styles, liens de ressources, commentaires,
// dessin des icônes, `<meta>` non listés, valeurs des champs, requêtes des URL, `data-*` dont le
// nom ou la valeur a la forme d'un secret. MESURÉ le 2026-11-08 sur les huit captures GitHub :
// 16 Mo → 7,8 Mo, les 71 tests de l'adaptateur verts, aucun secret connu, et chacun des 99
// candidats de `selectors.ts` trouve sur la page réduite exactement les éléments qu'il trouve
// sur la page brute.
//
// Le risque propre à cette forme : un test qui passe À TORT. Une assertion négative (« Cancel
// n'est pas pris ») reste verte si la réduction a retiré l'attribut qui l'aurait fait matcher.
// Deux gardes le couvrent, chacun pour ce que l'autre ne voit pas :
//   - à la réduction, tant que la page brute existe, `reduce-captured-pages.mjs` compare les
//     éléments que trouve chaque candidat AVANT et APRÈS, et les valeurs que l'adaptateur en lit
//     (`reductionMismatches`) ;
//   - ensuite, sans page brute, `check-reduced-selectors.mjs` refuse un sélecteur qui cite un
//     attribut ou un élément que la réduction ne garde pas (`unreachableByReduction`). Il ne
//     voit pas une valeur retirée parce qu'opaque : c'est la part de la première comparaison.
//
// Ce que la réduction NE fait PAS : retirer le contenu privé. Le texte des commentaires et le
// code restent — la PR de test doit toujours être sans contenu privé.

/** Les règles communes à toutes les plateformes. Les expressions sont des SOURCES, pas des
 * `RegExp` : les règles traversent `page.evaluate`, qui ne transporte que du JSON. */
export const BASE_RULES = {
  dropElements: ['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'BASE'],
  keepAttributes: [
    'id', 'class', 'name', 'type', 'role', 'title', 'placeholder', 'contenteditable', 'disabled',
    'hidden', 'open', 'for', 'checked', 'selected', 'multiple', 'readonly', 'required', 'datetime',
    'lang', 'dir', 'tabindex', 'alt', 'colspan', 'rowspan', 'method',
  ],
  /** Requête retirée, référence gardée sous sa forme — relative, absolue ou simple ancre : c'est
   * dans la requête que vivent les jetons d'une URL signée. */
  urlAttributes: ['href', 'action'],
  /** `value` ne survit que là où elle est un libellé, jamais une saisie ni un jeton caché. */
  valueTypes: ['submit', 'button', 'checkbox', 'radio'],
  /** Un nom de `data-*` qui a la forme d'un secret. */
  secretishName: 'nonce|hmac|token|csrf|secret|session|channel|signature|hydro|payload|key',
  /** Une valeur opaque : 40 caractères ou plus sans séparateur. Un CHEMIN y ressemble — c'est
   * pourquoi une valeur d'URL passe d'abord par `urlAttributes` (mesuré : la première version
   * retirait `data-deferred-content-url`, et les fils repliés de GitHub n'étaient plus lus). */
  opaqueValue: '[A-Za-z0-9+/_=-]{40,}',
  maxDataValue: 200,
  /** Les `data-*` qui NOMMENT l'interface — posés exprès pour être cherchés —, gardés quelle que
   * soit leur valeur. Mesuré le 2026-11-08 : `data-testid="copilot-immersive-embedded-header-button"`
   * (et quatre `data-test-selector`) étaient retirés comme « opaques », un nom en kebab-case de
   * 40 caractères ressemblant à un jeton. Ce sont les prises que le skill `plateforme` recommande,
   * et celles que le squelette du diagnostic compare (`PRINTED_ATTRIBUTES`, evidence.ts). */
  interfaceData: ['data-testid', 'data-test-selector', 'data-component', 'data-variant', 'data-status'],
  /** Une valeur de `data-*` qui a la forme d'une URL, et dont la requête est donc retirée :
   * absolue, à la racine, ou relative AVEC une requête — `?token=…`, `comments?token=…`. La
   * première version ne reconnaissait que `/…` et `http(s):…`, et une requête relative passait
   * entière (revue Reefact, PR #133). Sans espace : `Are you sure?` n'est pas une URL. */
  urlValue: '^(?:/|https?:|[^\\s?#]*\\?\\S*=)',
  keepMeta: [],
  keepJson: [],
};

/** Ce que chaque plateforme lit en plus, hors de la liste commune. Un ajout ici se justifie par
 * le code de l'adaptateur qui le lit — et impose de recapturer, la page brute étant perdue. */
export const PLATFORM_RULES = {
  github: {
    // `selectors.ts` : siteRelease, currentUser, repositoryPublicMeta.
    keepMeta: ['release', 'user-login', 'octolytics-dimension-repository_public'],
    // `selectors.ts` : prEmbeddedData, lu par `#embeddedCreatedAt()`. Le même JSON porte le
    // `clientToken` de la session : seules ces clés en survivent.
    keepJson: [
      {
        selector: 'script[type="application/json"][data-target="react-app.embeddedData"]',
        attributes: ['type', 'data-target'],
        paths: [
          'payload.pullRequestsLayoutRoute.pullRequest.number',
          'payload.pullRequestsLayoutRoute.pullRequest.createdTime',
          'payload.pullRequestsLayoutRoute.repository.ownerLogin',
          'payload.pullRequestsLayoutRoute.repository.name',
        ],
      },
    ],
  },
};

export function rulesFor(platformId) {
  return { ...BASE_RULES, ...(PLATFORM_RULES[platformId] ?? {}) };
}

/** Réduit `doc` EN PLACE et rend ce qui a été retiré, compté par nature. AUTONOME, sans
 * fermeture : exécutée telle quelle dans happy-dom, et sérialisée dans Chromium par
 * `page.evaluate` — même raison que `matchPaths` (`selector-parity.mjs`). */
export function reducePage(doc, rules) {
  const dropped = {};
  const count = (k) => (dropped[k] = (dropped[k] ?? 0) + 1);
  const secretish = new RegExp(rules.secretishName, 'i');
  const opaque = new RegExp(rules.opaqueValue);
  const urlValue = new RegExp(rules.urlValue);
  // La requête retirée, et RIEN d'autre : la référence garde sa forme. Une première version
  // résolvait l'URL contre une origine factice et recomposait chemin + ancre — `#issue-1`
  // devenait `/#issue-1`, qui vise la racine du site, et l'adaptateur GitHub lit ce `href` tel
  // quel pour l'ancre d'un fil (revue Codex, PR #133). Un `?` placé APRÈS le `#` appartient à
  // l'ancre, pas à la requête.
  const withoutQuery = (value) => {
    const hash = value.indexOf('#');
    const head = hash < 0 ? value : value.slice(0, hash);
    return head.replace(/\?.*$/s, '') + (hash < 0 ? '' : value.slice(hash));
  };
  const pick = (obj, paths) => {
    const out = {};
    for (const path of paths) {
      const keys = path.split('.');
      let v = obj;
      for (const k of keys) v = v == null ? undefined : v[k];
      if (v === undefined) continue;
      let o = out;
      for (const k of keys.slice(0, -1)) o = o[k] = o[k] ?? {};
      o[keys[keys.length - 1]] = v;
    }
    return out;
  };
  const keepAttribute = (el, name, value) => {
    if (name === 'content') return el.tagName === 'META';
    if (rules.keepAttributes.includes(name) || name.startsWith('aria-')) return true;
    if (rules.interfaceData.includes(name)) return true;
    if (name === 'value') {
      return el.tagName === 'OPTION' || rules.valueTypes.includes((el.getAttribute('type') ?? '').toLowerCase());
    }
    if (name.startsWith('data-')) {
      return !secretish.test(name) && value.length <= rules.maxDataValue && !opaque.test(value);
    }
    return false;
  };
  // Attributs que la réduction ne touche jamais : le marqueur de comparaison de l'outil.
  const preserved = rules.preserve ?? [];
  const reduceAttributes = (el) => {
    for (const a of Array.from(el.attributes)) {
      if (preserved.includes(a.name)) continue;
      const urlish = a.name.startsWith('data-') && !secretish.test(a.name) && urlValue.test(a.value);
      if (rules.urlAttributes.includes(a.name)) {
        const reference = withoutQuery(a.value);
        if (reference !== a.value) el.setAttribute(a.name, reference);
        continue;
      }
      if (urlish) {
        const reference = withoutQuery(a.value);
        // Requête retirée, la valeur peut ne plus AVOIR la forme d'une URL (`a/b?c=d` → `a/b`) :
        // elle passe alors tout de suite par la règle générale, que le passage suivant lui
        // appliquerait — sans quoi la réduction n'était plus un point fixe (mesuré sur
        // `data-timeline-item-src`, chemin de 42 caractères retiré au second passage).
        if (urlValue.test(reference) || keepAttribute(el, a.name, reference)) {
          if (reference !== a.value) el.setAttribute(a.name, reference);
        } else {
          el.removeAttribute(a.name);
          count('@' + a.name);
        }
        continue;
      }
      if (!keepAttribute(el, a.name, a.value)) {
        el.removeAttribute(a.name);
        count('@' + a.name);
      }
    }
  };
  const walk = (root) => {
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === 8) {
        node.remove();
        count('#comment');
        continue;
      }
      if (node.nodeType !== 1) continue;
      const el = node;
      const json = rules.keepJson.find((j) => el.matches(j.selector));
      if (json) {
        let data = {};
        try {
          data = pick(JSON.parse(el.textContent), json.paths);
        } catch {
          // JSON illisible : vide, comme le lirait l'adaptateur
        }
        el.textContent = JSON.stringify(data);
        for (const a of Array.from(el.attributes)) {
          if (!json.attributes.includes(a.name) && !preserved.includes(a.name)) el.removeAttribute(a.name);
        }
        continue;
      }
      if (rules.dropElements.includes(el.tagName)) {
        el.remove();
        count(el.tagName.toLowerCase());
        continue;
      }
      if (el.tagName === 'META' && !rules.keepMeta.includes(el.getAttribute('name'))) {
        el.remove();
        count('meta');
        continue;
      }
      reduceAttributes(el);
      // Le dessin d'une icône ne désigne rien : ses chemins sont des coordonnées.
      if (el.tagName.toLowerCase() === 'svg') {
        el.replaceChildren();
        continue;
      }
      walk(el.tagName === 'TEMPLATE' ? el.content : el);
    }
  };
  // `walk` ne traite que les ENFANTS de ce qu'il reçoit : la racine passe d'abord par la même
  // liste blanche, sans quoi un attribut de `<html>` survivait à toutes les réductions (revue
  // Codex, PR #133).
  reduceAttributes(doc.documentElement);
  walk(doc.documentElement);
  return dropped;
}

/** La page, telle qu'elle s'écrit sur disque. SANS retour à la ligne après `</html>` : le
 * parseur le range dans `<body>`, et chaque passage en ajoutait un — la réduction n'était plus
 * un point fixe (mesuré à la première exécution). */
export function serializeReduced(doc) {
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/** Les candidats dont les éléments trouvés diffèrent entre la page brute et la page réduite.
 * `before` et `after` : `{ chaîne: [[id, …] | 'erreur…', …] }`, un tableau d'identifiants
 * d'éléments par candidat — l'IDENTITÉ, pas le nombre (revue Reefact, PR #85 : deux ensembles
 * de même taille peuvent désigner des éléments différents). */
export function reductionMismatches(candidatesByChain, before, after) {
  const out = [];
  for (const [key, candidates] of Object.entries(candidatesByChain)) {
    candidates.forEach((candidate, i) => {
      const a = JSON.stringify(before[key]?.[i]);
      const b = JSON.stringify(after[key]?.[i]);
      if (a !== b) out.push({ key, candidate, before: before[key]?.[i], after: after[key]?.[i] });
    });
  }
  return out;
}

/** Les éléments qui n'existent qu'à l'intérieur d'un `<svg>` — vidé par la réduction. */
const SVG_ONLY = [
  'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'g', 'use', 'defs', 'symbol',
  'clippath', 'mask', 'lineargradient', 'radialgradient', 'stop', 'tspan', 'foreignobject',
];

/** L'écart d'un candidat, dit SANS AUCUNE VALEUR d'attribut : le sélecteur, le repère de
 * l'élément, et les NOMS des attributs qui diffèrent. Une valeur brute est précisément ce que la
 * réduction retire — `href="/p?token=…"` —, et l'imprimer le publierait dans le terminal, un
 * journal de CI ou un message recopié (revue Reefact, PR #133 : la première version affichait
 * les deux valeurs). Chaque élément trouvé est `[repère, { attribut: valeur }]`, ou le candidat
 * vaut le texte d'erreur du moteur. */
export function describeMismatch({ key, candidate, before, after }) {
  const head = `${key} ${JSON.stringify(candidate)}`;
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return `${head} : le moteur refuse le sélecteur ${Array.isArray(before) ? 'après' : 'avant'} la réduction`;
  }
  const marks = (list) => list.map(([mark]) => mark);
  if (JSON.stringify(marks(before)) !== JSON.stringify(marks(after))) {
    const lost = marks(before).filter((m) => !marks(after).includes(m)).length;
    const added = marks(after).filter((m) => !marks(before).includes(m)).length;
    return `${head} : brut ${before.length} élément(s), réduit ${after.length} — ${lost} perdu(s), ${added} en plus`;
  }
  const at = before.findIndex(([, values], i) => JSON.stringify(values) !== JSON.stringify(after[i][1]));
  const [mark, values] = before[at];
  const names = Object.keys(values).filter((name) => values[name] !== after[at][1][name]);
  return `${head} : mêmes éléments, mais l'élément n° ${mark} n'a plus la même valeur pour ${names.join(', ')}`;
}

/** Ce qu'un sélecteur cite et que la réduction ne garde pas : la liste des raisons, vide quand
 * il ne cite que ce qui survit. Lecture TEXTUELLE du sélecteur — ce qu'on peut savoir sans la
 * page : un nom d'attribut ou d'élément. Une valeur retirée parce qu'opaque ne s'y voit pas. */
export function unreachableByReduction(selector, rules) {
  const reasons = [];
  if (rules.keepJson.some((j) => j.selector === selector)) return reasons;
  const secretish = new RegExp(rules.secretishName, 'i');
  const unquoted = selector.replace(/"[^"]*"|'[^']*'/g, '""');
  for (const [, name] of unquoted.matchAll(/\[\s*([A-Za-z_][-A-Za-z0-9_:.]*)/g)) {
    const kept =
      rules.keepAttributes.includes(name) ||
      rules.urlAttributes.includes(name) ||
      name.startsWith('aria-') ||
      (name.startsWith('data-') && !secretish.test(name)) ||
      (name === 'content' && /^meta\b/i.test(selector.trim())) ||
      (name === 'value' && /type\s*=\s*"?(submit|button|checkbox|radio)/i.test(selector));
    if (!kept) reasons.push(`attribut retiré : ${name}`);
  }
  const bare = unquoted.replace(/\[[^\]]*\]/g, '');
  // La réduction VIDE chaque `<svg>` : rien ne s'y trouve plus, ni par un descendant (`svg path`,
  // `svg > *`) ni par un élément qui n'existe que dans un svg (`button path`). Revue Reefact,
  // PR #133 : le garde ne connaissait que `dropElements`, et acceptait les deux.
  if (/(?:^|[\s>+~,(])svg(?:[.#:][^\s>+~,()]*)*\s*(?:>\s*|\s+)[^\s,)+~>]/i.test(bare)) {
    reasons.push('descendant d’un svg, que la réduction vide');
  }
  for (const [, tag] of bare.matchAll(/(?:^|[\s>+~,(])([a-z][a-z0-9-]*)/gi)) {
    const upper = tag.toUpperCase();
    if (rules.dropElements.includes(upper)) reasons.push(`élément retiré : ${tag.toLowerCase()}`);
    if (SVG_ONLY.includes(tag.toLowerCase())) reasons.push(`élément intérieur d’un svg : ${tag.toLowerCase()}`);
    if (upper === 'META') {
      const name = selector.match(/\[\s*name\s*=\s*"([^"]*)"/)?.[1];
      if (!name || !rules.keepMeta.includes(name)) reasons.push(`meta non gardé : ${name ?? '(sans nom)'}`);
    }
  }
  return reasons;
}

/** Les noms d'attributs que le code d'un adaptateur lit par `getAttribute`/`hasAttribute`, et
 * que la réduction ne garde pas. Même lecture textuelle, sur le source. */
export function unreachableAttributeReads(source, rules) {
  return attributeReads(source).filter((name) => name !== 'content' && unreachableByReduction(`[${name}]`, rules).length > 0);
}

/** Les noms d'attributs qu'un source lit par `getAttribute`/`hasAttribute`, sans doublon. */
export function attributeReads(source) {
  return [...new Set(Array.from(source.matchAll(/(?:get|has)Attribute\(\s*['"]([^'"]+)['"]/g), (m) => m[1]))];
}
