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
//     éléments que trouve chaque candidat AVANT et APRÈS (`reductionMismatches`) ;
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
  /** Réduits à leur chemin (origine étrangère comprise), requête retirée : c'est là que vivent
   * les jetons d'une URL signée. */
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
  const pathOnly = (value) => {
    try {
      const u = new URL(value, 'https://host.invalid');
      return (u.origin === 'https://host.invalid' ? '' : u.origin) + u.pathname + u.hash;
    } catch {
      return null;
    }
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
      for (const a of Array.from(el.attributes)) {
        if (preserved.includes(a.name)) continue;
        const urlish = a.name.startsWith('data-') && /^(\/|https?:)/.test(a.value) && !secretish.test(a.name);
        if (rules.urlAttributes.includes(a.name) || urlish) {
          const path = pathOnly(a.value);
          if (path === null) {
            el.removeAttribute(a.name);
            count('@' + a.name);
          } else if (path !== a.value) {
            el.setAttribute(a.name, path);
          }
          continue;
        }
        if (!keepAttribute(el, a.name, a.value)) {
          el.removeAttribute(a.name);
          count('@' + a.name);
        }
      }
      // Le dessin d'une icône ne désigne rien : ses chemins sont des coordonnées.
      if (el.tagName.toLowerCase() === 'svg') {
        el.replaceChildren();
        continue;
      }
      walk(el.tagName === 'TEMPLATE' ? el.content : el);
    }
  };
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
  for (const [, tag] of bare.matchAll(/(?:^|[\s>+~,(])([a-z][a-z0-9-]*)/gi)) {
    const upper = tag.toUpperCase();
    if (rules.dropElements.includes(upper)) reasons.push(`élément retiré : ${tag.toLowerCase()}`);
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
  const out = new Set();
  for (const [, name] of source.matchAll(/(?:get|has)Attribute\(\s*['"]([^'"]+)['"]/g)) {
    if (unreachableByReduction(`[${name}]`, rules).length > 0 && name !== 'content') out.add(name);
  }
  return [...out];
}
