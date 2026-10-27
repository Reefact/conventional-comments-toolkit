// Le garde `check:platform-isolation`, partie « contrat » (§9.2.3), mis en échec sur des sources
// fabriquées. Un garde qu'on ne fait jamais échouer ne prouve rien : la première version de
// celui-ci laissait passer `{} as PlatformAdapter`, et exemptait le point de composition — le
// fichier même où vivaient les lectures hors contrat (revue Reefact, PR #75).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findContractBypasses } from '../scripts/lib/contract-bypass.mjs';

const adapterIds = ['azdo', 'github'];
const neutral = { adapterIds, isCompositionRoot: false };
const compositionRoot = { adapterIds, isCompositionRoot: true };

describe('§9.2.3 — le garde refuse tout contournement du contrat par conversion de type', () => {
  it.each([
    ['assertion simple', 'const a = {} as PlatformAdapter;'],
    ['double assertion', 'const a = x as unknown as PlatformAdapter;'],
    ['contrat partiel', 'const a = x as Partial<PlatformAdapter>;'],
    ['intersection', 'const a = x as PlatformAdapter & { getBannerMount?: () => Element | null };'],
    ['assertion en chevrons', 'const a = <PlatformAdapter>x;'],
    ['adaptateur concret', 'const a = x as GithubClientAdapter;'],
    ['union d’adaptateurs', 'type A = GithubClientAdapter | AzdoClientAdapter;'],
  ])('%s', (_name, source) => {
    expect(findContractBypasses(source, neutral)).not.toEqual([]);
  });

  it('point de composition compris : l’ancien cast réintroduit dans content-internal.ts est refusé', () => {
    const real = readFileSync(new URL('../packages/extension/src/content-internal.ts', import.meta.url), 'utf8');
    expect(findContractBypasses(real, compositionRoot)).toEqual([]);
    const reintroduced =
      real + '\nconst m = (adapter as PlatformAdapter & { getBannerMount?: () => Element | null }).getBannerMount?.();\n';
    expect(findContractBypasses(reintroduced, compositionRoot)).toContain('as PlatformAdapter');
  });

  it('le point de composition, et lui seul, peut importer un adaptateur concret', () => {
    const source = "import { GithubClientAdapter } from '@cct/adapter-github';";
    expect(findContractBypasses(source, compositionRoot)).toEqual([]);
    expect(findContractBypasses(source, neutral)).toEqual(['import de @cct/adapter-github']);
  });

  it('un commentaire qui cite le défaut n’est pas le défaut', () => {
    const source = '// lisait par conversion de type (`as PlatformAdapter & {…}`)\n/* {} as PlatformAdapter */\nconst x = 1;';
    expect(findContractBypasses(source, neutral)).toEqual([]);
  });

  it('typer une variable par le contrat reste permis', () => {
    expect(findContractBypasses('const adapter: PlatformAdapter = make();', neutral)).toEqual([]);
  });
});
