// La règle de périmètre d'une PR mise à l'épreuve sur des diffs fabriqués : une PR touche UNE
// plateforme, OU le code partagé, jamais les deux (CLAUDE.md, « Règles du chantier »).
import { describe, expect, it } from 'vitest';
import { classifyPath, prScopeVerdict } from '../scripts/lib/pr-scope.mjs';

const ids = ['azdo', 'github'];
const files = (...paths: string[]) => paths.map((path) => ({ path, added: false }));

describe('classement des chemins', () => {
  it('range chaque chemin dans sa classe', () => {
    expect(classifyPath('packages/adapters/azdo/src/selectors.ts', ids)).toBe('platform:azdo');
    expect(classifyPath('packages/server/src/adapters/github/index.ts', ids)).toBe('platform:github');
    expect(classifyPath('packages/adapters/shared/src/index.ts', ids)).toBe('shared');
    expect(classifyPath('packages/extension/src/editor-controller.ts', ids)).toBe('shared');
    expect(classifyPath('packages/extension/src/platforms.ts', ids)).toBe('registration');
    expect(classifyPath('docs/architecture-fr.md', ids)).toBe('docs');
    expect(classifyPath('CHANGELOG.md', ids)).toBe('docs');
    expect(classifyPath('packages/extension/test/badges.test.ts', ids)).toBe('test');
    expect(classifyPath('packages/adapters/shared/test/x.test.ts', ids)).toBe('test');
    expect(classifyPath('tests/parity-adapters.test.ts', ids)).toBe('test');
    expect(classifyPath('spikes/subject-line.mjs', ids)).toBe('tooling');
    expect(classifyPath('.github/workflows/ci.yml', ids)).toBe('tooling');
  });

  it('attribue à sa plateforme un outil ou un test qui en porte le nom', () => {
    expect(classifyPath('scripts/check-github-theme-vars.mjs', ids)).toBe('platform:github');
    expect(classifyPath('packages/extension/test/azdo-thread.test.ts', ids)).toBe('platform:azdo');
    // `.github/` est un dossier, pas un nom de fichier : il ne fait pas d'un workflow un outil GitHub.
    expect(classifyPath('.github/workflows/browser-smoke.yml', ids)).toBe('tooling');
  });

  it('ne lit pas un nom de plateforme dans le code partagé', () => {
    // Le code partagé reste partagé quel que soit son nom : c'est lui que la règle protège.
    expect(classifyPath('packages/extension/src/github-like.ts', ids)).toBe('shared');
  });
});

describe('verdict sur une PR', () => {
  it('admet une PR qui ne touche qu’une plateforme, avec docs, tests et outillage', () => {
    const v = prScopeVerdict(
      files(
        'packages/adapters/azdo/src/selectors.ts',
        'packages/server/src/adapters/azdo/index.ts',
        'packages/extension/test/badges.test.ts',
        'CHANGELOG.md',
        'spikes/composer-layout.mjs'
      ),
      ids
    );
    expect(v).toMatchObject({ ok: true, kind: 'platform', platforms: ['azdo'] });
  });

  it('refuse une PR qui touche une plateforme ET le code partagé', () => {
    const v = prScopeVerdict(
      files('packages/adapters/azdo/src/selectors.ts', 'packages/extension/src/editor-controller.ts'),
      ids
    );
    expect(v).toMatchObject({ ok: false, kind: 'mixed' });
    expect(v.shared).toEqual(['packages/extension/src/editor-controller.ts']);
    expect(v.reasons.join(' ')).toMatch(/azdo ET le code partagé/);
  });

  it('admet une PR qui ne touche que le code partagé', () => {
    const v = prScopeVerdict(files('packages/core/src/parse.ts', 'packages/extension/src/badges.ts'), ids);
    expect(v).toMatchObject({ ok: true, kind: 'shared' });
  });

  it('admet une PR de contrat : le code partagé et TOUTES les plateformes', () => {
    const v = prScopeVerdict(
      files(
        'packages/adapters/shared/src/index.ts',
        'packages/adapters/azdo/src/index.ts',
        'packages/adapters/github/src/index.ts'
      ),
      ids
    );
    expect(v).toMatchObject({ ok: true, kind: 'contract' });
  });

  it('refuse une PR qui touche plusieurs plateformes sans les toucher toutes', () => {
    const three = [...ids, 'gitlab'];
    const v = prScopeVerdict(
      files('packages/adapters/azdo/src/index.ts', 'packages/adapters/github/src/index.ts'),
      three
    );
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/pas toutes les plateformes/);
  });

  it('admet les fichiers d’inscription dans la PR qui CRÉE une plateforme', () => {
    const three = [...ids, 'gitlab'];
    const v = prScopeVerdict(
      [
        { path: 'packages/adapters/gitlab/package.json', added: true },
        { path: 'packages/adapters/gitlab/src/index.ts', added: true },
        { path: 'packages/extension/src/platforms.ts', added: false },
        { path: 'packages/extension/src/content.ts', added: false },
        { path: 'packages/extension/package.json', added: false },
      ],
      three
    );
    expect(v).toMatchObject({ ok: true, kind: 'new-platform', platforms: ['gitlab'] });
  });

  it('compte les fichiers d’inscription comme partagés hors création', () => {
    const v = prScopeVerdict(
      files('packages/adapters/azdo/src/index.ts', 'packages/extension/src/ui/strings.ts'),
      ids
    );
    expect(v.ok).toBe(false);
    expect(v.shared).toEqual(['packages/extension/src/ui/strings.ts']);
  });

  it('admet une PR de documentation, de tests ou d’outillage seuls', () => {
    const v = prScopeVerdict(files('docs/a-fr.md', 'tests/x.test.ts', 'package-lock.json'), ids);
    expect(v).toMatchObject({ ok: true, kind: 'neutral' });
  });
});
