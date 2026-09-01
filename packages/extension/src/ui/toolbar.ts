// Barre d'outils (§5.1) : un bouton par label actif, sélecteur de décoration segmenté
// construit depuis la configuration — un segment par décoration dont `forces` n'est pas
// null —, champ libre lorsque `decorations.allowFree` vaut true.

import { IDENTIFIER_RE, enabledLabels, type EffectiveConfig } from '@cct/core';
import { ui } from './strings.js';

/** Ce que le commentaire porte à cet instant, tel que `core/` le lit (§3.4.1). */
export interface PosedPrefix {
  /** L'id CANONIQUE du label (§8.2), alias résolu et casse de la configuration conservée —
   * jamais ce qui est littéralement écrit. */
  label: string | null;
  decorations: string[];
  /** Des parenthèses sont présentes mais leur contenu est illégal (§3.3, `issue (): x`).
   * Ce n'est ni « une décoration », ni « aucune » : la barre ne doit alors rien cocher. */
  malformedDecorations: boolean;
}

export interface ToolbarOptions {
  config: EffectiveConfig;
  lang: string;
  /** `undefined` = « je ne me prononce pas sur la décoration » (CA-02) ; `[]` = « aucune ». */
  onLabel: (label: string, decorations: string[] | undefined, toggle: boolean) => void;
  /** `label` est celui que le commentaire porte AU MOMENT DU GESTE, `null` s'il n'en porte
   * aucun — le contrôleur décide alors du label à poser. */
  onFreeDecoration: (decoration: string, label: string | null) => void;
  /** Le préfixe RÉELLEMENT écrit dans la zone de saisie, relu à chaque geste.
   *
   * La barre ne peut pas se contenter de mémoriser les clics : un commentaire déjà
   * labellisé — rouvert, tapé à la main, posé par la complétion — n'a laissé aucun clic
   * derrière lui. Le sélecteur de décoration était alors entièrement inerte, faute de
   * savoir sur quel label agir (retour utilisateur). Le texte est la seule source qui ne
   * dépende pas du chemin par lequel on y est arrivé. */
  currentPrefix: () => PosedPrefix;
}

export interface Toolbar {
  element: HTMLElement;
  /** Réaligne ce que la barre AFFICHE sur ce que le commentaire porte. Appelée à chaque
   * validation, donc après chaque frappe débattue comme après chaque insertion. */
  sync: () => void;
}

// Les exemples d'infobulle sont localisés dans strings.ts (§5.1 : « dans la langue de
// l'interface »).

export function buildToolbar(opts: ToolbarOptions): Toolbar {
  const doc = globalThis.document;
  const root = doc.createElement('div');
  root.className = 'cct-toolbar';
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', ui(opts.lang, 'toolbar.aria'));

  // Décoration choisie DANS LA BARRE, en attente d'un label : elle ne sert qu'au prochain
  // clic de label sur un commentaire qui n'en porte pas encore. Dès qu'un label est posé,
  // c'est le texte qui fait foi.
  //
  // C'est le SEUL état que la barre garde. Une première version retenait aussi le dernier
  // label cliqué et s'en servait pour décider ; trois gestes sur quatre s'appuyaient alors
  // sur une mémoire que la validation débattue (150 ms) ne rafraîchit qu'après coup, donc
  // en retard sur le texte dès qu'on tape vite (revue Codex, PR #35). Chaque geste relit.
  let selectedDecorations: string[] = [];

  // Un bouton par label, avec icône, libellé et couleur distincts (§5.1).
  for (const label of enabledLabels(opts.config)) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'cct-label-button';
    button.dataset['label'] = label.id;
    button.textContent = `${label.icon ?? ''} ${label.id}`.trim();
    if (label.color) button.style.setProperty('--cct-label-color', label.color);
    // Infobulle : définition + exemple, dans la langue de l'interface (§5.1).
    const description = ui(opts.lang, `label.${label.id}`);
    const example = ui(opts.lang, `example.${label.id}`);
    button.title =
      example !== `example.${label.id}`
        ? `${description}\n${ui(opts.lang, 'label.example', { example })}`
        : description;
    button.addEventListener('click', () => {
      // Le second clic RETIRE (§5.1). Ce qui décide est donc le label que le commentaire
      // porte à cet instant, lu dans le texte — pas celui qu'on se souvient d'avoir cliqué.
      const toggle = opts.currentPrefix().label === label.id;
      // Aucune décoration choisie dans la barre → `undefined` : poser un label ne doit pas
      // effacer la décoration déjà écrite (CA-02). Un choix explicite, lui, est transmis.
      opts.onLabel(label.id, selectedDecorations.length > 0 ? selectedDecorations : undefined, toggle);
      for (const b of root.querySelectorAll('.cct-label-button')) {
        b.setAttribute('aria-pressed', b === button && !toggle ? 'true' : 'false');
      }
    });
    button.setAttribute('aria-pressed', 'false');
    root.appendChild(button);
  }

  // Sélecteur de décoration segmenté : « aucune », puis un segment par décoration
  // porteuse de la configuration (§5.1).
  const group = doc.createElement('div');
  group.className = 'cct-decoration-group';
  group.setAttribute('role', 'radiogroup');
  const carriers = opts.config.decorations.known.filter((d) => d.forces !== null);
  const segments: { id: string | null; text: string }[] = [
    { id: null, text: ui(opts.lang, 'toolbar.decoration.none') },
    ...carriers.map((d) => ({ id: d.id, text: `(${d.id})` })),
  ];
  for (const segment of segments) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'cct-decoration-segment';
    b.textContent = segment.text;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', segment.id === null ? 'true' : 'false');
    b.addEventListener('click', () => {
      selectedDecorations = segment.id === null ? [] : [segment.id];
      checkSegment(b);
      // Le label sur lequel agir est celui que le COMMENTAIRE porte.
      const label = opts.currentPrefix().label;
      // `selectedDecorations` est passé tel quel, tableau vide compris : c'est ici, et
      // seulement ici, que « aucune » veut dire « retire-la ».
      if (label) opts.onLabel(label, selectedDecorations, false);
    });
    group.appendChild(b);
  }
  function checkSegment(target: Element | null): void {
    for (const s of group.querySelectorAll('[role="radio"]')) {
      s.setAttribute('aria-checked', s === target ? 'true' : 'false');
    }
  }
  root.appendChild(group);

  // Champ libre lorsque decorations.allowFree vaut true — sans lui, les décorations
  // libres autorisées resteraient inaccessibles à la souris (§5.1).
  if (opts.config.decorations.allowFree) {
    const free = doc.createElement('input');
    free.type = 'text';
    free.className = 'cct-free-decoration';
    free.placeholder = ui(opts.lang, 'toolbar.decoration.free');
    // Valider sur Entrée SEULEMENT perdait en silence ce qui venait d'être tapé dès qu'on
    // quittait le champ — au clavier par Tab, à la souris en cliquant ailleurs. Le geste le
    // plus naturel était celui qui effaçait le travail (retour utilisateur).
    const commitFree = (): void => {
      const raw = free.value.trim().toLowerCase();
      if (raw === '') return;
      // §3.3 : la forme d'une décoration est STRUCTURELLE et toujours appliquée —
      // indépendante de `allowFree`, qui gouverne l'appartenance à la liste connue. Sur
      // Entrée, poser « perf critique » était une faute délibérée ; sur une perte de focus,
      // ce serait un accident. Le champ garde donc ce qu'il ne peut pas poser, signalé, au
      // lieu de l'appliquer ou de le jeter.
      if (!IDENTIFIER_RE.test(raw)) {
        free.setAttribute('aria-invalid', 'true');
        return;
      }
      free.removeAttribute('aria-invalid');
      free.value = '';
      opts.onFreeDecoration(raw, opts.currentPrefix().label);
    };
    free.addEventListener('input', () => free.removeAttribute('aria-invalid'));
    free.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter') {
        e.preventDefault();
        commitFree();
      } else if (key === 'Tab') {
        // Pas de `preventDefault` : Tab pose la décoration ET continue de déplacer le
        // focus, comme partout ailleurs (§5.1, CA-12).
        commitFree();
      }
    });
    // `blur` couvre le reste : clic ailleurs, Maj+Tab, fermeture du composeur. Après une
    // validation par Tab le champ est déjà vide, donc ce second appel ne fait rien.
    free.addEventListener('blur', commitFree);
    root.appendChild(free);
  }

  /** Ce que la barre montre doit être ce que le commentaire porte. Sans cette
   * synchronisation, `issue (blocking): x` s'affichait avec « aucune » coché : le
   * radiogroup mentait, y compris à un lecteur d'écran (§5.1, CA-12). */
  const sync = (): void => {
    const posed = opts.currentPrefix();
    for (const b of root.querySelectorAll('.cct-label-button')) {
      const id = (b as HTMLElement).dataset['label'];
      b.setAttribute('aria-pressed', id !== undefined && id === posed.label ? 'true' : 'false');
    }
    // Le sélecteur ne porte QUE les décorations porteuses : une décoration purement
    // descriptive (`(perf)`) n'a pas de segment, et n'en fait donc cocher aucun — pas même
    // « aucune », qui affirmerait faussement qu'il n'y en a pas.
    selectedDecorations = posed.decorations;
    const carried = posed.decorations.find((d) => segments.some((s) => s.id === d));
    // Trois cas, et le troisième n'existait pas : des parenthèses illégales ne sont pas une
    // absence de décoration. Cocher « aucune » sur `issue (): x` affirmait le contraire de
    // ce que le validateur dit au même instant (revue Codex, PR #35).
    const target =
      posed.malformedDecorations || (posed.decorations.length > 0 && carried === undefined)
        ? null
        : posed.decorations.length === 0
          ? group.querySelector('[role="radio"]')
          : [...group.querySelectorAll('[role="radio"]')].find((s) => s.textContent === `(${carried})`) ?? null;
    checkSegment(target ?? null);
  };
  sync();

  return { element: root, sync };
}
