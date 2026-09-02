// @vitest-environment happy-dom
//
// Trois défauts trouvés en revue (Reefact, PR #39) dans le rafraîchissement en direct des
// éditeurs déjà ouverts, tous distincts du sondage périodique lui-même (couvert par
// pr-chrome-navigation.test.ts) : ils portent sur ce que `bootstrap()` fait de chaque
// éditeur CONNU quand `observePrChromeNavigation` lui signale un rendu — via son propre
// sondage, ou via un simple rendu déclenché par une mutation ordinaire, peu importe.
//
// A. `updateResolved()` ne repoussait que la configuration, jamais le résumé publié
//    (`deps.published`) : un écart d'empreinte constaté pendant qu'un changement de
//    configuration se propage restait vrai indéfiniment, même une fois le serveur à jour.
// D. Le passage au mode `off` désarmait le blocage (`refresh()`) mais laissait la barre
//    d'outils et la saisie rapide vivantes — construites une fois pour toutes à `attach()`,
//    donc sur l'ANCIENNE configuration — alors que §7 définit `off` comme une extension
//    ENTIÈREMENT inactive.
// E. Un éditeur découvert PENDANT que le mode est `off` n'était jamais ajouté au registre
//    des contrôleurs attachés : un retour ultérieur du mode à `enforce`/`warn` ne
//    l'attachait donc jamais, jusqu'à sa fermeture/réouverture ou au rechargement de la page.
//
// Toutes les configurations posent `configCacheTtlSeconds: 0` : chaque `resolve()` relit
// alors la configuration pour de vrai, sans qu'aucun test n'ait à avancer une horloge ou à
// attendre un TTL réel — un changement de configuration est adopté au prochain rendu
// (déclenché ici par un changement visible du résumé publié, jamais par une mutation dont le
// rendu ne dépend pas).

import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeState {
  configText: string;
  published: Record<string, unknown> | null;
}

function pr7(): { platform: string; createdAt: string; host: string; scope: string[]; number: number } {
  return { platform: 'github', createdAt: '2020-01-01T00:00:00Z', host: 'github.com', scope: ['acme', 'demo'], number: 7 };
}

/** Un seul éditeur, livré UNE fois par `observeEditors` — comme le composeur toujours
 * présent d'une PR ouverte. `element`/`submit` sont de VRAIS nœuds DOM, attachés au document
 * (contrairement à extra-hosts.test.ts, qui n'en a pas besoin) : `EditorController` réel,
 * ici jamais mocké, y insère sa barre d'outils et sa saisie rapide pour de vrai. */
function installAdapter(state: FakeState, element: HTMLTextAreaElement, submit: HTMLButtonElement): void {
  vi.doMock('@cct/adapter-github', () => ({
    GithubClientAdapter: class {
      matchesHost(url: URL): boolean {
        return url.hostname === 'github.com';
      }
      async getCurrentUser() {
        return { id: 'login:alice', login: 'alice', isServiceAccount: false };
      }
      async getRepoConfig() {
        return { status: 'found', text: state.configText };
      }
      async getOrgConfig() {
        return { status: 'absent' };
      }
      observeEditors(cb: (editor: unknown) => void) {
        cb({
          element,
          context: { pr: pr7(), zone: 'thread-root', action: 'compose', canCarryBlockingState: true, inScope: true },
        });
        return { dispose: () => {} };
      }
      currentPr() {
        return pr7();
      }
      readPublishedResult() {
        return state.published;
      }
      getThreads() {
        return [];
      }
      getSubmitControls() {
        return [{ element: submit, kind: 'submit' }];
      }
      platformProfile() {
        return { id: 'github', suggestionInfoString: 'suggestion' };
      }
      getCompletionControl() {
        return null;
      }
      readValue() {
        return element.value;
      }
      writeValue(_editor: unknown, text: string) {
        element.value = text;
      }
    },
  }));
  vi.doMock('@cct/adapter-azdo', () => ({
    AzdoClientAdapter: class {
      matchesHost(): boolean {
        return false;
      }
    },
  }));
}

function published(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    state: 'success',
    isDraft: false,
    exempted: false,
    mode: 'enforce',
    coreVersion: '1.0.0',
    configFingerprint: 'deadbeef',
    activatedAt: null,
    unresolvedBlockingCount: 0,
    nonCompliantCommentCount: 0,
    warningCount: 0,
    ...overrides,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
async function flushAll(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await flush();
}

// `bootstrap()` arme un MutationObserver ET un minuteur de sondage VIVANTS sur le
// `document` PARTAGÉ par tout ce fichier (même convention que pr-chrome-navigation.test.ts) :
// un test qui ne défait pas le sien laisserait son observateur réagir aux mutations des
// tests SUIVANTS — plusieurs instances de bootstrap() concurrentes sur le même DOM
// finissent par s'écrire l'une sur l'autre sans jamais se stabiliser, jusqu'à épuiser la
// mémoire du worker (constaté : OOM en exécutant ce fichier en entier sans ce nettoyage).
const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.doUnmock('@cct/adapter-github');
  vi.doUnmock('@cct/adapter-azdo');
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('revue Reefact, PR #39 — rafraîchissement en direct des éditeurs déjà ouverts', () => {
  it('A. le résumé publié est relu au moment du rafraîchissement, pas gardé de l’attachement d’origine', async () => {
    const element = document.createElement('textarea');
    const submit = document.createElement('button');
    document.body.append(element, submit);

    const state: FakeState = {
      configText: JSON.stringify({
        mode: 'enforce',
        configCacheTtlSeconds: 0,
        activation: { activatedAt: '2019-01-01T00:00:00Z' },
      }),
      // Aucun résultat publié à l'attachement : pas d'écart d'empreinte possible tant
      // qu'aucun résumé n'existe (§8.1.3, règle 2) — le blocage joue donc à plein sur le
      // seul diagnostic du commentaire.
      published: null,
    };
    installAdapter(state, element, submit);

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    element.value = 'pas de label ici'; // diagnostic bloquant sous enforce
    disposers.push(await bootstrap(document));
    await flushAll();

    expect(submit.getAttribute('aria-disabled')).toBe('true'); // bloqué : enforce, en périmètre, pas d'écart

    // La configuration change (une clé quelconque du domaine du fingerprint suffit) — un
    // rendu la reprend forcément puisque `configCacheTtlSeconds: 0` empêche tout cache.
    // Le résumé publié, dans le MÊME mouvement, affiche une empreinte QUI NE PEUT PAS
    // correspondre à la nouvelle configuration : un écart authentique, qui doit désarmer
    // le blocage (§8.1.3, règle 2) — mais seulement si ce résumé est effectivement LU à cet
    // instant, jamais celui, `null`, capturé à l'attachement.
    state.configText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
      exemptUsers: ['someone-else'],
    });
    state.published = published({ state: 'failure', unresolvedBlockingCount: 1, configFingerprint: 'NE-PEUT-PAS-CORRESPONDRE' });

    document.body.appendChild(document.createElement('span')); // fait tourner l'observateur
    await flushAll();

    // Sans le correctif, `deps.published` resterait `null` : aucun écart n'est jamais
    // constaté, et le bouton resterait bloqué pour la bonne raison (le diagnostic), en
    // ignorant l'écart d'empreinte qui aurait dû le désarmer.
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
  });

  it('D. le passage au mode off retire aussi la barre d’outils et la saisie rapide, pas seulement le blocage', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input'; // génération React reconnue par EditorController
    const host = document.createElement('div');
    const submit = document.createElement('button');
    host.append(element, submit);
    document.body.append(host);

    const state: FakeState = {
      configText: JSON.stringify({
        mode: 'enforce',
        configCacheTtlSeconds: 0,
        activation: { activatedAt: '2019-01-01T00:00:00Z' },
      }),
      published: published({ state: 'failure', unresolvedBlockingCount: 1 }),
    };
    installAdapter(state, element, submit);

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    disposers.push(await bootstrap(document));
    await flushAll();

    expect(host.querySelector('.cct-toolbar')).not.toBeNull(); // §5.1 — barre installée

    // Le mode passe à `off` — un rendu le reprend forcément (`configCacheTtlSeconds: 0`) dès
    // qu'un changement visible (ici, le résumé publié qui disparaît) fait tourner
    // l'observateur.
    state.configText = JSON.stringify({ mode: 'off', configCacheTtlSeconds: 0 });
    state.published = null;
    document.body.appendChild(document.createElement('span'));
    await flushAll();

    // §7 : mode off = extension ENTIÈREMENT inactive. `updateResolved()` seul ne fait que
    // désarmer la validation ; sans détacher/reconstruire le contrôleur lui-même, la barre
    // et la saisie rapide — posées sur l'ANCIENNE configuration — resteraient vivantes et
    // capables de modifier le commentaire.
    expect(host.querySelector('.cct-toolbar')).toBeNull();
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
  });

  it('E. un éditeur découvert en mode off s’attache dès que le mode redevient actif, sans réouverture', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input';
    const host = document.createElement('div');
    const submit = document.createElement('button');
    host.append(element, submit);
    document.body.append(host);

    const state: FakeState = {
      // Mode off DÈS LA DÉCOUVERTE : l'éditeur n'a donc jamais eu de contrôleur.
      configText: JSON.stringify({ mode: 'off', configCacheTtlSeconds: 0 }),
      published: null,
    };
    installAdapter(state, element, submit);

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    element.value = 'pas de label ici';
    disposers.push(await bootstrap(document));
    await flushAll();

    expect(host.querySelector('.cct-toolbar')).toBeNull(); // §7 — jamais attaché, mode off

    // Le mode redevient actif — toujours reflété au prochain rendu, `configCacheTtlSeconds:
    // 0` empêchant tout cache de le retarder.
    state.configText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
    });
    state.published = published({ state: 'failure', unresolvedBlockingCount: 1 });
    document.body.appendChild(document.createElement('span'));
    await flushAll();

    // Sans le correctif, ce rafraîchissement ne parcourt que les éditeurs déjà ATTACHÉS —
    // vide, puisque celui-ci a été ignoré à sa découverte — et ce composeur resterait sans
    // barre d'outils ni validation jusqu'à sa fermeture/réouverture ou au rechargement de
    // la page.
    expect(host.querySelector('.cct-toolbar')).not.toBeNull();
    // Un bouton de label prouve un contrôleur RÉELLEMENT attaché (`attach()` exécuté), pas
    // seulement un vestige DOM : `buildToolbar()` ne les pose qu'à l'attachement.
    expect(host.querySelectorAll('.cct-label-button').length).toBeGreaterThan(0);
  });
});
