// La règle de périmètre d'une PR mise à l'épreuve sur des diffs fabriqués : une PR touche UNE
// plateforme, OU le code partagé, jamais les deux (CLAUDE.md, « Règles du chantier »).
import { describe, expect, it } from 'vitest';
import { classifyPath, platformIds, prScopeVerdict } from '../scripts/lib/pr-scope.mjs';

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

  it('garde neutres un outil ou un test qui portent le nom d’une plateforme', () => {
    // Revue Codex, PR #78 : rattachés à leur plateforme, ils faisaient refuser une PR partagée,
    // et passer pour un contrat une PR Azure DevOps + partagé qui touchait ce seul script.
    expect(classifyPath('scripts/check-github-theme-vars.mjs', ids)).toBe('tooling');
    expect(classifyPath('packages/extension/test/azdo-thread.test.ts', ids)).toBe('test');
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

  it('admet les fichiers d’inscription dans la PR qui RETIRE une plateforme', () => {
    // Revue Reefact, PR #78 : aucun découpage d'un retrait n'est vert, l'inscription doit
    // partir avec l'adaptateur.
    const v = prScopeVerdict(
      [
        { path: 'packages/adapters/azdo/package.json', added: false, deleted: true },
        { path: 'packages/adapters/azdo/src/index.ts', added: false, deleted: true },
        { path: 'packages/server/src/adapters/azdo/index.ts', added: false, deleted: true },
        { path: 'packages/extension/src/platforms.ts', added: false },
        { path: 'packages/extension/src/content.ts', added: false },
        { path: 'packages/extension/package.json', added: false },
        { path: 'packages/extension/tsconfig.json', added: false },
        { path: 'packages/extension/src/managed-schema.json', added: false },
        { path: 'packages/server/src/bootstrap.ts', added: false },
        { path: 'packages/server/src/index.ts', added: false },
      ],
      ids
    );
    expect(v).toMatchObject({ ok: true, kind: 'removed-platform', platforms: ['azdo'] });
  });

  it('ne fait pas d’un retrait une licence pour le code partagé', () => {
    const v = prScopeVerdict(
      [
        { path: 'packages/adapters/azdo/package.json', added: false, deleted: true },
        { path: 'packages/extension/src/platforms.ts', added: false },
        { path: 'packages/extension/src/editor-controller.ts', added: false },
      ],
      ids
    );
    expect(v.ok).toBe(false);
    expect(v.shared).toEqual(['packages/extension/src/editor-controller.ts']);
  });

  it('n’annonce pas un contrat sans code partagé', () => {
    // Revue Reefact, PR #78 : admis, mais « code partagé et toutes les plateformes » serait faux.
    const v = prScopeVerdict(
      files('packages/adapters/azdo/src/index.ts', 'packages/adapters/github/src/index.ts'),
      ids
    );
    expect(v).toMatchObject({ ok: true, kind: 'all-platforms', shared: [] });
  });

  it('compte les fichiers d’inscription comme partagés hors création', () => {
    const v = prScopeVerdict(
      files('packages/adapters/azdo/src/index.ts', 'packages/extension/src/ui/strings.ts'),
      ids
    );
    expect(v.ok).toBe(false);
    expect(v.shared).toEqual(['packages/extension/src/ui/strings.ts']);
  });

  it('ne fait pas d’une PR Azure DevOps + partagé un contrat par un script nommé GitHub', () => {
    const v = prScopeVerdict(
      files(
        'packages/adapters/azdo/src/index.ts',
        'packages/extension/src/editor-controller.ts',
        'scripts/check-github-theme-vars.mjs'
      ),
      ids
    );
    expect(v).toMatchObject({ ok: false, kind: 'mixed', platforms: ['azdo'] });
  });

  it('admet une PR partagée qui retouche un script nommé GitHub', () => {
    const v = prScopeVerdict(
      files('packages/extension/src/editor-controller.ts', 'scripts/check-github-theme-vars.mjs'),
      ids
    );
    expect(v).toMatchObject({ ok: true, kind: 'shared' });
  });

  it('admet une PR de documentation, de tests ou d’outillage seuls', () => {
    const v = prScopeVerdict(files('docs/a-fr.md', 'tests/x.test.ts', 'package-lock.json'), ids);
    expect(v).toMatchObject({ ok: true, kind: 'neutral' });
  });
});

describe('plateformes dérivées des deux côtés de la comparaison', () => {
  it('garde une plateforme que la PR supprime', () => {
    // Revue Codex, PR #78 : lue dans la seule copie de travail, la suppression d'un adaptateur
    // effaçait sa plateforme, et ses fichiers supprimés passaient pour du code partagé.
    const base = ['packages/adapters/azdo', 'packages/adapters/github', 'packages/adapters/shared'];
    const head = ['packages/adapters/github', 'packages/adapters/shared'];
    expect(platformIds(base, head)).toEqual(['azdo', 'github']);
    const v = prScopeVerdict(
      files('packages/adapters/azdo/src/index.ts', 'packages/extension/src/editor-controller.ts'),
      platformIds(base, head)
    );
    expect(v.ok).toBe(false);
  });
});
