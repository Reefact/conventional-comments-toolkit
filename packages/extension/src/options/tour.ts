// Visite guidée de la page d'options, jouée UNE FOIS, au premier passage.
//
// Pourquoi elle existe : depuis que plus aucun hôte n'est pré-déclaré dans le manifeste,
// une extension fraîchement installée ne fait rien nulle part tant que personne n'a autorisé
// un domaine. Ce n'est pas un défaut — c'est le prix du consentement explicite — mais c'est
// un écran de réglages dont dépend, pour la première fois, que le produit fonctionne du tout.
//
// Ce qu'elle N'EST PAS : un tutoriel du produit. Elle nomme les quatre sections et dit à quoi
// sert chacune ; ce que fait l'extension sur une PR ne se raconte pas ici.

import { ui } from '../ui/strings.js';

/** Une étape : ce qu'on montre, et ce qu'on en dit.
 *
 * `targets` est un TABLEAU parce que la première étape en couvre deux — « Domaines connus »
 * et « Autres domaines » sont deux façons d'autoriser, pas deux sujets, et les séparer
 * ferait deux étapes qui disent la même chose. La lucarne épouse alors leur union.
 *
 * Les textes sont des CLÉS de catalogue, pas des phrases : la page est bilingue (§10), et
 * une visite qui ne le serait pas accueillerait un anglophone en français — exactement le
 * défaut que cette page avait par ailleurs. */
interface Step {
  targets: string[];
  title: string;
  body: string;
  /** Étape conditionnelle : sautée si elle rend `false`. La zone « Domaines non configurés »
   * n'existe que si quelque chose l'a remplie, et présenter une anomalie absente
   * l'inventerait. */
  when?: (doc: Document) => boolean;
}

const STEPS: Step[] = [
  {
    targets: ['#panel-known', '#panel-other'],
    title: 'tour.hosts.title',
    body: 'tour.hosts.body',
  },
  {
    targets: ['#panel-configured'],
    title: 'tour.configured.title',
    body: 'tour.configured.body',
  },
  {
    targets: ['#unconfigured-panel'],
    title: 'tour.unconfigured.title',
    body: 'tour.unconfigured.body',
    // Présentée seulement si elle est déjà là : c'est une anomalie, pas une étape du parcours.
    when: (doc) => doc.getElementById('unconfigured-panel')?.hasAttribute('hidden') === false,
  },
  {
    targets: ['#field-language'],
    title: 'tour.language.title',
    body: 'tour.language.body',
  },
  {
    targets: ['#field-shortcuts'],
    title: 'tour.shortcuts.title',
    body: 'tour.shortcuts.body',
  },
  {
    targets: ['#group-telemetry'],
    title: 'tour.telemetry.title',
    body: 'tour.telemetry.body',
  },
  {
    targets: ['#group-status'],
    title: 'tour.status.title',
    body: 'tour.status.body',
  },
  { targets: [], title: 'tour.end.title', body: 'tour.end.body' },
];

/** Clé du drapeau « déjà vue ». Écrite quand la visite se termine ET quand on l'interrompt :
 * la refuser est une réponse, pas une absence de réponse, et la reproposer au rechargement
 * suivant ferait d'un écran de réglages un obstacle. */
export const TOUR_SEEN_KEY = 'optionsTourSeen';

declare const chrome:
  | {
      storage?: {
        local?: {
          get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
          set: (items: Record<string, unknown>, cb?: () => void) => void;
        };
      };
    }
  | undefined;

function markSeen(): void {
  try {
    chrome?.storage?.local?.set({ [TOUR_SEEN_KEY]: true });
  } catch {
    // Un stockage indisponible ne doit pas empêcher la visite de se FERMER. Le prix est de
    // la revoir au prochain chargement, ce qui est moins grave que de rester dedans.
  }
}

function hasBeenSeen(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const local = chrome?.storage?.local;
      if (!local) return resolve(true); // pas de mémoire : ne pas jouer plutôt que rejouer sans fin
      local.get([TOUR_SEEN_KEY], (items) => resolve(items?.[TOUR_SEEN_KEY] === true));
    } catch {
      resolve(true);
    }
  });
}

/** L'union des rectangles des cibles, en coordonnées de DOCUMENT et non de fenêtre : la
 * lucarne est posée dans le flux de la page, donc elle doit survivre au défilement que
 * l'étape déclenche elle-même. */
function unionRect(doc: Document, selectors: string[]): DOMRect | null {
  const rects = selectors
    .map((selector) => doc.querySelector(selector))
    .filter((el): el is Element => el !== null)
    .map((el) => el.getBoundingClientRect());
  if (rects.length === 0) return null;
  const view = doc.defaultView;
  const scrollX = view?.scrollX ?? 0;
  const scrollY = view?.scrollY ?? 0;
  const top = Math.min(...rects.map((r) => r.top)) + scrollY;
  const left = Math.min(...rects.map((r) => r.left)) + scrollX;
  const bottom = Math.max(...rects.map((r) => r.bottom)) + scrollY;
  const right = Math.max(...rects.map((r) => r.right)) + scrollX;
  return new DOMRect(left, top, right - left, bottom - top);
}

export interface TourHandle {
  /** Nombre d'étapes réellement retenues — les conditionnelles écartées n'y sont pas. */
  readonly length: number;
  next: () => void;
  previous: () => void;
  stop: () => void;
  readonly index: number;
}

/** Monte la visite et rend de quoi la piloter. N'interroge PAS le drapeau : c'est
 * `maybeStartTour()` qui décide s'il faut jouer, et cette séparation est ce qui rend la
 * mécanique testable sans stockage. */
export function startTour(doc: Document = document, lang = 'en'): TourHandle | null {
  // Une visite à la fois. Le bouton « Revoir » reste cliquable pendant qu'une visite tourne
  // — il vit dans l'en-tête, ni masqué ni désactivé —, et deux visites empilées donneraient
  // deux voiles, deux fiches, et une seule fermable.
  if (doc.getElementById('tour')) return null;

  const steps = STEPS.filter((step) => !step.when || step.when(doc));
  if (steps.length === 0) return null;

  /** À qui rendre le clavier en sortant. Sans cela, fermer la visite laisse le focus nulle
   * part : la tabulation repart du début du document, et qui l'a ouverte au clavier doit
   * retraverser la page pour retrouver sa place (§10, Accessibilité). */
  const opener = doc.activeElement;

  const root = doc.createElement('div');
  root.className = 'tour';
  root.id = 'tour';

  const veil = doc.createElement('div');
  veil.className = 'tour-veil';

  // La lucarne n'est pas un trou dans le voile : c'est un cadre posé PAR-DESSUS, dont
  // l'ombre portée démesurée fait l'assombrissement. Un vrai trou demanderait un masque SVG
  // ou quatre rectangles à recalculer, pour le même rendu.
  const spot = doc.createElement('div');
  spot.className = 'tour-spot';

  const popover = doc.createElement('div');
  popover.className = 'tour-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');
  popover.setAttribute('aria-labelledby', 'tour-title');
  popover.setAttribute('aria-describedby', 'tour-body');

  const counter = doc.createElement('p');
  counter.className = 'tour-counter';

  const title = doc.createElement('h2');
  title.className = 'tour-title';
  title.id = 'tour-title';

  const body = doc.createElement('p');
  body.className = 'tour-body';
  body.id = 'tour-body';

  const actions = doc.createElement('div');
  actions.className = 'tour-actions';

  const skip = doc.createElement('button');
  skip.type = 'button';
  skip.className = 'btn btn-s tour-skip';
  skip.textContent = ui(lang, 'tour.skip');

  const spacer = doc.createElement('span');
  spacer.className = 'tour-spacer';

  const back = doc.createElement('button');
  back.type = 'button';
  back.className = 'btn btn-s tour-back';
  back.textContent = ui(lang, 'tour.back');

  const forward = doc.createElement('button');
  forward.type = 'button';
  forward.className = 'btn btn-p tour-next';

  actions.append(skip, spacer, back, forward);
  popover.append(counter, title, body, actions);
  root.append(veil, spot, popover);
  doc.body.appendChild(root);

  let index = 0;
  let stopped = false;

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      stop();
    }
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    doc.removeEventListener('keydown', onKey);
    root.remove();
    markSeen();
    (opener as HTMLElement | null)?.focus?.();
  }

  function render(): void {
    const step = steps[index]!;
    counter.textContent = ui(lang, 'tour.counter', {
      index: index + 1,
      total: steps.length,
    });
    title.textContent = ui(lang, step.title);
    body.textContent = ui(lang, step.body);
    back.hidden = index === 0;
    const last = index === steps.length - 1;
    forward.textContent = ui(lang, last ? 'tour.done' : 'tour.next');
    // « Passer » n'a plus de sens sur la dernière étape : il n'y a plus rien à passer, et
    // deux boutons qui font la même chose se lisent comme un choix.
    skip.hidden = last;

    const rect = unionRect(doc, step.targets);
    if (!rect) {
      // Étape sans cible (la dernière) : pas de lucarne, la fiche se centre d'elle-même.
      //
      // Les positions EN LIGNE sont effacées, et ce n'est pas une précaution : la classe
      // centrée passe en `position: fixed`, où un `top` hérité de l'étape précédente
      // s'interprète en coordonnées de FENÊTRE alors qu'il a été calculé en coordonnées de
      // DOCUMENT. La dernière étape partait donc hors écran, d'autant plus loin qu'on avait
      // défilé — mesuré dans un vrai Chromium, où le bouton « Terminer » existait, était
      // visible pour le DOM, et restait inatteignable. Aucun test happy-dom ne pouvait le
      // voir : il n'y a pas de mise en page à interroger.
      spot.hidden = true;
      popover.style.top = '';
      popover.style.left = '';
      popover.classList.add('tour-popover-centered');
      return;
    }
    spot.hidden = false;
    popover.classList.remove('tour-popover-centered');
    const margin = 6;
    spot.style.top = `${rect.top - margin}px`;
    spot.style.left = `${rect.left - margin}px`;
    spot.style.width = `${rect.width + margin * 2}px`;
    spot.style.height = `${rect.height + margin * 2}px`;
    // Amener la cible à l'écran AVANT de placer la fiche : le basculement ci-dessous se
    // décide sur la position de défilement, qui n'est connue qu'une fois le défilement fait.
    //
    // Défilement INSTANTANÉ, et pas seulement sous `prefers-reduced-motion` : un défilement
    // animé rend la mise en page indéterminée au moment où on la mesure, et la fiche se
    // placerait d'après un état déjà périmé. L'instantané est de toute façon ce que la
    // réduction de mouvement demande (§10, Accessibilité) — il n'y a donc rien à arbitrer.
    // `scrollIntoView` est optionnel : happy-dom ne l'implémente pas.
    doc.querySelector(step.targets[0]!)?.scrollIntoView?.({ block: 'center' });

    const view = doc.defaultView;
    const gap = 14;
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + gap}px`;

    // Bascule au-dessus quand il n'y a pas la place dessous. Sans elle, la dernière section
    // de la page — que le navigateur ne PEUT pas centrer, faute de contenu après — poussait
    // sa fiche sous le bord de la fenêtre : visible pour le DOM, hors d'atteinte pour la
    // personne. Mesuré, pas supposé : `spikes/options-tour.mjs` vérifie que chaque étape
    // tient réellement dans la fenêtre.
    const bottomOfView = (view?.scrollY ?? 0) + (view?.innerHeight ?? 0);
    const height = popover.offsetHeight;
    if (height > 0 && rect.bottom + gap + height > bottomOfView) {
      popover.style.top = `${Math.max(0, rect.top - gap - height)}px`;
    }
  }

  function next(): void {
    if (stopped) return;
    if (index === steps.length - 1) return stop();
    index += 1;
    render();
  }

  function previous(): void {
    if (stopped || index === 0) return;
    index -= 1;
    render();
  }

  forward.addEventListener('click', next);
  back.addEventListener('click', previous);
  skip.addEventListener('click', stop);
  doc.addEventListener('keydown', onKey);

  render();
  forward.focus?.();

  return {
    length: steps.length,
    next,
    previous,
    stop,
    get index() {
      return index;
    },
  };
}

/** Le point d'entrée réel : ne joue que si la visite n'a jamais été vue. */
export async function maybeStartTour(
  doc: Document = document,
  lang = 'en'
): Promise<TourHandle | null> {
  if (await hasBeenSeen()) return null;
  return startTour(doc, lang);
}
