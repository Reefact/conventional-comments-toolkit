// Ce qu'une ligne du journal (§9.4) montre de la page au moment où une chaîne n'a rien trouvé.
//
// Le journal disait « cette chaîne n'a trouvé aucun candidat », et rien de ce qu'il y avait à
// la place. Deux entrées reçues le 2026-10-30 l'ont montré : `editors` ne se comprenait qu'en
// rouvrant une capture de page, `merge-button` pas du tout, faute de capture. Ce module relève
// donc, au moment de l'échec, ce qu'il faut pour diagnostiquer sans la page :
//
//   - la TRACE de chaque candidat, sélecteur composé par sélecteur composé : `[1, 0, 0]` dit
//     que l'ancêtre existe et que la suite manque, `[0, …]` que l'ancêtre lui-même manque ;
//   - l'EMPREINTE des éléments voisins : sous l'ancêtre le plus profond qu'un candidat ait
//     atteint, les contrôles qu'on y trouve à la place.
//
// Des FAITS, jamais une interprétation (CLAUDE.md, « Un signal se rapporte ») : le relevé dit
// ce qui a été trouvé ou non, il ne nomme aucune cause.
//
// CONFIDENTIALITÉ. Une empreinte ne lit QUE des attributs d'interface tirés d'une liste
// fermée (`PRINTED_ATTRIBUTES`) — AUCUN texte, pas même celui des boutons. Jamais `value`, jamais
// le texte d'un champ ni d'un commentaire : sur une page capturée, le champ titre du dialogue
// « Reference in new issue » porte en `value` le texte du commentaire d'origine. Les suites de
// chiffres et les empreintes hexadécimales des identifiants sont masquées. Ce relevé ne va
// qu'au journal LOCAL, jamais à la télémétrie (§10) : `SelectorLog` le remet à son seul rappel
// local.

/** Un élément de la page, réduit à ce qui le désigne dans l'interface. */
export interface ElementPrint {
  tag: string;
  /** Attributs de la liste fermée `PRINTED_ATTRIBUTES` présents sur l'élément, masqués. */
  attrs?: Record<string, string>;
  /** Les ancêtres qui portent une marque, du plus proche au plus lointain, en notation de
   * sélecteur — `details-dialog[aria-label="Reference in new issue"]`. */
  ancestors?: string[];
}

/** Jusqu'où chaque sélecteur composé d'un candidat trouve quelque chose. */
export interface CandidateTrace {
  candidate: string;
  /** Nombre d'éléments trouvés par chaque préfixe du candidat, un par sélecteur composé ; `-1`
   * pour un préfixe que le navigateur refuse. Le dernier est le candidat entier. */
  steps: number[];
}

export interface SelectorEvidence {
  /** L'élément dans (ou à partir duquel) la chaîne a cherché, quand ce n'est pas le document. */
  subject?: ElementPrint;
  trace?: CandidateTrace[];
  /** L'ancêtre le plus profond qu'un candidat ait atteint, avant d'échouer. */
  anchor?: ElementPrint;
  /** Les contrôles sous `anchor` : ce qu'il y avait à la place de ce qu'on cherchait. */
  nearby?: ElementPrint[];
  /** Les éléments que la chaîne aurait dû reconnaître et n'a pas reconnus — pour une sonde qui
   * compare ce que la page porte à ce que la chaîne trouve. */
  unmatched?: ElementPrint[];
  /** Faits lus sur la page par l'adaptateur, à son vocabulaire : état de la PR, version du
   * site servi. Des valeurs lues, jamais des conclusions. */
  facts?: Record<string, string>;
  /** Millisecondes écoulées depuis le début de la visite (`SelectorLog.newVisit`). Posé par
   * `SelectorLog`, jamais par l'adaptateur. */
  msSinceVisit?: number;
}

export const PRINTED_ATTRIBUTES = [
  'id',
  'name',
  'type',
  'role',
  'aria-label',
  'placeholder',
  'data-testid',
  'data-component',
  'data-variant',
  'data-status',
  'disabled',
  'aria-disabled',
  'hidden',
  'class',
] as const;

/** Les marques qui font retenir un ancêtre : sans elles, un `div` de mise en page ne désigne
 * rien et allongerait la ligne pour rien. */
const ANCESTOR_MARKS = ['id', 'data-testid', 'data-component', 'role', 'aria-label', 'name'] as const;

const NEARBY = 'button, textarea, input:not([type="hidden"]), select, [contenteditable="true"], [role="button"]';
const MAX_NEARBY = 8;
const MAX_ANCESTORS = 4;
const MAX_VALUE = 80;
const MAX_CLASSES = 6;

/** Masque ce qui identifie une instance plutôt qu'un rôle : `issuecomment-6442405642-body` →
 * `issuecomment-#-body`. */
function mask(value: string): string {
  return value
    .replace(/[0-9a-f]{12,}/gi, '#')
    .replace(/\d{3,}/g, '#')
    .slice(0, MAX_VALUE);
}

function printedValue(el: Element, attribute: string): string | null {
  const raw = el.getAttribute(attribute);
  if (raw === null) return null;
  if (attribute === 'class') {
    return mask(raw.split(/\s+/).filter(Boolean).slice(0, MAX_CLASSES).join(' '));
  }
  return mask(raw.trim().replace(/\s+/g, ' '));
}

/** L'action d'un formulaire, réduite à son chemin : la requête peut porter n'importe quoi. */
function formAction(el: Element): string | null {
  const raw = el.getAttribute('action');
  if (raw === null) return null;
  try {
    return mask(new URL(raw, 'https://host.invalid').pathname);
  } catch {
    return null;
  }
}

// AUCUN TEXTE, pas même le libellé d'un bouton (revue Reefact, PR #110, deux fois). Une
// première version lisait le texte de tout `role="button"`, qu'un conteneur de commentaire
// peut porter ; la suivante ne le lisait que d'un `<button>` aux descendants de mise en forme —
// mais un `<span class="comment-body">` en est un. Un code commun à toutes les plateformes ne
// peut pas savoir si un texte est un libellé d'interface ou une saisie : la seule promesse
// tenable est de n'en lire aucun. Ce que dit un bouton reste lisible par ses attributs
// d'interface — `aria-label`, `data-variant`, `data-testid`, `disabled`.

function ancestorNotation(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  const marks: string[] = [];
  for (const attribute of ANCESTOR_MARKS) {
    const value = printedValue(el, attribute);
    if (value) marks.push(`[${attribute}="${value}"]`);
  }
  const action = tag === 'form' ? formAction(el) : null;
  if (action) marks.push(`[action="${action}"]`);
  // Un élément personnalisé (`details-dialog`) ou de structure se nomme par sa balise même.
  const named = tag.includes('-') || tag === 'form' || tag === 'dialog' || tag === 'details';
  return marks.length > 0 || named ? tag + marks.join('') : null;
}

export function printElement(el: Element): ElementPrint {
  const print: ElementPrint = { tag: el.tagName.toLowerCase() };
  const attrs: Record<string, string> = {};
  for (const attribute of PRINTED_ATTRIBUTES) {
    const value = printedValue(el, attribute);
    if (value !== null) attrs[attribute] = value;
  }
  if (Object.keys(attrs).length > 0) print.attrs = attrs;
  const ancestors: string[] = [];
  for (let up = el.parentElement; up && up.tagName !== 'BODY' && ancestors.length < MAX_ANCESTORS; up = up.parentElement) {
    const notation = ancestorNotation(up);
    if (notation) ancestors.push(notation);
  }
  if (ancestors.length > 0) print.ancestors = ancestors;
  return print;
}

/** Les préfixes d'un sélecteur, un par sélecteur composé : `a > b c` → `a`, `a > b`, `a > b c`.
 * Une liste de sélecteurs (virgule au premier niveau) n'a pas de préfixe sensé : un seul pas. */
export function selectorSteps(selector: string): string[] {
  const s = selector.trim();
  const steps: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth--;
    else if (depth === 0 && ch === ',') return [s];
    else if (depth === 0 && (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~')) {
      // Fin d'un sélecteur composé — sauf juste après un combinateur, où rien ne s'achève.
      const prefix = s.slice(0, i).trimEnd();
      if (prefix && !/[>+~]$/.test(prefix) && steps[steps.length - 1] !== prefix) steps.push(prefix);
    }
  }
  steps.push(s);
  return steps;
}

function countIn(root: ParentNode, selector: string): number {
  try {
    return root.querySelectorAll(selector).length;
  } catch {
    return -1;
  }
}

export function traceCandidates(root: ParentNode, candidates: readonly string[]): CandidateTrace[] {
  return candidates.map((candidate) => ({
    candidate,
    steps: selectorSteps(candidate).map((step) => countIn(root, step)),
  }));
}

/** Le préfixe le plus long qui ait trouvé quelque chose sans être le candidat entier : là où
 * la recherche s'est arrêtée. À égalité de profondeur, le premier candidat l'emporte. */
function deepestPrefix(trace: readonly CandidateTrace[]): string | null {
  let best: { prefix: string; depth: number } | null = null;
  for (const { candidate, steps } of trace) {
    const prefixes = selectorSteps(candidate);
    for (let k = steps.length - 2; k >= 0; k--) {
      if (steps[k]! > 0) {
        if (!best || k + 1 > best.depth) best = { prefix: prefixes[k]!, depth: k + 1 };
        break;
      }
    }
  }
  return best?.prefix ?? null;
}

/** Le relevé générique d'une chaîne qui n'a rien trouvé dans `root` : trace des candidats,
 * ancêtre le plus profond atteint, et les contrôles qu'il contient. */
export function selectorEvidence(root: ParentNode, candidates: readonly string[]): SelectorEvidence {
  const trace = traceCandidates(root, candidates);
  const evidence: SelectorEvidence = { trace };
  if (root.nodeType === 1) evidence.subject = printElement(root as Element);
  const prefix = deepestPrefix(trace);
  const anchor = prefix ? root.querySelector(prefix) : null;
  if (anchor) {
    evidence.anchor = printElement(anchor);
    const nearby = [...anchor.querySelectorAll(NEARBY)].slice(0, MAX_NEARBY).map(printElement);
    if (nearby.length > 0) evidence.nearby = nearby;
  }
  return evidence;
}

/** Ce que le squelette ne parcourt pas : du code, du style, des gabarits inertes, des
 * métadonnées. Aucun sélecteur de composeur ou de fil n'y cherche quoi que ce soit, et un
 * `<script>` porte des données de session (jetons, état de la page). */
const SKELETON_SKIPPED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);

export interface SkeletonLimits {
  /** Au-delà, la suite d'un même parent est résumée : un tableau de diff a une rangée par ligne
   * de code, et aucun sélecteur n'y cherche la deux-centième. */
  maxChildren: number;
  /** Au-delà, le parcours s'arrête : la borne d'une PR que rien d'autre n'aurait bornée. */
  maxElements: number;
}

export const SKELETON_LIMITS: SkeletonLimits = { maxChildren: 200, maxElements: 40_000 };

function skeletonLine(el: Element, depth: number): string {
  let line = ' '.repeat(depth) + el.tagName.toLowerCase();
  for (const attribute of PRINTED_ATTRIBUTES) {
    const value = printedValue(el, attribute);
    if (value !== null) line += ` ${attribute}="${value}"`;
  }
  if (el.tagName === 'FORM') {
    const action = formAction(el);
    if (action) line += ` action="${action}"`;
  }
  return line;
}

/** Le SQUELETTE d'une page : un élément par ligne, indenté par sa profondeur, réduit à sa
 * balise et aux attributs de `PRINTED_ATTRIBUTES`, sans aucun texte — l'empreinte de
 * `printElement`, étendue à tout l'arbre.
 *
 * Sûr PAR CONSTRUCTION, et c'est la raison de cette forme plutôt que d'une capture masquée :
 * un masquage retire ce qu'on SAIT dangereux, si bien qu'un secret qu'on ne connaît pas encore
 * passe ; ici on ne garde que ce qu'on a choisi de garder. Jamais de `value`, jamais le texte
 * d'un commentaire ni du code.
 *
 * Ce que ce n'est PAS : une page qu'on recharge dans un test. Il sert à rejouer une chaîne de
 * sélecteurs à la lecture ; figer un comportement demande toujours une vraie capture. Les
 * sélecteurs qui filtrent par texte n'y trouvent pas ce qu'ils cherchent. */
export function pageSkeleton(root: Element, limits: SkeletonLimits = SKELETON_LIMITS): string {
  const lines: string[] = [];
  let truncated = false;
  const walk = (el: Element, depth: number): void => {
    if (truncated || SKELETON_SKIPPED.has(el.tagName)) return;
    if (lines.length >= limits.maxElements) {
      truncated = true;
      return;
    }
    lines.push(skeletonLine(el, depth));
    // Le dessin d'une icône ne désigne rien : ses chemins sont des coordonnées.
    if (el.tagName.toLowerCase() === 'svg') return;
    const children = [...el.children];
    for (const child of children.slice(0, limits.maxChildren)) walk(child, depth + 1);
    if (children.length > limits.maxChildren) {
      lines.push(`${' '.repeat(depth + 1)}… +${children.length - limits.maxChildren}`);
    }
  };
  walk(root, 0);
  if (truncated) lines.push(`… ${limits.maxElements}+`);
  return lines.join('\n');
}
