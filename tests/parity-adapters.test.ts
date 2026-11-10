// @vitest-environment happy-dom
// CA-06, CA-18 — non-régression du transport (§11, §3.4.1). Le corpus est injecté AU NIVEAU DES
// ADAPTATEURS, en amont de core/ : chaque cas entre par la sortie de `readValue()`, sous ses
// deux formes de transport — la valeur d'un champ de saisie (LF), et un corps stocké (CRLF).
// Les deux formes d'un même cas doivent produire le même verdict, et ce verdict être celui du
// corpus. C'est ce qui attrape les divergences de transport — un prétraitement appliqué à une
// forme seulement, une normalisation oubliée dans un adaptateur — que le test core-à-core ne
// peut pas voir.
//
// La forme LF passe par un VRAI `<textarea>` et par l'adaptateur GitHub. La forme CRLF ne le
// peut pas : un `<textarea>` ramène ses fins de ligne à LF, si bien que le corps stocké n'y
// survivrait pas. Elle entre donc par le `readValue()` d'une doublure qui rend le corps tel
// qu'il est stocké — le cas d'un éditeur qui le recevrait sans normaliser. Une rédaction
// antérieure faisait entrer cette forme par l'adaptateur SERVEUR d'un vérificateur, retiré
// depuis (§2).

import { describe, expect, it } from 'vitest';
import { corpus, toStoredForm, type CorpusCase } from '@cct/core/corpus';
import {
  resolveConfig,
  validate,
  type ConfigRead,
  type PlatformProfile,
  type PrRef,
  type UserInfo,
  type ValidationInput,
} from '@cct/core';
import type { EditorHandle } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';

const absent: ConfigRead = { status: 'absent' };
const githubProfile: PlatformProfile = { id: 'github', suggestionInfoString: 'suggestion' };
const azdoProfile: PlatformProfile = { id: 'azdo', suggestionInfoString: null };

const PR: PrRef = { platform: 'github', host: 'github.com', scope: ['acme', 'demo'], number: 42 };

function author(c: CorpusCase): UserInfo {
  const login = c.authorLogin ?? 'reviewer';
  return { id: `login:${login.toLowerCase()}`, login };
}

function configFor(c: CorpusCase) {
  const repo: ConfigRead = c.configDoc ? { status: 'found', text: JSON.stringify(c.configDoc) } : absent;
  return resolveConfig(null, absent, repo).config;
}

function editorFor(c: CorpusCase, element: Element): EditorHandle {
  return {
    id: 'e1',
    element,
    context: { zone: c.zone, action: 'compose', pr: PR, canCarryBlockingState: c.canCarryBlockingState },
  };
}

/** Le verdict de core/ sur le corps que l'adaptateur a rendu — rien d'autre ne change entre
 * les deux formes : même zone, même configuration, même auteur. */
function verdict(c: CorpusCase, body: string): [string, string][] {
  const input: ValidationInput = {
    body,
    platform: c.platform === 'github' ? githubProfile : azdoProfile,
    isSystemGenerated: false,
    zone: c.zone,
    canCarryBlockingState: c.canCarryBlockingState,
    author: author(c),
  };
  return validate(input, configFor(c)).map((d) => [d.code, d.severity]);
}

/** Forme LF : la valeur d'un vrai champ de saisie, lue par l'adaptateur GitHub. */
function fieldForm(c: CorpusCase): [string, string][] {
  const adapter = new GithubClientAdapter({ documentRef: document });
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = c.body;
  const body = adapter.readValue(editorFor(c, textarea));
  textarea.remove();
  return verdict(c, body);
}

/** Forme CRLF : le corps stocké, rendu tel quel par le `readValue()` d'une doublure. */
function storedForm(c: CorpusCase): [string, string][] {
  const stored = toStoredForm(c.body);
  const readValue = (_editor: EditorHandle): string => stored;
  const body = readValue(editorFor(c, document.createElement('div')));
  expect(body.includes('\r\n') || !c.body.includes('\n')).toBe(true); // la forme stockée est bien CRLF
  return verdict(c, body);
}

describe('CA-06, CA-18 — non-régression du transport, corpus injecté en sortie de readValue()', () => {
  for (const c of corpus) {
    it(`${c.id} : champ (LF) ≡ corps stocké (CRLF) ≡ attendu — 100 %, aucun écart toléré`, () => {
      const lf = fieldForm(c);
      const crlf = storedForm(c);
      expect(lf, 'verdict de la forme champ (LF)').toEqual(c.expected);
      expect(crlf, 'verdict de la forme stockée (CRLF)').toEqual(c.expected);
      expect(lf, 'les deux formes concordent').toEqual(crlf);
    });
  }
});
