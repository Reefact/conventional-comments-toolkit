// Barre d'outils (§5.1) : un bouton par label actif, sélecteur de décoration segmenté
// construit depuis la configuration — un segment par décoration dont `forces` n'est pas
// null —, champ libre lorsque `decorations.allowFree` vaut true.

import { IDENTIFIER_RE, enabledLabels, resolveDecoration, type EffectiveConfig } from '@cct/core';
import { ui } from './strings.js';

/** Ce que le commentaire porte à cet instant, tel que `core/` le lit (§3.4.1). */
export interface PosedPrefix {
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

  /** Ce que la barre sait de la décoration, et surtout D'OÙ elle le sait.
   *
   * `pending` : choisie dans la barre, pas encore posée — elle attend un label.
   * `posed`   : lue dans le commentaire, donc un simple reflet du texte.
   *
   * La provenance est portée explicitement parce que son absence a produit deux défauts
   * opposés en deux rounds de revue (PR #35) : écraser un choix en attente avec le texte,
   * puis conserver un reflet devenu faux quand le label disparaît, et le RÉINSÉRER au clic
   * suivant. Une même variable ne peut pas être à la fois une intention et une observation ;
   * c'est la troisième fois sur cette barre qu'une valeur portait deux sens, après `[]` pour
   * les décorations et `null` pour le label. */
  type DecorationState = { origin: 'pending' | 'posed'; ids: string[] };
  let decoration: DecorationState = { origin: 'pending', ids: [] };

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
      // Sinon : la sélection de la barre ne vaut que si elle est EN ATTENTE et que le
      // commentaire ne porte aucun label. Un reflet du texte n'a rien à réinsérer.
      const chosen =
        pendingFree !== null
          ? [pendingFree]
          : posed.label === null && decoration.origin === 'pending'
            ? decoration.ids
            : [];
      opts.onLabel(label.id, chosen.length > 0 ? chosen : undefined, toggle);
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
  root.appendChild(group);

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
    // SANS label posé, le texte n'a rien à dire de la décoration : ce que la barre montre
    // est alors la sélection EN ATTENTE. L'écraser avec le `[]` du texte effaçait le choix
    // dès qu'une revalidation s'intercalait entre « je clique (blocking) » et « je clique
    // issue » — et le parcours ne marchait que si aucune n'arrivait, ce que mon test ne
    // faisait justement pas arriver (revue Codex, PR #35).
    if (posed.label === null) {
      // Le label a disparu : ce que la barre avait LU du commentaire ne décrit plus rien, et
      // le garder le faisait réapparaître au clic suivant. Un choix EN ATTENTE, lui, survit —
      // c'est une intention que personne n'a annulée (revue Codex, PR #35).
      if (decoration.origin === 'posed') decoration = { origin: 'pending', ids: [] };
      checkSegment(segmentButtons.get(decoration.ids[0] ?? null) ?? null);
      return;
    }
    decoration = { origin: 'posed', ids: posed.decorations };
    // La casse d'un id de décoration configuré est libre, comme celle d'un label : c'est
    // `core/` qui apparie, sans en tenir compte. Comparer les chaînes laissait un segment
    // `Blocking` éteint sur un commentaire qui le porte — le défaut corrigé pour les labels,
    // laissé ici (revue Codex, PR #35).
    const carriers = posed.decorations
      .map((d) => resolveDecoration(d, opts.config))
      .filter((d): d is NonNullable<typeof d> => d !== null && d.forces !== null);
    // §3.3, règle 2 : deux porteuses aux effets opposés sont un `E-CONFLICT`, et `core/`
    // les ignore TOUTES LES DEUX pour décider du caractère bloquant — « aucune règle de
    // la première gagne n'est définie, précisément parce qu'un tel commentaire traduit une
    // intention ambiguë ». En cocher une présentait un côté du conflit comme le choix
    // actif (revue Codex, PR #35).
    const conflicting = new Set(carriers.map((d) => d.forces)).size > 1;
    const carried = carriers.find((d) => segmentButtons.has(d.id))?.id;
    // La barre ne peut RIEN affirmer dans trois cas : parenthèses illégales, porteuses
    // contradictoires, décoration sans segment (une descriptive comme `(perf)`). Elle ne
    // coche alors rien — pas même « aucune », qui nierait la décoration présente.
    const target =
      posed.malformedDecorations || conflicting || (posed.decorations.length > 0 && carried === undefined)
        ? null
        : posed.decorations.length === 0
          ? segmentButtons.get(null) ?? null
          : segmentButtons.get(carried ?? null) ?? null;
    checkSegment(target ?? null);
  };
  sync();

  return { element: root, sync };
}
