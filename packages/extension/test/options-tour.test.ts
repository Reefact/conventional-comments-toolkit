// @vitest-environment happy-dom
// La MÉCANIQUE de la visite : quelles étapes, dans quel ordre, et que retient-elle.
//
// Ce que ce fichier NE peut PAS voir, et il faut le dire plutôt que le laisser croire : où
// la fiche tombe. happy-dom n'a pas de mise en page — tout rectangle y est nul. Les deux
// défauts réels de la première version étaient précisément de ce genre (dernière étape hors
// écran, fiche débordant sous la fenêtre) et sont tenus par `spikes/options-tour.mjs`.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOUR_SEEN_KEY, startTour } from '../src/options/tour.js';

const OPTIONS_HTML = readFileSync(
  resolve(process.cwd(), 'packages/extension/src/options/options.html'),
  'utf8'
);

function mountPage(): void {
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(OPTIONS_HTML)?.[1] ?? '';
}

/** Faux `chrome.storage.local` qui CONSERVE ce qu'on lui écrit : le drapeau de fin de visite
 * n'a aucun intérêt si le faux l'oublie aussitôt. */
function installStorage(initial: Record<string, unknown> = {}): Record<string, unknown> {
  const store = { ...initial };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: (keys: string[], cb: (i: Record<string, unknown>) => void) => {
          const picked: Record<string, unknown> = {};
          for (const key of keys) if (key in store) picked[key] = store[key];
          cb(picked);
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, items);
          cb?.();
        },
      },
    },
  };
  return store;
}

const titles = () => document.querySelector('.tour-title')?.textContent ?? null;

describe('parcours de la visite', () => {
  beforeEach(() => {
    mountPage();
    installStorage();
  });

  it('saute « Domaines non configurés » tant que la zone est masquée', () => {
    // Cette zone est une ANOMALIE : la présenter quand elle est vide reviendrait à décrire
    // à quelqu'un un problème qu'il n'a pas.
    const tour = startTour(document, 'fr');
    expect(tour?.length).toBe(7);
  });

  it('l’inclut dès qu’elle est visible', () => {
    document.getElementById('unconfigured-panel')?.removeAttribute('hidden');
    const tour = startTour(document, 'fr');
    expect(tour?.length).toBe(8);
  });

  it('avance, recule, et ne déborde à aucun bout', () => {
    const tour = startTour(document, 'fr')!;
    expect(tour.index).toBe(0);
    tour.previous(); // au premier : ne fait rien plutôt que de sortir par le bas
    expect(tour.index).toBe(0);
    tour.next();
    tour.next();
    expect(tour.index).toBe(2);
    tour.previous();
    expect(tour.index).toBe(1);
  });

  it('le dernier « Suivant » devient « Terminer » et ferme la visite', () => {
    const tour = startTour(document, 'fr')!;
    for (let i = 0; i < tour.length - 1; i += 1) tour.next();
    expect(document.querySelector('.tour-next')?.textContent).toBe('Terminer');
    tour.next();
    expect(document.getElementById('tour')).toBeNull();
  });

  it('parle la langue qu’on lui donne', () => {
    startTour(document, 'en');
    expect(titles()).toBe('Allowed domains');
    expect(document.querySelector('.tour-skip')?.textContent).toBe('Skip');
    document.getElementById('tour')?.remove();
    startTour(document, 'fr');
    expect(titles()).toBe('Domaines autorisés');
    expect(document.querySelector('.tour-skip')?.textContent).toBe('Passer');
  });
});

describe('ce que la visite retient', () => {
  beforeEach(() => mountPage());

  it('« Passer » compte comme une réponse : la visite ne revient pas', () => {
    // Refuser la visite EST une réponse. La reproposer au rechargement suivant ferait d'un
    // écran de réglages un obstacle à franchir chaque fois.
    const store = installStorage();
    const tour = startTour(document, 'fr')!;
    tour.stop();
    expect(store[TOUR_SEEN_KEY]).toBe(true);
    expect(document.getElementById('tour')).toBeNull();
  });

  it('aller au bout la retient aussi', () => {
    const store = installStorage();
    const tour = startTour(document, 'fr')!;
    for (let i = 0; i < tour.length; i += 1) tour.next();
    expect(store[TOUR_SEEN_KEY]).toBe(true);
  });

  it('Échap ferme la visite', () => {
    // Une modale sans échappement clavier n'est pas franchissable sans souris (§10,
    // Accessibilité) — et celle-ci s'ouvre toute seule, sans qu'on l'ait demandée.
    const store = installStorage();
    startTour(document, 'fr');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('tour')).toBeNull();
    expect(store[TOUR_SEEN_KEY]).toBe(true);
  });

  it('arrêter deux fois ne casse rien', () => {
    installStorage();
    const tour = startTour(document, 'fr')!;
    tour.stop();
    expect(() => tour.stop()).not.toThrow();
  });
});

describe('ce qui assombrit la page', () => {
  beforeEach(() => {
    mountPage();
    installStorage();
  });

  it('le voile cesse d’assombrir dès qu’une lucarne le fait, mais reste en place', () => {
    // Deux rôles distincts, et les confondre a produit deux défauts. ASSOMBRIR : les deux à
    // la fois grisent aussi la zone que la lucarne éclaire — vu sur une capture, l'étape 1
    // encadrait une zone exactement aussi sombre que le reste. BLOQUER : l'ombre de la
    // lucarne ne bloque rien (`pointer-events: none`), donc retirer le voile rendrait toute
    // la page cliquable sous une fiche qui se déclare `aria-modal`.
    const tour = startTour(document, 'fr')!;
    const veil = document.querySelector('.tour-veil') as HTMLElement;
    expect(veil.hidden).toBe(false);
    expect(veil.classList.contains('tour-veil-dim')).toBe(false);
    expect((document.querySelector('.tour-spot') as HTMLElement).hidden).toBe(false);

    // La dernière étape n'a pas de cible : là, le voile est le SEUL à assombrir.
    for (let i = 0; i < tour.length - 1; i += 1) tour.next();
    expect(veil.hidden).toBe(false);
    expect(veil.classList.contains('tour-veil-dim')).toBe(true);
    expect((document.querySelector('.tour-spot') as HTMLElement).hidden).toBe(true);
  });
});

describe('la fiche est une vraie modale', () => {
  beforeEach(() => {
    mountPage();
    installStorage();
  });

  it('porte les rôles ARIA qui l’annoncent, et nomme son titre', () => {
    startTour(document, 'fr');
    const popover = document.querySelector('.tour-popover')!;
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(popover.getAttribute('aria-modal')).toBe('true');
    // Le titre et le corps sont DÉSIGNÉS, pas seulement présents : sans ces liens, un
    // lecteur d'écran annonce « dialogue » et s'arrête là.
    expect(document.getElementById(popover.getAttribute('aria-labelledby')!)).not.toBeNull();
    expect(document.getElementById(popover.getAttribute('aria-describedby')!)).not.toBeNull();
  });

  it('« Précédent » est caché à la première étape, « Passer » à la dernière', () => {
    const tour = startTour(document, 'fr')!;
    expect((document.querySelector('.tour-back') as HTMLElement).hidden).toBe(true);
    tour.next();
    expect((document.querySelector('.tour-back') as HTMLElement).hidden).toBe(false);
    for (let i = tour.index; i < tour.length - 1; i += 1) tour.next();
    // Plus rien à passer : deux boutons qui feraient la même chose se lisent comme un choix.
    expect((document.querySelector('.tour-skip') as HTMLElement).hidden).toBe(true);
  });
});


describe('rejouer la visite', () => {
  beforeEach(() => {
    mountPage();
    installStorage({ [TOUR_SEEN_KEY]: true });
  });

  it('le bouton existe dans la vraie page, et porte une clé de catalogue', () => {
    // Il vit dans l'en-tête, pas dans « Préférences locales » : la visite couvre TOUTE la
    // page, et on ne demande pas à quelqu'un de perdu de faire défiler pour trouver l'aide.
    const button = document.getElementById('tour-replay');
    expect(button).not.toBeNull();
    expect(button?.querySelector('[data-i18n="options.tour.replay"]')).not.toBeNull();
  });

  it('une visite déjà vue peut être relancée à la demande', () => {
    // `startTour` ne consulte PAS le drapeau — c'est `maybeStartTour` qui décide. Cette
    // séparation est exactement ce qui rend le bouton possible.
    expect(startTour(document, 'fr')).not.toBeNull();
    expect(document.getElementById('tour')).not.toBeNull();
  });

  it('deux lancements ne font qu’une visite', () => {
    // Le bouton reste cliquable pendant qu'une visite tourne, puisqu'il n'est ni masqué ni
    // désactivé. Deux visites empilées donneraient deux voiles et deux fiches, dont une
    // seule fermable.
    startTour(document, 'fr');
    expect(startTour(document, 'fr')).toBeNull();
    expect(document.querySelectorAll('.tour-popover')).toHaveLength(1);
  });

  it('rend le clavier à qui l’avait en sortant', () => {
    // Sans cela, fermer la visite laisse le focus nulle part : la tabulation repart du début
    // du document, et qui l'a ouverte au clavier doit retraverser la page (§10).
    const button = document.getElementById('tour-replay') as HTMLButtonElement;
    button.focus();
    const tour = startTour(document, 'fr')!;
    tour.stop();
    expect(document.activeElement).toBe(button);
  });
});


describe('la visite au clavier', () => {
  beforeEach(() => {
    mountPage();
    installStorage();
  });

  const tab = (shiftKey = false) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }));

  it('la tabulation ne sort pas de la fiche', () => {
    // La visite est ajoutée en fin de `<body>` et se déclare `aria-modal` : sans cycle, une
    // tabulation depuis le dernier bouton repart dans les contrôles de la page, que le voile
    // bloque à la souris mais pas au clavier.
    startTour(document, 'fr');
    const forward = document.querySelector('.tour-next') as HTMLElement;
    const skip = document.querySelector('.tour-skip') as HTMLElement;
    forward.focus();
    tab();
    expect(document.activeElement).toBe(skip); // reboucle au premier, pas vers la page
    tab(true);
    expect(document.activeElement).toBe(forward);
  });

  it('un focus égaré est ramené dans la fiche', () => {
    startTour(document, 'fr');
    (document.getElementById('host-input') as HTMLElement).focus();
    tab();
    expect(document.querySelector('.tour-popover')?.contains(document.activeElement)).toBe(true);
  });

  it('le cycle ignore les boutons masqués', () => {
    // « Passer » disparaît à la dernière étape : un cycle qui le compterait encore
    // s'arrêterait sur un bouton invisible.
    const tour = startTour(document, 'fr')!;
    for (let i = 0; i < tour.length - 1; i += 1) tour.next();
    const forward = document.querySelector('.tour-next') as HTMLElement;
    const back = document.querySelector('.tour-back') as HTMLElement;
    forward.focus();
    tab();
    expect(document.activeElement).toBe(back);
  });

  it('le focus ne reste pas sur un bouton que l’étape vient de masquer', () => {
    const tour = startTour(document, 'fr')!;
    (document.querySelector('.tour-skip') as HTMLElement).focus();
    for (let i = 0; i < tour.length - 1; i += 1) tour.next();
    expect(document.activeElement).toBe(document.querySelector('.tour-next'));
  });

  it('le texte qui change vit dans une région annoncée', () => {
    // Sans elle, « Suivant » remplace titre et corps en silence pendant que le focus reste
    // sur le bouton : rien ne dit que le sujet du dialogue a changé.
    startTour(document, 'fr');
    const live = document.querySelector('.tour-live');
    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.contains(document.querySelector('.tour-title'))).toBe(true);
    expect(live?.contains(document.querySelector('.tour-body'))).toBe(true);
    // Les boutons N'Y SONT PAS : `aria-atomic` relit toute la région, et y inclure la
    // navigation ferait relire « Passer Précédent Suivant » à chaque étape.
    expect(live?.contains(document.querySelector('.tour-next'))).toBe(false);
  });
});
