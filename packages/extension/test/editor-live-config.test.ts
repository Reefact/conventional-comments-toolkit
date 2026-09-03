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
import { fingerprint, resolveConfig } from '@cct/core';

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

/** Empreinte réellement produite pour un texte de configuration de DÉPÔT donné — même
 * calcul que `ClientConfigResolver.resolve()` (organisation absente, aucun plancher, sans
 * épinglage). Sert à poser un `configFingerprint` publié qui CORRESPOND à la configuration
 * du moment, pour qu'un test puisse isoler le blocage dû au seul diagnostic du commentaire
 * sans jamais le confondre avec un écart d'empreinte (§8.1.3, règle 2). */
function fingerprintFor(configText: string): string {
  const { config } = resolveConfig(null, { status: 'absent' }, { status: 'found', text: configText }, null, false);
  return fingerprint(config);
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
  delete (globalThis as { chrome?: unknown }).chrome;
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

  it('F. un changement de labels EN MODE ACTIF reconstruit la barre d’outils, pas seulement la validation', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input';
    const host = document.createElement('div');
    const submit = document.createElement('button');
    host.append(element, submit);
    document.body.append(host);

    const state: FakeState = {
      // Défauts : le label "issue" est actif — un bouton lui correspond dans la barre.
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

    const issueButton = () => host.querySelector('.cct-label-button[data-label="issue"]');
    expect(issueButton()).not.toBeNull();

    // Le MODE reste `enforce` — seul le label change. `buildToolbar()`/`attachQuickInput()`
    // capturent la configuration à la construction et ne la relisent jamais (revue Codex,
    // PR #39) : sans reconstruction, ce bouton resterait affiché malgré la désactivation.
    state.configText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
      labels: [{ id: 'issue', enabled: false }],
    });
    // Un changement visible fait tourner l'observateur — le compte descend à 0, aucun fil
    // bloquant ne correspondant plus au label retiré n'a de sens ici, seul un changement de
    // `chromeSignatureOf` (état publié) compte pour déclencher un rendu.
    state.published = published({ state: 'success', unresolvedBlockingCount: 0 });
    document.body.appendChild(document.createElement('span'));
    await flushAll();

    // Sans le correctif (simple échange de `deps.resolved`), le bouton « issue » resterait
    // affiché — cliquable, pour poser un préfixe qu'`analyze()` ne reconnaît plus.
    expect(issueButton()).toBeNull();
  });

  it('G. une réconciliation plus ancienne, encore en vol, ne réinstalle pas un contrôleur après qu’une plus récente est passée à off', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input';
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

    // `readUserLanguage()`/`readDirectShortcuts()` (§8.1.2) lisent `chrome.storage.sync` —
    // c'est CETTE lecture, hors chemin critique du rendu, que `reconcile()` attend avant de
    // construire un nouveau contrôleur (revue Codex, PR #39) : un second rendu peut se
    // conclure entièrement pendant qu'elle est en vol, ouvrant la fenêtre de concurrence.
    // Bloquée manuellement ici pour la rendre observable, plutôt que de dépendre d'un tampon
    // réseau réel.
    // `renderPrChrome()` lit AUSSI la langue pour son propre rendu, avant même que
    // `reconcile()` ne soit atteint : le PREMIER appel, une fois armé, doit donc résoudre
    // normalement (sans quoi `run()` resterait `inFlight` et le second rendu, plus bas, ne
    // se déclencherait jamais) — seul le SECOND appel, celui de `reconcile()`, est bloqué.
    let armed = false;
    let callsSinceArmed = 0;
    let releaseBlockedRead: (() => void) | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: (_keys: string[], cb: (items: Record<string, unknown>) => void) => {
            if (armed) {
              callsSinceArmed++;
              if (callsSinceArmed === 2) {
                releaseBlockedRead = () => cb({});
                return;
              }
            }
            cb({});
          },
        },
      },
    };

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    disposers.push(await bootstrap(document));
    await flushAll();
    expect(host.querySelector('.cct-toolbar')).not.toBeNull();

    // Réconciliation N°1 : un changement de label, mode toujours `enforce` — force une
    // reconstruction dont la lecture de langue est bloquée.
    armed = true;
    state.configText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
      labels: [{ id: 'issue', enabled: false }],
    });
    // Un changement du résumé publié rend ce rendu VISIBLE (`chromeSignatureOf`) — sans lui,
    // rien ne distinguerait ce passage de « rien de neuf », et `run()` renoncerait avant
    // même d'atteindre `reconcile()`.
    state.published = published({ state: 'failure', unresolvedBlockingCount: 2 });
    document.body.appendChild(document.createElement('span'));
    await flushAll();
    expect(releaseBlockedRead).not.toBeNull(); // la première réconciliation attend bien

    // Réconciliation N°2, PENDANT que la première est encore en vol : le mode passe à
    // `off`. Aucune lecture de stockage sur ce chemin — elle se conclut immédiatement, avant
    // que la première n'ait eu la moindre chance de reprendre.
    state.configText = JSON.stringify({ mode: 'off', configCacheTtlSeconds: 0 });
    state.published = null;
    document.body.appendChild(document.createElement('span'));
    await flushAll();
    expect(host.querySelector('.cct-toolbar')).toBeNull(); // off a bien détaché

    // La première réconciliation reprend enfin.
    releaseBlockedRead!();
    await flushAll();

    // Sans le correctif (une génération par entrée, invalidée par TOUT appel de
    // `reconcile()` suivant), elle réinstallerait ici un contrôleur ACTIF par-dessus — la
    // barre réapparaîtrait alors que la configuration COURANTE est `off`.
    expect(host.querySelector('.cct-toolbar')).toBeNull();
  });

  it('H. la garde d’un éditeur ACTIF reste posée pendant sa reconstruction — jamais de fenêtre sans blocage (revue Codex, PR #39)', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input';
    const host = document.createElement('div');
    const submit = document.createElement('button');
    host.append(element, submit);
    document.body.append(host);

    const initialConfigText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
    });
    const state: FakeState = {
      configText: initialConfigText,
      // Comme dans le test A : aucun résumé publié à l'attachement, pas d'écart d'empreinte
      // possible tant qu'aucun résumé n'existe (§8.1.3, règle 2) — le blocage joue à plein
      // sur le seul diagnostic du commentaire, jamais sur une empreinte à faire concorder.
      published: null,
    };
    installAdapter(state, element, submit);

    // Même dispositif que G : seul le SECOND appel de `chrome.storage.sync.get` après
    // armement (celui de `reconcile()`, pas celui du rendu qui le précède) est bloqué.
    let armed = false;
    let callsSinceArmed = 0;
    let releaseBlockedRead: (() => void) | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: (_keys: string[], cb: (items: Record<string, unknown>) => void) => {
            if (armed) {
              callsSinceArmed++;
              if (callsSinceArmed === 2) {
                releaseBlockedRead = () => cb({});
                return;
              }
            }
            cb({});
          },
        },
      },
    };

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    element.value = 'pas de label ici'; // diagnostic bloquant sous enforce, déjà présent
    disposers.push(await bootstrap(document));
    await flushAll();
    expect(submit.getAttribute('aria-disabled')).toBe('true'); // bloqué : enforce, en périmètre, pas d'écart

    // Un changement de label EN MODE ACTIF force une reconstruction (test F) — la lecture
    // de langue qu'elle attend est bloquée pour observer la fenêtre entre l'ancien
    // contrôleur défait et le nouveau prêt. Le résumé publié porte l'empreinte EXACTE de
    // cette nouvelle configuration (`fingerprintFor`) : le diagnostic reste seul responsable
    // du blocage observé plus bas, jamais un écart d'empreinte qui le désarmerait pour une
    // tout autre raison que celle testée ici.
    armed = true;
    const nextConfigText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
      labels: [{ id: 'issue', enabled: false }],
    });
    state.configText = nextConfigText;
    state.published = published({
      state: 'failure',
      unresolvedBlockingCount: 1,
      configFingerprint: fingerprintFor(nextConfigText),
    });
    document.body.appendChild(document.createElement('span'));
    await flushAll();
    expect(releaseBlockedRead).not.toBeNull(); // la reconstruction attend bien

    // PENDANT la reconstruction : l'ANCIEN contrôleur, encore en place, garde son blocage —
    // jamais de fenêtre où le bouton redevient soumissible avant que le remplaçant ne soit
    // prêt (revue Codex, PR #39). Sans le correctif, l'ancien contrôleur était défait
    // immédiatement, avant même cette lecture, et `submit` perdait son grisage ici.
    expect(submit.getAttribute('aria-disabled')).toBe('true');

    releaseBlockedRead!();
    await flushAll();

    // Le remplaçant est bien en place, et continue de bloquer le même diagnostic toujours
    // affiché.
    expect(host.querySelector('.cct-toolbar')).not.toBeNull();
    expect(submit.getAttribute('aria-disabled')).toBe('true');
  });

  it('I. une entrée détachée pendant sa réconciliation n’attache jamais son remplaçant (revue Codex, PR #39)', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input';
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

    // Même dispositif que G/H : seul le SECOND appel de `chrome.storage.sync.get` après
    // armement (celui de `reconcile()`) est bloqué.
    let armed = false;
    let callsSinceArmed = 0;
    let releaseBlockedRead: (() => void) | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: (_keys: string[], cb: (items: Record<string, unknown>) => void) => {
            if (armed) {
              callsSinceArmed++;
              if (callsSinceArmed === 2) {
                releaseBlockedRead = () => cb({});
                return;
              }
            }
            cb({});
          },
        },
      },
    };

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    disposers.push(await bootstrap(document));
    await flushAll();
    expect(host.querySelector('.cct-toolbar')).not.toBeNull();

    // Un changement de label EN MODE ACTIF force une reconstruction — la lecture de langue
    // qu'elle attend est bloquée pour l'observer en vol.
    armed = true;
    state.configText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
      labels: [{ id: 'issue', enabled: false }],
    });
    state.published = published({ state: 'failure', unresolvedBlockingCount: 2 });
    document.body.appendChild(document.createElement('span'));
    await flushAll();
    expect(releaseBlockedRead).not.toBeNull(); // la reconstruction attend bien

    // La plateforme détache tout le sous-arbre PENDANT que cette réconciliation attend
    // encore — un fil masqué/virtualisé, ou un remplacement React du conteneur du
    // composeur. `host` reste intact (l'éditeur garde un parent, `attach()` ne bute donc
    // pas sur son garde `if (!host) return`) : seule sa connexion au DOCUMENT disparaît.
    host.remove();
    expect(element.isConnected).toBe(false);

    // Un rendu SUIVANT (résumé publié encore différent, pour rester visible) appelle
    // `releaseDetached()`, qui doit repérer cette entrée désormais détachée et l'invalider
    // — AVANT que la réconciliation bloquée plus haut ne reprenne.
    state.published = published({ state: 'failure', unresolvedBlockingCount: 3 });
    document.body.appendChild(document.createElement('span'));
    await flushAll();

    // La réconciliation bloquée reprend enfin.
    releaseBlockedRead!();
    await flushAll();

    // Sans le correctif, elle attacherait ici un tout NOUVEAU contrôleur — barre d'outils
    // comprise — sur ce sous-arbre DÉTACHÉ, que ni `revoke()` (qui ne parcourt que
    // `knownEditors`, dont cette entrée a été retirée) ni un passage à `off` ne pourraient
    // plus jamais retrouver pour le disposer.
    expect(host.querySelector('.cct-toolbar')).toBeNull();
  });

  it('J. la garde de l’ancien contrôleur passe à la NOUVELLE configuration dès le début de sa reconstruction (revue Reefact, PR #39)', async () => {
    const element = document.createElement('textarea');
    element.className = 'CommentBox-input';
    const host = document.createElement('div');
    const submit = document.createElement('button');
    host.append(element, submit);
    document.body.append(host);

    const initialConfigText = JSON.stringify({
      mode: 'warn', // pas de blocage, même avec un diagnostic présent
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
    });
    const state: FakeState = {
      configText: initialConfigText,
      // Comme dans les tests A/H : aucun résumé publié à l'attachement, pas d'écart
      // d'empreinte possible tant qu'aucun résumé n'existe (§8.1.3, règle 2).
      published: null,
    };
    installAdapter(state, element, submit);

    // Même dispositif que G/H/I : seul le SECOND appel de `chrome.storage.sync.get` après
    // armement (celui de `reconcile()`) est bloqué.
    let armed = false;
    let callsSinceArmed = 0;
    let releaseBlockedRead: (() => void) | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      storage: {
        sync: {
          get: (_keys: string[], cb: (items: Record<string, unknown>) => void) => {
            if (armed) {
              callsSinceArmed++;
              if (callsSinceArmed === 2) {
                releaseBlockedRead = () => cb({});
                return;
              }
            }
            cb({});
          },
        },
      },
    };

    const { bootstrap } = await import('../src/content-internal.js');
    Object.defineProperty(document, 'location', { value: new URL('https://github.com/acme/demo/pull/7'), configurable: true });
    element.value = 'pas de label ici'; // diagnostic présent, mais `warn` ne bloque jamais
    disposers.push(await bootstrap(document));
    await flushAll();
    expect(submit.hasAttribute('aria-disabled')).toBe(false); // warn : jamais de blocage

    // Le mode passe à `enforce` — la reconstruction qui en découle attend la lecture de
    // langue, bloquée pour observer l'état de la garde PENDANT cette attente.
    armed = true;
    const nextConfigText = JSON.stringify({
      mode: 'enforce',
      configCacheTtlSeconds: 0,
      activation: { activatedAt: '2019-01-01T00:00:00Z' },
    });
    state.configText = nextConfigText;
    state.published = published({
      state: 'failure',
      unresolvedBlockingCount: 1,
      configFingerprint: fingerprintFor(nextConfigText),
    });
    document.body.appendChild(document.createElement('span'));
    await flushAll();
    expect(releaseBlockedRead).not.toBeNull(); // la reconstruction attend bien

    // PENDANT la reconstruction, AVANT que le remplaçant ne soit prêt : la garde de
    // l'ANCIEN contrôleur, elle, a déjà basculé sur la NOUVELLE configuration — sans
    // attendre la fin des lectures de stockage (revue Reefact, PR #39). Sans ce rappel
    // immédiat, `submit` resterait débloqué ici, un commentaire invalide restant
    // publiable jusqu'à la fin de ces lectures.
    expect(submit.getAttribute('aria-disabled')).toBe('true');

    releaseBlockedRead!();
    await flushAll();

    // Le remplaçant est en place, et bloque toujours le même diagnostic.
    expect(submit.getAttribute('aria-disabled')).toBe('true');
  });
});
