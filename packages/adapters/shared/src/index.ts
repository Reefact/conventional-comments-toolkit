// Socle commun des adaptateurs client (composant A) : contrat §9.2.3, stratégie
// d'écriture programmatique §9.3, chaînes de sélecteurs avec repli §9.4/§A.5.

import { EMOJI_TOKEN_SOURCE, matchPrefix, splitBody } from '@cct/core';
import type {
  ConfigRead,
  Disposable,
  PlatformProfile,
  PrRef,
  PublishedSummary,
  ThreadInfo,
  UserInfo,
  Zone,
} from '@cct/core';

// ————— Contrat client (§9.2.3) —————

export interface EditorContext {
  zone: Zone;
  action: 'compose' | 'edit';
  pr: PrRef;
  threadId?: string;
  commentId?: string;
  canCarryBlockingState: boolean;
  inScope: boolean;
}

export interface EditorHandle {
  id: string;
  element: Element;
  context: EditorContext;
}

export interface SubmitControl {
  element: Element;
  kind: 'submit' | 'submit-and-resolve' | 'complete-pr';
}

export interface PlatformAdapter {
  matches(url: URL): boolean;
  platformProfile(): PlatformProfile;
  getRepoConfig(pr: PrRef): Promise<ConfigRead>;
  getOrgConfig(url: string | null): Promise<ConfigRead>;
  observeEditors(cb: (editor: EditorHandle) => void): Disposable;
  getSubmitControls(editor: EditorHandle): SubmitControl[];
  readValue(editor: EditorHandle): string;
  writeValue(editor: EditorHandle, text: string, caret?: number): void;
  getThreads(): Promise<ThreadInfo[]>;
  getCompletionControl(): SubmitControl | null;
  getCurrentUser(): Promise<UserInfo>;
  readPublishedResult(): PublishedSummary | null;
}

// ————— Reconnaissance d'hôte (§2, §A.4, §B.4) —————
// Un hôte autorisé via `optional_host_permissions` peut être un JOKER : le §A.4 nomme
// `*.ghe.com` (GitHub Enterprise Cloud with data residency, sous-domaine dédié par client,
// inconnu à la compilation) et le §B.6 `*.visualstudio.com`. Chrome accorde bien
// `https://*.ghe.com/*` et injecte le script sur `acme.ghe.com` ; une comparaison par
// égalité stricte, elle, ne reconnaîtrait jamais cet hôte concret et laisserait
// l'extension inerte sur la page (revue Codex, PR #29). Les deux adaptateurs partagent
// donc cette fonction plutôt que de réinventer chacun sa règle.
//
// `*.exemple.com` couvre le domaine nu (`exemple.com`) ET ses sous-domaines
// (`acme.exemple.com`). C'est bien la sémantique des motifs WebExtension — la
// documentation donne `https://mozilla.org/` comme correspondant à `*://*.mozilla.org/*`.
// Une version antérieure de cette fonction excluait le domaine nu, en affirmant l'inverse,
// et un test verrouillait cette croyance (revue Codex, PR #29) : Chrome injectait donc le
// script sur le domaine nu couvert par l'octroi, et l'adaptateur refusait ensuite de le
// reconnaître.
//
// Le suffixe est comparé PRÉCÉDÉ DE SON POINT pour les sous-domaines : sans lui,
// `evilghe.com` passerait pour un sous-domaine de `ghe.com`.

/** L'hôte `host` est-il couvert par l'entrée `pattern` — nom exact, ou joker `*.suffixe` ? */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === pattern;
}

/** L'hôte est-il couvert par au moins une des entrées (noms exacts et jokers mêlés) ? */
export function hostMatchesAny(host: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => hostMatchesPattern(host, p));
}

// ————— Stratégie d'écriture programmatique (§9.3) —————
// Les éditeurs pilotés par un état applicatif absorbent l'affectation directe de `value` :
// le champ paraît modifié, mais le contenu soumis ne l'est pas (§A.2, §B.2). La méthode
// commune : passer par le setter NATIF de la propriété — celui du prototype, que le
// framework n'a pas remplacé — puis émettre un événement `input` qui remonte. Jamais
// `element.value = …`. Validée par le spike P1' (spikes/p1-prime).

export function writeToTextField(
  element: HTMLTextAreaElement | HTMLInputElement,
  text: string,
  caret?: number
): void {
  const proto =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(element, text);
  } else {
    // Environnement sans descripteur (tests minimalistes) : affectation directe en repli.
    (element as HTMLTextAreaElement).value = text;
  }
  if (caret !== undefined) {
    try {
      element.setSelectionRange(caret, caret);
    } catch {
      // Certains types d'input ne portent pas de sélection : sans conséquence.
    }
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Restaure une sélection décalée de `delta` (§5.1 — la sélection active est restaurée,
 * décalée de la longueur du préfixe inséré). Seules les positions situées à partir de
 * `changedAt` se décalent : le préfixe peut s'insérer sur une ligne située APRÈS la
 * sélection (brouillon commençant par une citation, §3.4.1), et décaler une position
 * antérieure ferait dériver la sélection restaurée (CA-02). */
export function shiftSelection(
  element: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
  delta: number,
  changedAt = 0
): void {
  try {
    element.setSelectionRange(start < changedAt ? start : start + delta, end < changedAt ? end : end + delta);
  } catch {
    // idem
  }
}

// ————— Sélecteurs en chaînes avec repli (§9.4, §A.5) —————
// Chaque adaptateur centralise ses sélecteurs dans un fichier unique, organisé en
// chaînes : la génération la plus récente d'abord, puis les précédentes.

export interface SelectorChain {
  /** Nom stable, pour la journalisation de dégradation (§9.4). */
  name: string;
  candidates: string[];
}

export interface SelectorOutcome {
  element: Element | null;
  /** Sélecteur qui a réussi, ou null : la dégradation de sélecteur s'applique (§9.4). */
  matched: string | null;
}

export function queryChain(root: ParentNode, chain: SelectorChain): SelectorOutcome {
  for (const candidate of chain.candidates) {
    const element = root.querySelector(candidate);
    if (element) return { element, matched: candidate };
  }
  return { element: null, matched: null };
}

export function queryChainAll(root: ParentNode, chain: SelectorChain): Element[] {
  for (const candidate of chain.candidates) {
    const elements = [...root.querySelectorAll(candidate)];
    if (elements.length > 0) return elements;
  }
  return [];
}

/** Texte d'un corps de commentaire, badge de label de l'extension EXCLU (§5.5) :
 * `decorateComment` (extension/src/ui/badges.ts) insère `.cct-badge` comme premier enfant
 * de ce même élément — celui que `getThreads()`/`getRenderedComments()` lisent ensuite.
 * Un rendu répété sur la même PR (résumé publié changé après coup, §5.5) relirait sinon le
 * texte du badge mêlé au corps réel, cassant la reconnaissance du préfixe par `analyze()`
 * au tour suivant. `:scope >` : seul un badge posé en enfant DIRECT — jamais un badge
 * hérité d'une citation ou d'un bloc de code imbriqué. */
export function commentBodyText(element: Element): string {
  if (!element.querySelector(':scope > .cct-badge')) return element.textContent ?? '';
  const clone = element.cloneNode(true) as Element;
  clone.querySelector(':scope > .cct-badge')?.remove();
  return clone.textContent ?? '';
}

/** closest() sur une chaîne : les candidats s'essaient DANS L'ORDRE, comme queryChain —
 * les joindre en un seul sélecteur laisserait un candidat de repli large l'emporter sur
 * le candidat précis d'une génération plus récente (§9.4). */
export function closestChain(el: Element, chain: SelectorChain): SelectorOutcome {
  for (const candidate of chain.candidates) {
    const element = el.closest(candidate);
    if (element) return { element, matched: candidate };
  }
  return { element: null, matched: null };
}

/** Journal local de dégradation de sélecteurs (§9.4, CA-11) : jamais de dialogue, jamais
 * d'exception remontée — l'échec est tracé, la zone se désactive localement. */
export class SelectorLog {
  readonly failures: { chain: string; at: string }[] = [];
  #telemetry: ((event: { kind: 'selector-degradation'; chain: string }) => void) | null;

  constructor(telemetry: ((event: { kind: 'selector-degradation'; chain: string }) => void) | null = null) {
    this.#telemetry = telemetry;
  }

  degraded(chain: SelectorChain): void {
    this.failures.push({ chain: chain.name, at: new Date().toISOString() });
    // Remontée télémétrique agrégée uniquement si la télémétrie est activée (§10, CA-11).
    this.#telemetry?.({ kind: 'selector-degradation', chain: chain.name });
  }
}

// Localisation du préfixe dans la ligne BRUTE, pour la réécrire sans perdre sa tête.
// La DÉCISION « cette ligne porte-t-elle un préfixe » revient à matchPrefix() sur la
// ligne normalisée (§3.4.1 étapes 4-6, §3.4.2) — ce motif ne fait que retrouver, dans la
// ligne d'origine, les bornes de ce que la regex de référence a reconnu : tête tolérée
// (blancs, U+FEFF, emoji), label, décorations, deux-points et blancs suivants.
const RAW_PREFIX_LOCATOR = new RegExp(
  `^(?<head>[\\p{White_Space}\\uFEFF]*(?:${EMOJI_TOKEN_SOURCE}[\\p{White_Space}\\uFEFF]*)?)` +
    '(?<label>[A-Za-z]+)' +
    '(?:[\\p{White_Space}\\uFEFF]*\\([^)\\r\\n]*\\))?' +
    ':[\\p{White_Space}\\uFEFF]*',
  'u'
);

/** Insertion/remplacement de préfixe (§5.1, CA-02) — pur, testable sans DOM.
 * La ligne visée est la LIGNE DE PRÉFIXE du §3.4.1 (blocs délimités et citations
 * écartés) : citer du code en tête puis cliquer un label ne doit jamais réécrire la
 * citation. Le préfixe existant est reconnu comme la validation le reconnaît — ligne
 * normalisée par les étapes 4-6, regex de référence — et la tête tolérée de la ligne
 * (indentation, BOM, emoji) est conservée à la réécriture comme au retrait.
 * `changedAt` : position, dans la valeur d'ENTRÉE, où la modification commence — les
 * positions antérieures (une citation au-dessus) ne se décalent pas. */
export function computePrefixInsertion(
  currentValue: string,
  newPrefix: { label: string; decorations?: string[] },
  options: {
    toggle?: boolean;
    /** L'appelant a établi — configuration en main, alias compris — que le préfixe écrit
     * porte bien le label demandé. À défaut, les deux chaînes sont comparées. */
    sameLabel?: boolean;
  } = {}
): { nextValue: string; caret: number; delta: number; removed: boolean; changedAt: number } {
  // `decorations` distingue TROIS intentions, et un tableau seul ne pouvait en exprimer que
  // deux — d'où un défaut que l'usage réel a fini par trouver (retour utilisateur) :
  //
  //   • `undefined` — « je ne me prononce pas » : on pose un label, la décoration déjà
  //     écrite est CONSERVÉE. C'est CA-02 (`issue (blocking): x` + `todo` →
  //     `todo (blocking): x`), et c'est le cas des boutons de label et des raccourcis ;
  //   • `[]` — « aucune », le premier segment du sélecteur (§5.1) : la décoration est
  //     RETIRÉE ;
  //   • une liste non vide — elle remplace.
  //
  // Le tableau vide portait auparavant les deux premiers sens à la fois, et « conserver »
  // l'emportait : le segment « aucune » était donc un bouton sans effet, coché, sur un
  // commentaire décoré. Le §5.1 décrit pourtant bien « aucune » comme un choix.
  const given = newPrefix.decorations;
  const decorations = given !== undefined && given.length > 0 ? ` (${given.join(', ')})` : '';
  const prefixText = `${newPrefix.label}${decorations}: `;

  const lines = currentValue.split('\n');
  const split = splitBody(currentValue);
  const target = split.prefixLineIndex ?? -1;

  const recognized = split.prefixLine !== null ? matchPrefix(split.prefixLine) : null;
  const located = recognized && target >= 0 ? RAW_PREFIX_LOCATOR.exec(lines[target]!) : null;
  if (recognized && located && target >= 0) {
    const head = located.groups!['head']!;
    const rest = lines[target]!.slice(located[0].length);
    const start = lineStart(lines, target);
    const changedAt = start + head.length;
    // « Est-ce le MÊME label ? » est une question de CONFIGURATION, pas de chaînes : `bug:`
    // est le même label qu'`issue` si la configuration le déclare en alias, et il « en
    // hérite intégralement » (§3.2). Ce paquet ne voit aucune configuration — il ne peut
    // donc pas trancher, et une comparaison littérale répondait `false` sur un alias : le
    // second clic réécrivait `bug:` en `issue:` au lieu de retirer le préfixe (revue Codex,
    // PR #35, étendu aux alias sur demande).
    //
    // La décision revient donc à l'appelant, qui la prend avec `resolveLabel()` de `core/`,
    // et `toggle` veut dire ce qu'il dit : « retire ce préfixe ». Le repli littéral ne sert
    // qu'aux appelants sans configuration sous la main.
    const sameLabel =
      options.sameLabel ?? recognized.label.toLowerCase() === newPrefix.label.toLowerCase();
    if (options.toggle && sameLabel) {
      // Second clic sur un label déjà actif : retrait (§5.1) — le label seul décide,
      // pas l'état du sélecteur de décoration.
      lines[target] = head + rest;
      const nextValue = lines.join('\n');
      return { nextValue, caret: changedAt, delta: -(located[0].length - head.length), removed: true, changedAt };
    }
    // Remplacement : sujet conservé, et décoration conservée SI l'appelant ne s'est pas
    // prononcé (CA-02). Un `[]` explicite, lui, la retire.
    const keptDecorations =
      given === undefined && recognized.decorations !== null
        ? ` (${recognized.decorations})`
        : decorations;
    const replacement = `${newPrefix.label}${keptDecorations}: `;
    lines[target] = `${head}${replacement}${rest}`;
    const nextValue = lines.join('\n');
    const caret = changedAt + replacement.length;
    return {
      nextValue,
      caret,
      delta: head.length + replacement.length - located[0].length,
      removed: false,
      changedAt,
    };
  }

  if (target >= 0) {
    // Une ligne de préfixe existe mais ne porte pas de préfixe : le préfixe s'insère en
    // tête de CETTE ligne — jamais sur une citation ou un bloc situé au-dessus.
    lines[target] = prefixText + lines[target]!;
    const nextValue = lines.join('\n');
    const changedAt = lineStart(lines, target);
    return { nextValue, caret: changedAt + prefixText.length, delta: prefixText.length, removed: false, changedAt };
  }

  // Aucune ligne de préfixe (corps vide, tout cité ou tout en bloc) : nouvelle première
  // ligne, contenu existant conservé en dessous — le contenu existant se décale donc du
  // préfixe ET du saut de ligne ajouté.
  const nextValue = currentValue === '' ? prefixText : `${prefixText}\n${currentValue}`;
  const delta = currentValue === '' ? prefixText.length : prefixText.length + 1;
  return { nextValue, caret: prefixText.length, delta, removed: false, changedAt: 0 };
}

function lineStart(lines: string[], index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += lines[i]!.length + 1;
  return pos;
}
