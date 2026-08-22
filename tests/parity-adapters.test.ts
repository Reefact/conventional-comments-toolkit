// @vitest-environment happy-dom
// CA-06 — injection du corpus AU NIVEAU DES ADAPTATEURS, en amont de core/ (§11) :
// côté A en sortie de readValue() (la valeur d'un champ de saisie, LF), côté B en sortie
// de fetchThreads()/fetchStandaloneComments() (le corps stocké, CRLF). C'est ce qui
// attrape les divergences de transport — un prétraitement appliqué d'un seul côté, une
// normalisation oubliée dans un adaptateur — que le test core-à-core ne peut pas voir.

import { describe, expect, it } from 'vitest';
import {
  corpus,
  toStoredForm,
  type CorpusCase,
} from '@cct/core/corpus';
import {
  resolveConfig,
  validate,
  type CommentInfo,
  type ConfigRead,
  type PlatformProfile,
  type PrRef,
  type ThreadInfo,
  type UserInfo,
  type ValidationInput,
  type Zone,
} from '@cct/core';
import { GithubClientAdapter } from '@cct/adapter-github';
import { evaluate } from '@cct/core';

const absent: ConfigRead = { status: 'absent' };
const githubProfile: PlatformProfile = { id: 'github', suggestionInfoString: 'suggestion', slashPrefixes: ['/azp'] };
const azdoProfile: PlatformProfile = { id: 'azdo', suggestionInfoString: null, slashPrefixes: [] };

const PR: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function author(c: CorpusCase): UserInfo {
  const login = c.authorLogin ?? 'reviewer';
  return { id: `login:${login.toLowerCase()}`, login, isServiceAccount: false };
}

function configFor(c: CorpusCase) {
  const repo: ConfigRead = c.configDoc ? { status: 'found', text: JSON.stringify(c.configDoc) } : absent;
  return resolveConfig(null, absent, repo, null, false).config;
}

/** Côté A : le corps entre par un vrai <textarea> et ressort par readValue() de
 * l'adaptateur client — le chemin nominal de la saisie. */
function sideA(c: CorpusCase): [string, string][] {
  const adapter = new GithubClientAdapter({ documentRef: document });
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = c.body; // le navigateur normalise déjà les fins de ligne d'un textarea en LF
  const editor = {
    id: 'e1',
    element: textarea,
    context: {
      zone: c.zone,
      action: 'compose' as const,
      pr: PR,
      canCarryBlockingState: c.canCarryBlockingState,
      inScope: true,
    },
  };
  const body = adapter.readValue(editor);
  const input: ValidationInput = {
    body,
    platform: c.platform === 'github' ? githubProfile : azdoProfile,
    isSystemGenerated: false,
    zone: c.zone,
    canCarryBlockingState: c.canCarryBlockingState,
    author: author(c),
  };
  textarea.remove();
  return validate(input, configFor(c)).map((d) => [d.code, d.severity]);
}

/** Côté B : le corps stocké (CRLF) entre par la sortie de fetchThreads() /
 * fetchStandaloneComments() d'un adaptateur serveur synthétique, puis par evaluate() —
 * le chemin nominal du composant B. */
async function sideB(c: CorpusCase): Promise<[string, string][]> {
  const stored = toStoredForm(c.body);
  const comment: CommentInfo = {
    id: 'c1',
    author: author(c),
    body: stored,
    createdAt: '2026-10-02T00:00:00Z',
    permalink: 'https://example.test/c1',
    isSystemGenerated: false,
    canCarryBlockingState: c.canCarryBlockingState,
  };

  // L'adaptateur synthétique rend le triplet figé du corpus par ses méthodes de contrat
  // (§9.2.4) — jamais une lecture de l'environnement.
  const fetchThreads = async (): Promise<ThreadInfo[]> => {
    if (c.zone === 'thread-root') {
      return [
        {
          id: 't1',
          pr: PR,
          root: comment,
          replies: [],
          resolution: 'unresolved',
          canCarryBlockingState: c.canCarryBlockingState,
        },
      ];
    }
    if (c.zone === 'reply') {
      const root: CommentInfo = {
        ...comment,
        id: 'root',
        body: 'issue: racine du fil\r\n\r\nDétail.',
        canCarryBlockingState: true,
      };
      return [
        { id: 't1', pr: PR, root, replies: [comment], resolution: 'unresolved', canCarryBlockingState: true },
      ];
    }
    return [];
  };
  const fetchStandaloneComments = async (): Promise<{ comment: CommentInfo; zone: Zone }[]> =>
    c.zone === 'conversation' || c.zone === 'review-body' ? [{ comment, zone: c.zone }] : [];

  const threads = await fetchThreads();
  const loose = await fetchStandaloneComments();
  const result = evaluate({
    pr: PR,
    platform: c.platform === 'github' ? githubProfile : azdoProfile,
    threads,
    loose,
    config: configFor(c),
    configNotices: [],
    ctx: {
      activatedAt: '2026-09-01T00:00:00Z',
      isDraft: false,
      isOverrideMember: () => false,
      knownBlockingThreadIds: [],
      firstVerdicts: {},
    },
  });
  return result.formatDiagnostics
    .filter((d) => d.comment.id === 'c1')
    .map((d) => [d.code, d.severity]);
}

describe('CA-06 — parité de verdict, corpus injecté au niveau des adaptateurs', () => {
  for (const c of corpus) {
    it(`${c.id} : A (readValue, LF) ≡ B (fetchThreads, CRLF) ≡ attendu — 100 %, aucun écart toléré`, async () => {
      const a = sideA(c);
      const b = await sideB(c);
      expect(a, 'verdict côté A').toEqual(c.expected);
      expect(b, 'verdict côté B').toEqual(c.expected);
      expect(a, 'parité A/B').toEqual(b);
    });
  }
});
