// Le registre des plateformes (`platforms.ts`) est la SEULE liste qui les énumère — à condition
// que rien d'autre n'en tienne une qui diverge. Ce test confronte le registre à tout ce qui, hors
// du code TypeScript, nomme encore les plateformes : les dossiers de paquets, le schéma de
// politique d'entreprise, les deux catalogues de libellés. Ajouter une plateforme sans compléter
// l'un d'eux échoue ici, avec le nom de ce qui manque.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLATFORMS, PLATFORM_IDS, configCredentialsFor } from '../src/platforms.js';
import { inferPlatform, selectPlatform } from '../src/host-platform.js';
import { ui } from '../src/ui/strings.js';

const root = new URL('../../../', import.meta.url);

describe('§9.1 — le registre des plateformes, et lui seul', () => {
  it('a une ligne par paquet de plateforme, et un paquet par ligne', () => {
    const dirs = readdirSync(new URL('packages/adapters/', root)).filter((name) => name !== 'shared');
    expect([...PLATFORM_IDS].sort()).toEqual(dirs.sort());
  });

  it('chaque paquet publie sa fiche en sous-chemin `/descriptor`, sans DOM', () => {
    for (const id of PLATFORM_IDS) {
      const pkg = JSON.parse(readFileSync(new URL(`packages/adapters/${id}/package.json`, root), 'utf8'));
      expect(pkg.exports?.['./descriptor'], id).toBe('./dist/descriptor.js');
    }
  });

  it('le schéma de politique accepte exactement les plateformes du registre, plus `config`', () => {
    const schema = JSON.parse(readFileSync(new URL('packages/extension/src/managed-schema.json', root), 'utf8'));
    const allowed = schema.properties.allowedHosts.items.properties.platform.enum as string[];
    expect([...allowed].sort()).toEqual([...PLATFORM_IDS, 'config'].sort());
  });

  it('chaque plateforme a son libellé, en français ET en anglais', () => {
    for (const id of PLATFORM_IDS) {
      for (const lang of ['fr', 'en']) {
        expect(ui(lang, `options.platform.${id}`), `${lang} / ${id}`).not.toBe(`options.platform.${id}`);
      }
    }
  });

  it('les suffixes de produit viennent des fiches', () => {
    expect(inferPlatform('acme.ghe.com')).toBe('github');
    expect(inferPlatform('contoso.visualstudio.com')).toBe('azdo');
    expect(inferPlatform('ghes.example.corp')).toBeNull();
    for (const p of PLATFORMS) if (p.cloud) expect(p.inferHost(new URL(p.cloud.origin.replace('*', 'x')).hostname)).toBe(true);
  });
});

describe('§9.1 — le routage ne connaît que le registre', () => {
  it('une clé étrangère dans la répartition publiée ne devient pas une plateforme', () => {
    const extra = { github: [], azdo: [], gitlab: ['gitlab.example.corp'] } as unknown as Parameters<typeof selectPlatform>[1];
    expect(selectPlatform('gitlab.example.corp', extra)).toBeNull();
  });

  it('la plus précise l’emporte, une égalité au sommet ne tranche pas', () => {
    expect(selectPlatform('a.b.example', { github: ['*.example'], azdo: ['*.b.example'] })).toBe('azdo');
    expect(selectPlatform('a.example', { github: ['a.example'], azdo: ['a.example'] })).toBeNull();
  });
});

describe('§8.1.2 — credentials du relais : une seule réponse compte', () => {
  const answering = (c: RequestCredentials | null) => ({ configCredentials: () => c });

  it('aucune plateforme ne se prononce : la règle commune', () => {
    expect(configCredentialsFor('https://cfg.example/x.json', [answering(null), answering(null)])).toBe('include');
  });

  it('une seule se prononce : sa règle', () => {
    expect(configCredentialsFor('https://cfg.example/x.json', [answering('same-origin'), answering(null)])).toBe(
      'same-origin'
    );
  });

  it('deux en désaccord : la règle commune, jamais l’ordre du registre', () => {
    expect(configCredentialsFor('u', [answering('same-origin'), answering('omit')])).toBe('include');
    expect(configCredentialsFor('u', [answering('omit'), answering('same-origin')])).toBe('include');
  });

  it('les fiches réelles : seule la route raw de github.com porte une règle', () => {
    expect(configCredentialsFor('https://github.com/acme/demo/raw/main/.conventional-comments.json')).toBe('same-origin');
    expect(configCredentialsFor('https://config.corp.example/cc.json')).toBe('include');
  });
});
