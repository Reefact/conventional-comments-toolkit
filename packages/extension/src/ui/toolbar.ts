// Barre d'outils (§5.1) : un bouton par label actif, sélecteur de décoration segmenté
// construit depuis la configuration — un segment par décoration dont `forces` n'est pas
// null —, champ libre lorsque `decorations.allowFree` vaut true.

import { IDENTIFIER_RE, enabledLabels, resolveDecoration, type EffectiveConfig } from '@cct/core';
import { ui } from './strings.js';

/** Ce que le commentaire porte à cet instant, tel que `core/` le lit (§3.4.1). */
export interface PosedPrefix {
  /** Une ligne de préfixe est RECONNUE par la regex de référence (§3.4.2) — même si son
   * label n'appartient pas à la configuration. `riskk (blocking): x` a un préfixe et pas de
   * label ; un commentaire nu n'a ni l'un ni l'autre. La barre doit les traiter
   * différemment : sur le premier elle ne peut rien affirmer, sur le second elle affiche ce
   * qui est en attente. */
  hasPrefix: boolean;
  /** L'id CANONIQUE du label (§8.2), alias résolu et casse de la configuration conservée —
   * jamais ce qui est littéralement écrit. */
  label: string | null;
  /** L'orthographe RÉELLEMENT écrite — un alias, ou une casse différente de l'id configuré.
   *
   * Un alias est « une orthographe admise, pas un écart » (§3.2) : la réécriture vers la
   * forme canonique « se propose, sans l'imposer ». Poser une décoration sur `bug: x` ne
   * doit donc pas le transformer en `issue (blocking): x` au passage — c'est une correction
   * que personne n'a demandée, glissée dans un autre geste (revue Codex, PR #35). */
  writtenLabel: string | null;
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

/** Ce que la barre sait de la décoration, et surtout D'OÙ elle le sait.
 *
 * `pending` : choisie dans la barre, pas encore posée — elle attend un label.
 * `posed`   : lue dans le commentaire, donc un simple reflet du texte.
 *
 * La provenance est portée explicitement parce que son absence a produit deux défauts
 * opposés (PR #35) : écraser un choix en attente avec le texte, puis conserver un reflet
 * devenu faux quand le label disparaît. */
export interface DecorationState {
  origin: 'pending' | 'posed';
  ids: string[];
}

/** Ce que le radiogroup doit montrer. Trois cas NOMMÉS, parce que deux d'entre eux se
 * ressemblent assez pour qu'un `null` les confonde — ce qui est exactement l'erreur que
 * cette barre a produite six fois. */
export type SegmentToCheck =
  | { kind: 'none' } // le segment « aucune » : le commentaire ne porte AUCUNE décoration
  | { kind: 'segment'; id: string } // la décoration écrite, qui a un segment
  | { kind: 'nothing' }; // la barre ne peut RIEN affirmer : elle ne coche pas

/** L'état du sélecteur, calculé en UN SEUL endroit à partir de ce que le commentaire porte
 * et de ce que la barre savait.
 *
 * Cette fonction existe pour une raison précise. `sync()` avait trois branches, et chacune
 * était responsable de mettre à jour la provenance : deux le faisaient, la troisième — la
 * plus récente — sortait par un `return` sans y toucher, et le défaut que les deux autres
 * corrigeaient revenait par elle (revue Codex, PR #35, sept rounds). L'invariant tenait par
 * convention, donc jusqu'à la prochaine branche ajoutée.
 *
 * Ici il tient par CONSTRUCTION : il n'y a qu'un endroit où l'état s'écrit, et tout cas
 * d'affichage nouveau devra en sortir. `sync()` n'a plus qu'à peindre.
 *
 * `hasSegment` dit quels segments la barre porte — elle n'en a que pour les décorations
 * PORTEUSES de la configuration (§5.1). */
export function selectorFor(
  posed: PosedPrefix,
  previous: DecorationState,
  config: EffectiveConfig,
  hasSegment: (id: string) => boolean
): { state: DecorationState; checked: SegmentToCheck } {
  // 1. Aucun préfixe écrit : le texte n'a rien à dire de la décoration. Un reflet ne décrit
  //    donc plus rien et se jette ; une intention en attente survit, personne ne l'a annulée.
  if (!posed.hasPrefix) {
    const state: DecorationState = previous.origin === 'posed' ? { origin: 'pending', ids: [] } : previous;
    const id = state.ids[0];
    if (id === undefined) return { state, checked: { kind: 'none' } };
    return { state, checked: hasSegment(id) ? { kind: 'segment', id } : { kind: 'nothing' } };
  }

  // À partir d'ici un préfixe est écrit : ce qu'il porte fait foi, et c'est un REFLET —
  // l'effacer devra donc l'emporter avec lui, y compris quand son label est inconnu.
  const state: DecorationState = { origin: 'posed', ids: posed.decorations };

  // 2. Préfixe écrit dont le label n'est pas de la configuration : la barre ne peut rien en
  //    dire, mais elle a bien LU sa décoration.
  if (posed.label === null) return { state, checked: { kind: 'nothing' } };

  // 3. Préfixe reconnu. La casse d'un id configuré est libre : c'est `core/` qui apparie.
  const carriers = posed.decorations
    .map((d) => resolveDecoration(d, config))
    .filter((d): d is NonNullable<typeof d> => d !== null && d.forces !== null);
  // §3.3, règle 2 : deux porteuses aux effets opposés sont un `E-CONFLICT`, et `core/` les
  // ignore TOUTES LES DEUX — « aucune règle de la première gagne n'est définie, précisément
  // parce qu'un tel commentaire traduit une intention ambiguë ». En cocher une présenterait
  // un côté du conflit comme le choix actif.
  if (new Set(carriers.map((d) => d.forces)).size > 1) return { state, checked: { kind: 'nothing' } };
  // Des parenthèses illégales ne sont pas une absence de décoration : le validateur signale
  // `E-DECORATION-SYNTAX` au même instant.
  if (posed.malformedDecorations) return { state, checked: { kind: 'nothing' } };
  if (posed.decorations.length === 0) return { state, checked: { kind: 'none' } };
  const carried = carriers.find((d) => hasSegment(d.id))?.id;
  // Une décoration purement descriptive (`(perf)`) n'a pas de segment : ne rien cocher,
  // surtout pas « aucune », qui nierait la décoration écrite.
  return { state, checked: carried === undefined ? { kind: 'nothing' } : { kind: 'segment', id: carried } };
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

  // Le SEUL état de la barre. Il ne s'écrit qu'en un endroit : `selectorFor()`.
  let decoration: DecorationState = { origin: 'pending', ids: [] };

  /** DEUX rangées, et jamais une seule : les labels au-dessus, les commandes de décoration
   * en dessous. La barre était un unique conteneur `flex-wrap`, donc une seule suite de
   * commandes que la largeur disponible coupait où elle voulait — un label pouvait se
   * retrouver à côté du sélecteur de décoration, deux gestes de natures différentes rendus
   * comme s'ils appartenaient à la même famille (retour utilisateur).
   *
   * La séparation est STRUCTURELLE, pas seulement affaire de largeur : retirer les icônes
   * des boutons (ci-dessous) recule le seuil de casse sans le supprimer, et une fenêtre
   * étroite ou une configuration à treize labels le rencontre toujours. Chaque rangée garde
   * son propre `flex-wrap` : ce qui déborde d'une rangée passe à la ligne DANS cette rangée,
   * jamais dans l'autre.
   *
   * `role="none"` : ces deux boîtes n'existent que pour la mise en page. Sans lui, la
   * restructuration insérerait deux conteneurs génériques entre le `role="toolbar"` et ses
   * commandes ; avec lui, l'arbre d'accessibilité est exactement celui d'avant — un toolbar
   * dont les enfants sont les boutons, le radiogroup et le champ libre. Un rôle
   * présentationnel n'efface que la sémantique de l'élément qui le porte, jamais celle de ses
   * enfants : un `div` n'a aucun enfant requis, donc rien à leur transmettre. */
  const newRow = (): HTMLElement => {
    const row = doc.createElement('div');
    row.className = 'cct-toolbar-row';
    row.setAttribute('role', 'none');
    root.appendChild(row);
    return row;
  };
  const labelRow = newRow();
  const decorationRow = newRow();

  // Un bouton par label, avec libellé et couleur distincts (§5.1) — mais SANS son icône,
  // délibérément, là où le badge d'un commentaire publié la garde (badges.ts, `labelBadge()`).
  //
  // Les deux surfaces n'ont pas la même contrainte de place. Un badge est SEUL en tête de son
  // commentaire : l'icône y est un repère qui ne coûte rien, et c'est ce que montre le mockup
  // de référence (docs/badges-decoration-mockup.html). Les boutons, eux, sont une RANGÉE — dix
  // dans la configuration par défaut, treize si les labels optionnels sont activés (§3.2) —
  // posée au-dessus du sélecteur de décoration, et ce qu'un bouton prend en largeur, il le
  // prend à tous les autres. Sur la largeur d'une boîte de commentaire GitHub, ces icônes
  // suffisaient à renvoyer le dernier label à la ligne suivante, où il se mêlait alors aux
  // segments de décoration : deux commandes de natures différentes sur une même rangée, pour un
  // repère dont le texte du bouton dit déjà tout (retour utilisateur, capture à l'appui).
  // Mesuré dans Chromium sur cette barre-ci, hors github.com (pile de polices système, donc
  // l'ordre de grandeur et non le pixel) : les dix boutons par défaut passent de 762 à 579 px
  // cumulés, et la largeur en dessous de laquelle la rangée se casse tombe de ~816 à ~633 px.
  //
  // L'accessibilité ne perd rien : l'information est portée par le TEXTE, jamais par la couleur
  // seule (§10), et l'infobulle ci-dessous porte définition et exemple. Le §5.1 écrit encore
  // « avec icône » : c'est un écart assumé avec la spécification normative, à y reporter par
  // une PR qui ne touche QU'ELLE (garde `conformance.yml`).
  for (const label of enabledLabels(opts.config)) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'cct-label-button';
    button.dataset['label'] = label.id;
    button.textContent = label.id;
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
      const posed = opts.currentPrefix();
      // Une décoration en attente dans le champ libre appartient à CE geste : la personne
      // l'a tapée puis a cliqué un label. Sans cela, le `blur` la posait avec le label de
      // repli et le clic retirait aussitôt le préfixe ainsi créé — la séquence la plus
      // naturelle du champ libre laissait le commentaire sans label (revue Codex, PR #35).
      const pendingFree = takePendingFreeDecoration();
      // Elle est lue AVANT de décider de la bascule, et l'empêche : « décore » et « retire »
      // sont deux intentions contraires, et l'ordre inverse faisait qu'écrire une décoration
      // puis cliquer le label déjà actif retirait le préfixe ET jetait la décoration — un
      // geste qui ajoute en enlevait deux (revue Codex, PR #35).
      const toggle = pendingFree === null && posed.label === label.id;
      // Sinon : la sélection de la barre ne vaut que si elle est EN ATTENTE et qu'AUCUN
      // préfixe n'est écrit. Un reflet du texte n'a rien à réinsérer, et un préfixe écrit
      // dit lui-même sa décoration — même quand son label est inconnu de la configuration.
      //
      // `hasPrefix` et non `label === null` : introduit au commit précédent pour distinguer
      // ces deux cas exactement, il n'avait été posé que dans `sync()`, si bien qu'un choix
      // en attente écrasait la décoration de `riskk (non-blocking): x` (revue Codex, PR #35).
      // Sixième fois sur cette barre qu'une règle n'atteint qu'un de ses points
      // d'application ; les trois lectures de `posed.label` du fichier ont donc été
      // relues ensemble cette fois, plutôt qu'une seule corrigée.
      const chosen =
        pendingFree !== null
          ? [pendingFree]
          : !posed.hasPrefix && decoration.origin === 'pending'
            ? decoration.ids
            : [];
      opts.onLabel(label.id, chosen.length > 0 ? chosen : undefined, toggle);
      for (const b of root.querySelectorAll('.cct-label-button')) {
        b.setAttribute('aria-pressed', b === button && !toggle ? 'true' : 'false');
      }
    });
    button.setAttribute('aria-pressed', 'false');
    labelRow.appendChild(button);
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
  /** Le bouton de chaque segment, pour ne plus l'apparier par son texte affiché. */
  const segmentButtons = new Map<string | null, HTMLElement>();
  for (const segment of segments) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'cct-decoration-segment';
    b.textContent = segment.text;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', segment.id === null ? 'true' : 'false');
    b.addEventListener('click', () => {
      decoration = { origin: 'pending', ids: segment.id === null ? [] : [segment.id] };
      checkSegment(b);
      // Le label sur lequel agir est celui que le COMMENTAIRE porte, et il est réinséré
      // TEL QU'IL EST ÉCRIT : ce geste-ci porte sur la décoration, pas sur l'orthographe.
      const label = opts.currentPrefix().writtenLabel;
      // La sélection est passée telle quelle, tableau vide compris : c'est ici, et
      // seulement ici, que « aucune » veut dire « retire-la ».
      if (label) opts.onLabel(label, decoration.ids, false);
    });
    segmentButtons.set(segment.id, b);
    group.appendChild(b);
  }
  function checkSegment(target: Element | null): void {
    for (const s of group.querySelectorAll('[role="radio"]')) {
      s.setAttribute('aria-checked', s === target ? 'true' : 'false');
    }
  }
  decorationRow.appendChild(group);

  /** La décoration valide en attente dans le champ libre, RETIRÉE du champ. Rendue à
   * l'appelant qui la pose lui-même — un clic de label, notamment. */
  let takePendingFreeDecoration: () => string | null = () => null;

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
    /** La saisie, si elle est posable. Elle SIGNALE une forme illégale plutôt que de la
     * jeter en silence : §3.3 est structurel, indépendant de `allowFree`. */
    const readFree = (): string | null => {
      const raw = free.value.trim().toLowerCase();
      if (raw === '') return null;
      if (!IDENTIFIER_RE.test(raw)) {
        free.setAttribute('aria-invalid', 'true');
        return null;
      }
      free.removeAttribute('aria-invalid');
      return raw;
    };
    takePendingFreeDecoration = (): string | null => {
      const raw = readFree();
      if (raw !== null) free.value = '';
      return raw;
    };
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
      // L'orthographe écrite, ici aussi : décorer ne réécrit pas le label (§3.2).
      opts.onFreeDecoration(raw, opts.currentPrefix().writtenLabel);
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
    //
    // SAUF vers un bouton de label : `blur` précède `click`, et valider ici poserait le
    // label de repli que le clic, voyant ce label désormais posé, retirerait aussitôt. Ce
    // clic-là consomme la décoration en attente lui-même — deux correctifs qui, combinés,
    // laissaient le commentaire sans label (revue Codex, PR #35).
    free.addEventListener('blur', (e) => {
      const next = (e as FocusEvent).relatedTarget;
      if (next instanceof HTMLElement && next.classList.contains('cct-label-button')) return;
      commitFree();
    });
    decorationRow.appendChild(free);
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
    const view = selectorFor(posed, decoration, opts.config, (id) => segmentButtons.has(id));
    decoration = view.state;
    checkSegment(
      view.checked.kind === 'nothing'
        ? null
        : view.checked.kind === 'none'
          ? segmentButtons.get(null) ?? null
          : segmentButtons.get(view.checked.id) ?? null
    );
  };
  sync();

  return { element: root, sync };
}
