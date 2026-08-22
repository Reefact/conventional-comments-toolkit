// Socle commun des adaptateurs client (composant A) : contrat §9.2.3, stratégie
// d'écriture programmatique §9.3, chaînes de sélecteurs avec repli §9.4/§A.5.

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
 * décalée de la longueur du préfixe inséré). */
export function shiftSelection(
  element: HTMLTextAreaElement | HTMLInputElement,
  start: number,
  end: number,
  delta: number
): void {
  try {
    element.setSelectionRange(start + delta, end + delta);
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

/** Insertion/remplacement de préfixe (§5.1, CA-02) — pur, testable sans DOM.
 * Remplace la ligne de préfixe existante ou en insère une, sans détruire le texte saisi. */
export function computePrefixInsertion(
  currentValue: string,
  newPrefix: { label: string; decorations: string[] },
  options: { toggle?: boolean } = {}
): { nextValue: string; caret: number; delta: number; removed: boolean } {
  const decorations = newPrefix.decorations.length > 0 ? ` (${newPrefix.decorations.join(', ')})` : '';
  const prefixText = `${newPrefix.label}${decorations}: `;

  // La ligne de préfixe est la première ligne non vide hors bloc/citation — pour la
  // saisie, la première ligne portant déjà un préfixe reconnaissable suffit.
  const lines = currentValue.split('\n');
  let target = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== '') {
      target = i;
      break;
    }
  }

  const existing = target >= 0 ? /^([A-Za-z]+)(\s*\([^)]*\))?:\s*/.exec(lines[target]!) : null;
  if (existing && target >= 0) {
    const line = lines[target]!;
    const rest = line.slice(existing[0].length);
    const hadLabel = existing[1]!;
    const hadDecorations = (existing[2] ?? '').replace(/[()\s]/g, '');
    const sameLabel = hadLabel.toLowerCase() === newPrefix.label.toLowerCase();
    const sameDecorations = hadDecorations === newPrefix.decorations.join(',').replace(/\s/g, '');
    if (options.toggle && sameLabel && sameDecorations) {
      // Second clic sur un label déjà actif : retrait (§5.1).
      lines[target] = rest;
      const nextValue = lines.join('\n');
      return { nextValue, caret: lineStart(lines, target), delta: -existing[0].length, removed: true };
    }
    // Remplacement : décoration et sujet conservés (CA-02) — la décoration existante est
    // conservée si le nouveau préfixe n'en apporte pas.
    const keptDecorations =
      newPrefix.decorations.length === 0 && existing[2] ? existing[2].trim().replace(/^\s*/, ' ') : decorations;
    const replacement = `${newPrefix.label}${keptDecorations.startsWith(' ') ? keptDecorations : keptDecorations}: `;
    lines[target] = `${replacement}${rest}`;
    const nextValue = lines.join('\n');
    const caret = lineStart(lines, target) + replacement.length;
    return { nextValue, caret, delta: replacement.length - existing[0].length, removed: false };
  }

  // Aucun préfixe : insertion en tête, texte déjà saisi conservé.
  const nextValue = prefixText + currentValue;
  return { nextValue, caret: prefixText.length, delta: prefixText.length, removed: false };
}

function lineStart(lines: string[], index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += lines[i]!.length + 1;
  return pos;
}
