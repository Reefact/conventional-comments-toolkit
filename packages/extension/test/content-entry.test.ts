// @vitest-environment happy-dom
// Le POINT D'ENTRÉE du script de contenu, et sa seule question : combien de fois
// `bootstrap()` part-elle quand le même document reçoit le script deux fois ?
//
// Le document a désormais deux chemins d'injection, et ils peuvent viser la même page :
// l'enregistrement dynamique sert les chargements suivants, et le service worker rattrape
// les onglets DÉJÀ ouverts par `chrome.scripting.executeScript` — sans quoi l'onglet depuis
// lequel on vient d'autoriser l'hôte reste inerte jusqu'à un rechargement (mesuré dans un
// vrai Chromium par `spikes/open-tab-injection.mjs`). Un onglet injecté à chaud puis
// rechargé, ou un hôte déjà servi qu'on reclasse, traverse donc les deux.
//
// `bootstrap()` n'est pas idempotente — c'est le dédoublement de l'interface qui avait
// motivé l'enregistrement unique. Le garde est un marqueur posé dans le monde isolé, que
// les deux chemins partagent.
//
// Ce fichier mesure l'effet, pas le marqueur : il compte les appels à `bootstrap`. Un test
// qui vérifierait la présence du drapeau confirmerait l'écriture du code par lui-même.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrap = vi.fn(async () => () => {});
vi.mock('../src/content-internal.js', () => ({ bootstrap }));

/** Le point d'entrée s'exécute À L'IMPORT et ne s'exporte pas : le rejouer suppose de vider
 * le cache de modules, en laissant `globalThis` INTACT — c'est justement là que vit le
 * marqueur, et le remettre à zéro entre les deux imports reviendrait à simuler deux pages
 * différentes, donc à ne rien mesurer du tout. */
async function injectOnce(): Promise<void> {
  vi.resetModules();
  await import('../src/content.js');
}

describe('point d’entrée du script de contenu', () => {
  beforeEach(() => {
    bootstrap.mockClear();
    delete (globalThis as unknown as Record<string, unknown>)['__cctContentScriptLoaded'];
    (globalThis as unknown as Record<string, unknown>)['chrome'] = { runtime: {} };
  });

  it('bootstrape au premier chargement du script', async () => {
    await injectOnce();
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('ne bootstrape pas une deuxième fois dans le MÊME document (double injection)', async () => {
    await injectOnce();
    await injectOnce();
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('bootstrape de nouveau dans un document neuf (le marqueur ne survit pas à la page)', async () => {
    await injectOnce();
    delete (globalThis as unknown as Record<string, unknown>)['__cctContentScriptLoaded'];
    bootstrap.mockClear();
    await injectOnce();
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });
});
