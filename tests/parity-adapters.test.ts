// @vitest-environment happy-dom
// CA-06 — non-régression du transport (§11). Le corpus versionné entre dans
// l'extension par les frontières d'adaptateur, sur le chemin PROPRE à la plateforme de chaque
// cas, et le verdict est celui que l'extension produit :
//
//   - le CONTEXTE vient d'`observeEditors()`, sur une page capturée de la plateforme — jamais
//     écrit par le test, seulement comparé au contexte que le corpus fige (zone, état
//     bloquant) ;
//   - le CORPS est posé dans le champ que l'adaptateur a observé, et lu par `readValue()` ;
//   - la CONFIGURATION est lue par `getRepoConfig()` — et, quand le cas en porte une, aussi
//     par `getOrgConfig()` — de cet adaptateur, sur un `fetch` simulé qui répond à la vraie
//     route, de la forme mesurée ; elle est résolue par `ClientConfigResolver`, celui de
//     l'extension ;
//   - l'AUTEUR est celui que `getCurrentUser()` lit dans la page ;
//   - le VERDICT est celui que le contrôleur d'éditeur (`EditorController`) affiche : la liste
//     ordonnée des couples (code, sévérité) de sa pastille, et non un appel direct à core/.
//
// Les pages viennent des captures réduites de chaque adaptateur (`packages/adapters/<id>/test/
// fixtures/pages/`, CAPTURES.md), chargées à l'URL où elles ont été prises — les mêmes que
// leurs tests sur pages réelles. Aucune structure n'est inventée : la seule écriture dans une
// page est le login de `meta[name="user-login"]` (le sélecteur `currentUser` de GitHub, lu par
// `getCurrentUser()`), pour le seul cas qui exempte un auteur.
//
// UNE SEULE FORME DE TRANSPORT : le champ de saisie (LF). Mesuré dans Chromium, un `<textarea>`
// ramène CRLF à LF, prérempli comme posé par script, et aucun chemin réel de l'extension n'amène
// un corps stocké CRLF (décision du propriétaire, 2026-11-10). La normalisation CRLF du §3.4.1
// reste normative, et se teste là où elle a lieu, dans core/ (CA-18 : core/test/corpus.test.ts,
// core/test/preprocess.test.ts).

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpus, type CorpusCase } from '@cct/core/corpus';
import type { Floor, PrRef, Zone } from '@cct/core';
import type { EditorHandle, PlatformAdapter } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { GitlabClientAdapter } from '@cct/adapter-gitlab';
import { ClientConfigResolver } from '../packages/extension/src/config-resolver.js';
import { EditorController } from '../packages/extension/src/editor-controller.js';

const ORG_URL = 'https://config.example/cc/organisation.json';

/** La page capturée qui porte, pour une plateforme, un champ de la zone demandée — et l'URL où
 * elle a été prise (celle de ses tests sur pages réelles). */
const PAGES: Record<string, Partial<Record<Zone, { file: string; url: string }>>> = {
  github: {
    // real-pages.test.ts : commentaire de ligne, Files changed de la PR 331.
    'thread-root': { file: '04-files-commentaire-ligne.html', url: 'https://github.com/Reefact/just-dummies/pull/331/changes' },
    // real-pages.test.ts : réponse dans un fil de ligne.
    reply: { file: '05-files-reponse-fil-ligne.html', url: 'https://github.com/Reefact/just-dummies/pull/331/changes' },
    // real-pages-classic.test.ts : Conversation, le formulaire de commentaire général.
    conversation: { file: '02-conversation-reponse-fil.html', url: 'https://github.com/Reefact/just-dummies/pull/331' },
    // real-pages.test.ts : le corps de la revue soumise en lot.
    'review-body': { file: '07-review-changes.html', url: 'https://github.com/Reefact/just-dummies/pull/331/changes' },
  },
  azdo: {
    // azdo/test/real-pages.test.ts : commentaire de ligne, vue Files de la PR 1.
    'thread-root': {
      file: '04-files-commentaire-ligne.html',
      url: 'https://dev.azure.com/sylva-cct-test/cct-test/_git/cct-test/pullrequest/1?_a=files',
    },
  },
  gitlab: {
    // gitlab/test/real-pages.test.ts : nouveau fil sur une ligne de diff, Rapid Diffs de la MR 1.
    'thread-root': {
      file: '04-changes-commentaire-ligne.html',
      url: 'https://gitlab.com/Reefact/testing-conventional-comments/-/merge_requests/1/diffs',
    },
  },
};

/** La route que chaque adaptateur appelle pour le fichier de dépôt — celle que leurs propres
 * tests figent (extension/test/repo-config-read.test.ts, azdo/test/repo-config.test.ts). GitLab
 * n'en a aucune : la lecture n'est pas mesurée (§C.4), son adaptateur rend `unreachable` sans
 * requête, et l'extension y est en état dégradé — ce que le test vérifie à la place. */
const REPO_ROUTE: Record<string, string | null> = {
  gitlab: null,
  github: 'https://github.com/Reefact/just-dummies/raw/HEAD/.conventional-comments.json',
  azdo:
    'https://dev.azure.com/sylva-cct-test/cct-test/_apis/git/repositories/cct-test/items' +
    '?path=%2F.conventional-comments.json&api-version=7.1',
};

interface Served {
  repo: string | null; // le fichier de dépôt servi, `null` : absent (404)
  org: string | null; // le document d'organisation servi, `null` : pas de `configUrl` au plancher
}

interface LoadedPage {
  adapter: PlatformAdapter;
  editor: EditorHandle;
  serve: Served;
  requested: string[];
  restoreUser: () => void;
  setUser: (login: string) => void;
}

function load(platform: string, zone: Zone): LoadedPage {
  const where = PAGES[platform]?.[zone];
  if (!where) throw new Error(`aucune page capturée pour ${platform}/${zone}`);
  const dir = join(process.cwd(), 'packages', 'adapters', platform, 'test', 'fixtures', 'pages');
  const doc = new DOMParser().parseFromString(readFileSync(join(dir, where.file), 'utf8'), 'text/html');
  Object.defineProperty(doc, 'location', { value: new URL(where.url), configurable: true });
  const serve: Served = { repo: null, org: null };
  const requested: string[] = [];
  // La forme mesurée de chaque réponse : 200 et le contenu brut ; 404 pour un fichier absent
  // (repo-config-read.test.ts, azdo/test/repo-config.test.ts).
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    const body = url === ORG_URL ? serve.org : url === REPO_ROUTE[platform] ? serve.repo : null;
    return body === null ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
  const adapter: PlatformAdapter =
    platform === 'github'
      ? new GithubClientAdapter({ documentRef: doc, fetchImpl })
      : platform === 'azdo'
        ? new AzdoClientAdapter({ documentRef: doc, fetchImpl })
        : new GitlabClientAdapter({ documentRef: doc, fetchImpl });
  const editors: EditorHandle[] = [];
  adapter.observeEditors((e) => editors.push(e)).dispose();
  const editor = editors.find((e) => e.context.zone === zone);
  if (!editor) throw new Error(`${platform}/${where.file} : aucun champ de zone ${zone} observé`);
  // Le login de la session, lu par `getCurrentUser()` sur GitHub (`meta[name="user-login"]`).
  const meta = doc.querySelector('meta[name="user-login"]');
  const original = meta?.getAttribute('content') ?? null;
  return {
    adapter,
    editor,
    serve,
    requested,
    setUser: (login) => meta?.setAttribute('content', login),
    restoreUser: () => {
      if (original !== null) meta?.setAttribute('content', original);
    },
  };
}

const pages = new Map<string, LoadedPage>();
function page(c: CorpusCase): LoadedPage {
  const key = `${c.platform}/${c.zone}`;
  if (!pages.has(key)) pages.set(key, load(c.platform, c.zone));
  return pages.get(key)!;
}

/** Le verdict que l'extension AFFICHE pour ce corps, sur cette page, sous cette configuration :
 * le contrôleur d'éditeur réel, attaché au champ observé, sur la configuration que le résolveur
 * de l'extension a lue par l'adaptateur. */
async function extensionVerdict(c: CorpusCase, body: string, via: 'repo' | 'org'): Promise<[string, string][]> {
  const p = page(c);
  const doc = p.editor.element.ownerDocument;
  const pr = p.editor.context.pr as PrRef;
  const document = c.configDoc ? JSON.stringify(c.configDoc) : null;
  p.serve.repo = via === 'repo' ? document : null;
  p.serve.org = via === 'org' ? document : null;
  const floor: Floor | null = via === 'org' ? { configUrl: ORG_URL } : null;
  const resolved = await new ClientConfigResolver(async () => floor).resolve(p.adapter, pr);
  // Sans route mesurée, le fichier de dépôt est illisible : état dégradé, jamais un faux `absent`.
  expect(resolved.degraded, 'état dégradé').toBe(REPO_ROUTE[c.platform] === null);

  if (c.authorLogin) p.setUser(c.authorLogin);
  const currentUserLogin = (await p.adapter.getCurrentUser()).login;
  (p.editor.element as HTMLTextAreaElement).value = body;
  const controller = new EditorController({ adapter: p.adapter, editor: p.editor, resolved, lang: 'en', currentUserLogin });
  try {
    controller.attach(); // valide aussitôt ce que `readValue()` rend (§5.3)
    const feedback = doc.getElementById(p.editor.element.getAttribute('aria-describedby') ?? '');
    expect(feedback, 'pastille posée par le contrôleur').not.toBeNull();
    return [...feedback!.querySelectorAll('.cct-diagnostics li[data-code]')].map((li) => [
      (li as HTMLElement).dataset['code']!,
      (li as HTMLElement).dataset['severity']!,
    ]);
  } finally {
    controller.dispose();
    p.restoreUser();
  }
}

afterAll(() => pages.clear());

describe('CA-06 — le corpus traverse les frontières d’adaptateur de SA plateforme, et l’extension en rend le verdict', () => {
  for (const c of corpus) {
    it(`${c.platform}/${c.id} : champ (LF) ≡ attendu — 100 %, aucun écart toléré`, async () => {
      const p = page(c);
      // Le contexte vient de l'adaptateur : il doit être celui que le corpus fige.
      expect([p.editor.context.zone, p.editor.context.canCarryBlockingState]).toEqual([c.zone, c.canCarryBlockingState]);
      expect(p.adapter.platformProfile().id).toBe(c.platform);

      const before = p.requested.length;
      const lf = await extensionVerdict(c, c.body, 'repo');
      const route = REPO_ROUTE[c.platform];
      if (route) expect(p.requested.at(-1), 'fichier de dépôt lu à la route de la plateforme').toBe(route);
      else expect(p.requested.length, 'aucune requête sans route mesurée').toBe(before);
      expect(lf, 'verdict de la forme champ (LF)').toEqual(c.expected);

      // La même configuration, lue cette fois comme document d'organisation (§8.1.2, niveau 2).
      if (c.configDoc) {
        expect(await extensionVerdict(c, c.body, 'org'), 'configuration lue par getOrgConfig()').toEqual(c.expected);
        expect(p.requested).toContain(ORG_URL);
      }
    }, 60_000);
  }
});
