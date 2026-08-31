// Contrôleur d'un éditeur (§5) : barre d'outils, saisie rapide, retour visuel débattu à
// 150 ms, blocage d'envoi sous les quatre conditions du §5.4. Un contrôleur par
// EditorHandle ; toute la logique de règle vient de core/.

import {
  analyze,
  splitBody,
  type CommentAnalysis,
  type EffectiveConfig,
  type PrRef,
  type PublishedSummary,
  type ValidationInput,
} from '@cct/core';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import { computePrefixInsertion, shiftSelection } from '@cct/adapter-shared';
import { decideGuard, feedbackState, type GuardDecision } from './guard.js';
import { buildToolbar } from './ui/toolbar.js';
import { attachQuickInput } from './ui/quickinput.js';
import { FeedbackView } from './ui/feedback.js';
import type { ResolvedClientConfig } from './config-resolver.js';
import type { TelemetryEvent } from './telemetry.js';

export const VALIDATION_DEBOUNCE_MS = 150; // §5.3

export interface ControllerDeps {
  adapter: PlatformAdapter;
  editor: EditorHandle;
  resolved: ResolvedClientConfig;
  published: PublishedSummary | null;
  lang: string;
  currentUserLogin: string;
  /** Raccourcis directs (§5.2, ex. Alt+I → issue) — préférences locales de l'utilisateur
   * (§8.2), clé « Alt+<lettre> » → id de label. */
  directShortcuts?: Record<string, string>;
  /** Compteurs agrégés (§10) — absent hors extension et dans les tests qui ne s'y
   * intéressent pas. L'émetteur décide seul s'il a le droit d'émettre ; ce contrôleur
   * compte sans se poser la question, et sans jamais lui passer autre chose qu'un
   * identifiant. */
  telemetry?: (event: TelemetryEvent) => void;
}

/** Table par défaut des raccourcis directs (§5.2) — surchargable par les préférences. */
export const DEFAULT_DIRECT_SHORTCUTS: Record<string, string> = {
  'Alt+I': 'issue',
  'Alt+S': 'suggestion',
  'Alt+N': 'nitpick',
  'Alt+T': 'todo',
  'Alt+Q': 'question',
  'Alt+P': 'praise',
  'Alt+C': 'chore',
  'Alt+D': 'decision',
};

export class EditorController {
  readonly deps: ControllerDeps;
  #feedback: FeedbackView | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #lastAnalysis: CommentAnalysis | null = null;
  #lastDecision: GuardDecision | null = null;
  #disposers: (() => void)[] = [];
  /** Codes déjà comptés pour l'état COURANT de l'éditeur. `refresh()` s'exécute à chaque
   * frappe débattue : compter à chaque passage ferait d'un « code d'erreur » (§10) un
   * compteur de frappes, ce qui n'est plus un agrégat et en dit bien plus long. Seule
   * l'APPARITION d'un code est comptée ; sa disparition puis son retour en recomptent un. */
  #countedCodes = new Set<string>();

  constructor(deps: ControllerDeps) {
    this.deps = deps;
  }

  get config(): EffectiveConfig {
    return this.deps.resolved.config;
  }

  attach(): void {
    const decision = this.evaluateNow();
    if (decision.inactive) return; // mode off : l'extension reste inactive (§7)

    const host = this.deps.editor.element.parentElement;
    if (!host) return;

    // Retrait intérieur de la boîte de commentaire (styles.css). Posé par une classe, et
    // non par un sélecteur visant directement le conteneur de la plateforme, pour deux
    // raisons : le nom de ce conteneur est propre à chaque plateforme, et surtout le
    // retrait ne doit s'appliquer QU'AUX boîtes où l'extension injecte réellement quelque
    // chose — un sélecteur global restylerait aussi celles qu'elle ne touche pas. Retiré
    // à dispose(), comme tout ce que cette méthode pose.
    //
    // Réservé à la génération React du CommentBox GitHub (« Files changed réécrite » dans
    // selectors.ts) — reconnue via les deux mêmes indices que ses deux sélecteurs candidats
    // pour cette génération : la classe `CommentBox` et le composeur `data-testid`. C'est
    // cette génération dont le conteneur est borderless et sans padding propre (§ci-dessus).
    // Sur le DOM hérité de GitHub et sur Azure DevOps, la zone de saisie porte sa propre
    // bordure et son propre padding ; y poser ce retrait décalerait le conteneur sans
    // corriger l'alignement visé, et effacerait à tort le padding qui donne sa forme au champ.
    //
    // Le composeur `data-testid` est un sélecteur DESCENDANT (`div[...] textarea`, sans
    // combinateur d'enfant direct) : la zone de saisie peut y être nichée sous un wrapper
    // intermédiaire, distinct de `host`. Le conteneur à padder est donc l'ancêtre réellement
    // trouvé par ce sélecteur — pas `host` — pour que l'en-tête et les onglets natifs, situés
    // au même niveau que ce wrapper, reçoivent eux aussi le retrait.
    const commentBoxContainer = this.deps.editor.element.closest('[data-testid*="comment-composer"]');
    const paddedContainer = commentBoxContainer ?? (this.deps.editor.element.className.includes('CommentBox') ? host : null);
    if (paddedContainer) {
      paddedContainer.classList.add('cct-host');
      this.#disposers.push(() => paddedContainer.classList.remove('cct-host'));
      // La zone de saisie se donne souvent son propre retrait horizontal (sur GitHub,
      // `.CommentBox-input` porte `padding: var(--base-size-8)`), qui ferait double emploi
      // avec celui du conteneur et désalignerait son texte du reste. Neutralisé en CSS ; la
      // règle correspondante (styles.css) cible un descendant, pas seulement un enfant
      // direct, pour couvrir aussi ce wrapper intermédiaire.
      this.deps.editor.element.classList.add('cct-editor');
      this.#disposers.push(() => this.deps.editor.element.classList.remove('cct-editor'));
    }

    // §5.1 — barre d'outils au-dessus de la zone de saisie.
    const toolbar = buildToolbar({
      config: this.config,
      lang: this.deps.lang,
      onLabel: (label, decorations, toggle) => this.insertPrefix(label, decorations, toggle),
      onFreeDecoration: (decoration) => this.insertPrefix(null, [decoration], false),
    });
    host.insertBefore(toolbar, this.deps.editor.element);
    this.#disposers.push(() => toolbar.remove());

    // §5.3 — pastille permanente sous la zone de saisie, zone aria-live.
    this.#feedback = new FeedbackView(this.deps.editor.element, this.deps.lang);
    this.#disposers.push(() => this.#feedback?.dispose());

    // §5.2 — complétion `/` ou `:`, abréviations Tab, navigation clavier.
    const quick = attachQuickInput({
      editor: this.deps.editor,
      adapter: this.deps.adapter,
      config: this.config,
      lang: this.deps.lang,
    });
    this.#disposers.push(quick.dispose);

    // Validation débattue à 150 ms pendant la frappe (§5.3).
    const onInput = () => {
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.refresh(), VALIDATION_DEBOUNCE_MS);
    };
    this.deps.editor.element.addEventListener('input', onInput);
    this.#disposers.push(() => this.deps.editor.element.removeEventListener('input', onInput));

    // §5.4 — interception de chaque point de sortie, raccourci clavier compris (§4.3).
    for (const control of this.deps.adapter.getSubmitControls(this.deps.editor)) {
      this.#guardControl(control);
    }
    const onKeydown = (e: Event) => {
      const ke = e as KeyboardEvent;
      // Raccourcis directs (§5.2) : Alt+<lettre> insère le label correspondant.
      if (ke.altKey && !ke.ctrlKey && !ke.metaKey && ke.key.length === 1) {
        const combo = `Alt+${ke.key.toUpperCase()}`;
        const table = this.deps.directShortcuts ?? DEFAULT_DIRECT_SHORTCUTS;
        const label = Object.hasOwn(table, combo) ? table[combo] : undefined;
        if (label !== undefined && this.config.labels.some((l) => l.id === label && l.enabled)) {
          ke.preventDefault();
          this.insertPrefix(label, [], false);
          return;
        }
      }
      if (ke.key === 'Enter' && (ke.ctrlKey || ke.metaKey)) {
        if (this.#shouldBlockNow()) {
          ke.preventDefault();
          ke.stopPropagation();
          this.#announceBlock();
        }
      }
    };
    this.deps.editor.element.addEventListener('keydown', onKeydown, true);
    this.#disposers.push(() => this.deps.editor.element.removeEventListener('keydown', onKeydown, true));

    this.refresh();
  }

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
  }

  /** Analyse courante — c'est analyze() de core/ qui juge, jamais l'extension. */
  evaluateNow(): GuardDecision {
    const body = this.deps.adapter.readValue(this.deps.editor);
    const ctx = this.deps.editor.context;
    const input: ValidationInput = {
      body,
      platform: this.deps.adapter.platformProfile(),
      isSystemGenerated: false,
      zone: ctx.zone,
      canCarryBlockingState: ctx.canCarryBlockingState,
      author: {
        id: `login:${this.deps.currentUserLogin.toLowerCase()}`,
        login: this.deps.currentUserLogin,
        isServiceAccount: false,
      },
    };
    this.#lastAnalysis = analyze(input, this.config);
    this.#lastDecision = decideGuard({
      config: this.config,
      fingerprint: this.deps.resolved.fingerprint,
      published: this.deps.published,
      degraded: this.deps.resolved.degraded,
      pr: this.prRef(),
      diagnostics: this.#lastAnalysis.diagnostics,
    });
    return this.#lastDecision;
  }

  refresh(): void {
    const decision = this.evaluateNow();
    const analysis = this.#lastAnalysis!;
    this.#countCodes(analysis.diagnostics);
    this.#feedback?.render({
      state: feedbackState(analysis.diagnostics, decision, this.deps.resolved.degraded),
      diagnostics: analysis.diagnostics, // tous, dans l'ordre du §3.5.1 (§5.3)
      aliasRewrite: analysis.aliasRewrite,
      onFix: (replacement) => this.applyLineFix(replacement),
    });
    for (const control of this.deps.adapter.getSubmitControls(this.deps.editor)) {
      // aria-disabled, jamais l'attribut natif disabled : il retirerait le bouton de
      // l'ordre de tabulation (§5.4, CA-12).
      if (decision.block) control.element.setAttribute('aria-disabled', 'true');
      else control.element.removeAttribute('aria-disabled');
    }
  }

  /** Compte l'apparition d'un code de diagnostic (§10, « code d'erreur »). */
  #countCodes(diagnostics: readonly { code: string }[]): void {
    const present = new Set(diagnostics.map((d) => d.code));
    for (const code of present) {
      if (this.#countedCodes.has(code)) continue;
      this.deps.telemetry?.({ kind: 'validation-code', code });
    }
    this.#countedCodes = present;
  }

  /** §5.1 — insertion/remplacement du préfixe, sélection restaurée décalée (CA-02). */
  insertPrefix(label: string | null, decorations: string[], toggle: boolean): void {
    const element = this.deps.editor.element as HTMLTextAreaElement;
    const value = this.deps.adapter.readValue(this.deps.editor);
    const selStart = element.selectionStart ?? 0;
    const selEnd = element.selectionEnd ?? 0;
    const hasSelection = selEnd > selStart;

    const effectiveLabel = label ?? this.#lastAnalysis?.resolved?.label.id ?? 'suggestion';
    const { nextValue, caret, delta, changedAt } = computePrefixInsertion(
      value,
      { label: effectiveLabel, decorations },
      { toggle }
    );
    // « label utilisé » (§10) : l'identifiant du label effectivement posé, jamais la ligne
    // écrite. Compté ici, à l'insertion, et non à la lecture d'un préfixe déjà saisi — ce
    // qui compterait le même commentaire à chaque frappe.
    this.deps.telemetry?.({ kind: 'label-used', label: effectiveLabel });
    this.deps.adapter.writeValue(this.deps.editor, nextValue, hasSelection ? undefined : caret);
    if (hasSelection) {
      // Le texte sélectionné n'est pas remplacé ; la sélection est restaurée, décalée de
      // la longueur du préfixe inséré (§5.1, CA-02) — mais une sélection située AVANT le
      // point de modification (dans une citation au-dessus de la ligne de préfixe) reste
      // en place : le décalage ne s'applique qu'à partir de changedAt.
      shiftSelection(element, selStart, selEnd, delta, changedAt);
    }
    this.refresh();
  }

  /** §5.3 — correction en un clic : la ligne de préfixe entièrement réécrite (§9.2.1).
   * La ligne visée est déterminée par le MÊME algorithme que la validation (§3.4.1) —
   * un repérage divergent corrigerait une autre ligne que celle qui a été jugée. */
  applyLineFix(replacement: string): void {
    const value = this.deps.adapter.readValue(this.deps.editor);
    const split = splitBody(value);
    if (split.prefixLineIndex === null) return;
    const lines = value.split(/\r?\n/);
    lines[split.prefixLineIndex] = replacement;
    this.deps.adapter.writeValue(this.deps.editor, lines.join('\n'));
    this.refresh();
  }

  prRef(): PrRef {
    return this.deps.editor.context.pr;
  }

  #shouldBlockNow(): boolean {
    return this.evaluateNow().block;
  }

  #announceBlock(): void {
    this.#feedback?.announceBlocked(this.#lastAnalysis?.diagnostics ?? []);
  }

  #guardControl(control: SubmitControl): void {
    const onClick = (e: Event) => {
      if (this.#shouldBlockNow()) {
        e.preventDefault();
        e.stopPropagation();
        this.#announceBlock();
      }
    };
    control.element.addEventListener('click', onClick, true);
    this.#disposers.push(() => control.element.removeEventListener('click', onClick, true));
  }
}
