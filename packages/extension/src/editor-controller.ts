// Contrôleur d'un éditeur (§5) : barre d'outils, saisie rapide, retour visuel débattu à
// 150 ms, blocage d'envoi sous les quatre conditions du §5.4. Un contrôleur par
// EditorHandle ; toute la logique de règle vient de core/.

import {
  analyze,
  matchPrefix,
  parseDecorations,
  resolveLabel,
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
import { buildToolbar, type PosedPrefix, type Toolbar } from './ui/toolbar.js';
import { attachQuickInput } from './ui/quickinput.js';
import { FeedbackView } from './ui/feedback.js';
import type { ResolvedClientConfig } from './config-resolver.js';
import type { TelemetryEvent } from './telemetry.js';

/** Le label que le commentaire porte DÉJÀ, au sens du §3.4.1 — `null` s'il n'en porte
 * aucun. La question est posée à `core/` (`splitBody` isole la ligne de préfixe, `matchPrefix`
 * lui applique l'expression de référence) plutôt qu'au texte à la main : un repérage
 * divergent répondrait d'une autre ligne que celle que la validation juge. */
/** Ce que le commentaire porte, dans les termes de la CONFIGURATION.
 *
 * Rien n'est décidé ici : `core/` répond aux deux questions, parce que c'est lui qui les
 * tranche partout ailleurs, et qu'un second jugement finit toujours par diverger du premier.
 *
 * `resolveLabel` — et non une comparaison de chaînes — pour deux raisons trouvées en revue
 * (revue Codex, PR #35) : la casse d'un id configuré est libre, donc un `Risk` mis en
 * minuscules ici ne correspondait plus à son propre bouton ; et un ALIAS (`bug:` pour
 * `issue`, §3.2) ne correspondait à aucun bouton, alors que le §3.2 dit qu'il « en hérite
 * intégralement ». La barre parle donc de labels canoniques, jamais de ce qui est écrit.
 *
 * `parseDecorations` pour la même raison, et pour une de plus : elle distingue une absence
 * de décoration d'une décoration ILLÉGALE. `issue (): x` faisait cocher « aucune » — la
 * barre affirmait qu'il n'y en avait pas pendant que le validateur signalait
 * `E-DECORATION-SYNTAX`. */
function prefixPosedIn(value: string, config: EffectiveConfig): PosedPrefix {
  const prefixLine = splitBody(value).prefixLine;
  const posed = prefixLine === null ? null : matchPrefix(prefixLine);
  if (posed === null) {
    return { hasPrefix: false, label: null, writtenLabel: null, decorations: [], malformedDecorations: false };
  }
  // L'id canonique sert à COMPARER (bouton, bascule, comptage) ; l'orthographe écrite sert à
  // RÉÉCRIRE. Les confondre imposait la forme canonique au premier geste venu (§3.2).
  //
  // Et le `null` de `resolveLabel` dit « ce label n'est pas dans la configuration », pas
  // « ce commentaire n'a pas de préfixe » : effacer AUSSI l'orthographe faisait prendre à la
  // barre sa branche « rien d'écrit » sur `riskk (blocking): x`, où elle pouvait cocher
  // « aucune » devant une décoration bien visible, et où plus aucun geste n'atteignait le
  // préfixe (revue Codex, PR #35). `hasPrefix` porte donc la question « une ligne de préfixe
  // est-elle reconnue ? », que `label` ne peut pas porter.
  const label = resolveLabel(posed.label, config)?.label.id ?? null;
  const writtenLabel = posed.label;
  if (posed.decorations === null) {
    return { hasPrefix: true, label, writtenLabel, decorations: [], malformedDecorations: false };
  }
  const parsed = parseDecorations(posed.decorations);
  return {
    hasPrefix: true,
    label,
    writtenLabel,
    decorations: parsed.canonical,
    malformedDecorations: parsed.syntaxIssues.length > 0,
  };
}

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
  telemetry?: (event: TelemetryEvent) => boolean;
  /** Codes de diagnostic déjà comptés par un contrôleur PRÉCÉDENT pour ce même éditeur, à
   * reprendre tel quel (revue Codex, PR #39) : `bootstrap()` reconstruit entièrement le
   * contrôleur dès qu'un champ de rendu change (langue, style de badge, TTL, état
   * dégradé — `renderConfigSignatureOf`), y compris quand le diagnostic affiché, lui, ne
   * change pas du tout. Repartir d'un `#countedCodes` vide à chaque reconstruction ferait
   * recompter un code encore présent, jamais disparu, gonflant la télémétrie opt-in (§10)
   * à chaque rendu forcé plutôt qu'à chaque apparition RÉELLE. */
  initialCountedCodes?: ReadonlySet<string>;
}

/** Table par défaut des raccourcis directs (§5.2) — surchargable par les préférences. */
/** Marque, sur l'élément lui-même, la valeur NATIVE d'`aria-disabled` juste avant que ce
 * contrôleur ne pose la sienne — même mécanisme que `NATIVE_ARIA_DISABLED_MARKER` du bouton
 * de complétion (content-internal.ts, §6.5) : un bouton de soumission peut déjà porter
 * `aria-disabled="true"` pour une raison qui lui est PROPRE (branche protégée, permissions),
 * sans rapport avec le grisage de ce contrôleur (§5.4). Écraser puis retirer purement et
 * simplement l'attribut confondait les deux états : au dégrisage (`refresh()`) comme à
 * `dispose()`, le bouton redevenait accessible même si la plateforme l'avait natvement
 * désactivé (revue Codex, PR #39). Chaîne vide = attribut natif absent — retiré, pas
 * réécrit avec une chaîne vide, à la restauration. */
const SUBMIT_NATIVE_ARIA_DISABLED_MARKER = 'cctSubmitNativeAriaDisabled';

/** Pose le grisage de ce contrôleur sur un bouton de soumission (§5.4), en capturant sa
 * valeur native d'`aria-disabled` la toute première fois — jamais aux passages suivants,
 * sous peine d'écraser la valeur native par notre PROPRE écriture lors d'un second cycle
 * bloqué → bloqué. */
function blockSubmit(control: SubmitControl): void {
  const element = control.element as HTMLElement;
  if (element.dataset[SUBMIT_NATIVE_ARIA_DISABLED_MARKER] === undefined) {
    element.dataset[SUBMIT_NATIVE_ARIA_DISABLED_MARKER] = element.getAttribute('aria-disabled') ?? '';
  }
  element.setAttribute('aria-disabled', 'true');
}

/** Défait `blockSubmit` — restaure la valeur native capturée, sans y toucher si ce
 * contrôleur n'a jamais grisé ce bouton (rien à défaire, jamais un retrait d'un état natif
 * qu'il n'a pas posé lui-même). */
function unblockSubmit(control: SubmitControl): void {
  const element = control.element as HTMLElement;
  const native = element.dataset[SUBMIT_NATIVE_ARIA_DISABLED_MARKER];
  if (native === undefined) return;
  if (native) element.setAttribute('aria-disabled', native);
  else element.removeAttribute('aria-disabled');
  delete element.dataset[SUBMIT_NATIVE_ARIA_DISABLED_MARKER];
}

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
  /** La barre, pour la réaligner sur le texte à chaque validation (§5.1). */
  #toolbar: Toolbar | null = null;
  #lastDecision: GuardDecision | null = null;
  #disposers: (() => void)[] = [];
  /** Codes déjà comptés pour l'état COURANT de l'éditeur. `refresh()` s'exécute à chaque
   * frappe débattue : compter à chaque passage ferait d'un « code d'erreur » (§10) un
   * compteur de frappes, ce qui n'est plus un agrégat et en dit bien plus long. Seule
   * l'APPARITION d'un code est comptée ; sa disparition puis son retour en recomptent un. */
  #countedCodes: Set<string>;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.#countedCodes = new Set(deps.initialCountedCodes ?? []);
  }

  /** Photo des codes actuellement comptés (§10) — lue par `bootstrap()` juste avant de
   * défaire ce contrôleur pour le reconstruire (revue Codex, PR #39), pour que le
   * remplaçant la reprenne via `initialCountedCodes` plutôt que de repartir de zéro. */
  snapshotCountedCodes(): ReadonlySet<string> {
    return this.#countedCodes;
  }

  get config(): EffectiveConfig {
    return this.deps.resolved.config;
  }

  /** Remplace la configuration résolue — ET le résumé publié — d'un éditeur DÉJÀ attaché
   * (revue Codex et Reefact, PR #39) : sans cela, un éditeur ouvert avant qu'un sondage
   * périodique (§8.1.2) force un nouveau rendu de la barre continue de valider et de
   * bloquer l'envoi sur la configuration capturée à `attach()` — figée dans `deps.resolved`,
   * jamais relue ensuite. Un assouplissement du mode (`enforce` → `off`, §7) ne libérerait
   * alors l'éditeur qu'à sa fermeture/réouverture ou au rechargement de la page, pas « en
   * direct » comme le §8.1.3 l'exige pour ce genre de changement.
   *
   * `published` DOIT être relu au moment de l'appel, jamais gardé de l'attachement d'origine
   * (revue Reefact, PR #39) : `deps.published`, sinon inchangé, est comparé à `deps.resolved
   * .fingerprint` par `decideGuard()` (§8.1.3, règle 2) — un scénario de propagation où
   * l'extension adopte une configuration B avant que le composant B ne publie lui-même
   * l'empreinte B laisserait cet éditeur comparer la NOUVELLE configuration à l'ANCIEN
   * résumé indéfiniment, l'écart d'empreinte ne se résorbant jamais même une fois les deux
   * composants d'accord.
   *
   * `refresh()` referme la boucle : décompte, grisage, infobulle et pastille (§5.3) sont
   * tous dérivés de `this.config`/`this.deps.resolved`/`this.deps.published`, donc tous à
   * jour dès ce retour. La barre d'outils, elle, N'EST PAS reconstruite ici — ses boutons de
   * label reflètent la configuration au moment où `attach()` a construit le DOM
   * (`buildToolbar`) ; un mode qui bascule à `off` ou en revient est traité par
   * `bootstrap()` en défaisant/reconstruisant le contrôleur lui-même (revue Reefact, PR #39),
   * jamais par cette méthode. Sur un éditeur qui RESTE actif, un label retiré entre-temps
   * continue donc de s'afficher dans la barre, mais insérer son préfixe ne validerait plus
   * (`this.config` fait foi) — un décalage cosmétique, jamais un contournement du blocage. */
  updateResolved(resolved: ResolvedClientConfig, published: PublishedSummary | null): void {
    this.deps.resolved = resolved;
    this.deps.published = published;
    this.refresh();
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
      // Le label vient du GESTE, pas de la dernière analyse : dans la fenêtre de
      // validation débattue, `#lastAnalysis` est en retard sur le texte et son repli
      // (`suggestion`) réécrivait le label du commentaire — une décoration changeait un
      // label (revue Codex, PR #35).
      onFreeDecoration: (decoration, label) => this.insertPrefix(label, [decoration], false),
      currentPrefix: () => prefixPosedIn(this.deps.adapter.readValue(this.deps.editor), this.config),
    });
    this.#toolbar = toolbar;
    host.insertBefore(toolbar.element, this.deps.editor.element);
    this.#disposers.push(() => {
      toolbar.element.remove();
      this.#toolbar = null;
    });

    // §5.3 — pastille permanente sous la zone de saisie, zone aria-live.
    this.#feedback = new FeedbackView(this.deps.editor.element, this.deps.lang);
    this.#disposers.push(() => this.#feedback?.dispose());

    // §5.2 — complétion `/` ou `:`, abréviations Tab, navigation clavier.
    const quick = attachQuickInput({
      editor: this.deps.editor,
      adapter: this.deps.adapter,
      config: this.config,
      lang: this.deps.lang,
      // Même compteur que `insertPrefix()` : « label utilisé » ne doit pas dépendre du
      // chemin par lequel la personne l'a posé (§10, revue Codex PR #31).
      onLabelAccepted: (id) => this.deps.telemetry?.({ kind: 'label-used', label: id }),
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
          // `undefined`, pas `[]` : un raccourci pose un label, il n'efface pas une
          // décoration déjà écrite (CA-02).
          this.insertPrefix(label, undefined, false);
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

  /** Défait tout ce qu'`attach()` a posé — barre d'outils, saisie rapide, écouteurs — ET
   * l'état de blocage que ce contrôleur a lui-même écrit sur les boutons de soumission
   * (revue Codex, PR #39) : `#disposers` ne couvre que ce qu'`attach()` a construit, jamais
   * `aria-disabled`, posé plus tard par `refresh()` sur des éléments de la PLATEFORME que ce
   * contrôleur ne possède pas. Sans ce retrait explicite, un éditeur `enforce` disposé
   * pendant qu'un diagnostic bloquant est affiché (passage en direct à `off`, §7) laissait
   * son bouton grisé indéfiniment — une extension qui vient de se déclarer entièrement
   * inactive continuait pourtant d'en bloquer l'envoi.
   *
   * Le timer de validation débattue (§5.3) est annulé pour la même raison : un `refresh()`
   * déjà programmé exécuté APRÈS ce `dispose()` réécrirait cet état juste après l'avoir
   * retiré, sur un contrôleur que plus rien ne doit toucher. */
  dispose(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    for (const control of this.deps.adapter.getSubmitControls(this.deps.editor)) {
      unblockSubmit(control);
    }
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
    // La barre se réaligne sur le texte à chaque validation — donc après chaque frappe
    // débattue comme après chaque insertion. Un préfixe tapé à la main allume son bouton
    // et coche sa décoration, exactement comme s'il venait d'être cliqué.
    this.#toolbar?.sync();
    this.#feedback?.render({
      state: feedbackState(analysis.diagnostics, decision, this.deps.resolved.degraded),
      diagnostics: analysis.diagnostics, // tous, dans l'ordre du §3.5.1 (§5.3)
      aliasRewrite: analysis.aliasRewrite,
      onFix: (replacement) => this.applyLineFix(replacement),
    });
    for (const control of this.deps.adapter.getSubmitControls(this.deps.editor)) {
      // aria-disabled, jamais l'attribut natif disabled : il retirerait le bouton de
      // l'ordre de tabulation (§5.4, CA-12). La valeur NATIVE, si le bouton en portait déjà
      // une pour son propre compte, est capturée/restaurée plutôt qu'écrasée (revue Codex,
      // PR #39) — voir `blockSubmit`/`unblockSubmit`.
      if (decision.block) blockSubmit(control);
      else unblockSubmit(control);
    }
  }

  /** Compte l'apparition d'un code de diagnostic (§10, « code d'erreur »). */
  #countCodes(diagnostics: readonly { code: string }[]): void {
    const present = new Set(diagnostics.map((d) => d.code));
    // On ne retient QUE ce qui a effectivement été compté. Marquer un code comme vu alors
    // que l'émetteur n'était pas encore armé le condamnait au silence jusqu'à sa
    // disparition — et un diagnostic qui reste affiché ne disparaît pas (revue Codex,
    // PR #31). Les codes toujours présents mais jamais comptés restent donc candidats.
    const counted = new Set<string>();
    for (const code of present) {
      if (this.#countedCodes.has(code)) {
        counted.add(code);
        continue;
      }
      if (this.deps.telemetry?.({ kind: 'validation-code', code }) === true) counted.add(code);
    }
    this.#countedCodes = counted;
  }

  /** §5.1 — insertion/remplacement du préfixe, sélection restaurée décalée (CA-02). */
  insertPrefix(label: string | null, decorations: string[] | undefined, toggle: boolean): void {
    const element = this.deps.editor.element as HTMLTextAreaElement;
    const value = this.deps.adapter.readValue(this.deps.editor);
    const selStart = element.selectionStart ?? 0;
    const selEnd = element.selectionEnd ?? 0;
    const hasSelection = selEnd > selStart;

    // `label` vient du GESTE et vaut ce qu'il dit : un label, ou `null` pour « le
    // commentaire n'en porte aucun ». Il retombait auparavant sur `#lastAnalysis`, ce qui
    // faisait de `null` un « je ne me prononce pas » — et l'analyse, débattue à 150 ms, est
    // en retard. Effacer un préfixe puis valider une décoration RECRÉAIT donc le label
    // qu'on venait de supprimer (revue Codex, PR #35).
    //
    // C'est la troisième fois dans cette barre qu'une même valeur porte deux intentions :
    // `[]` pour « aucune décoration » et « non spécifiée », un label seul pour l'id canonique
    // et l'orthographe écrite, `null` ici. Le repli périmé disparaît plutôt que d'être
    // rattrapé : plus aucun geste ne demande son avis à une analyse qu'il n'a pas lue.
    const effectiveLabel = label ?? 'suggestion';
    // Ce que le commentaire porte AVANT cette insertion, en id canonique — alias résolu et
    // casse de la configuration (§3.2). Deux décisions en dépendent : retirer ou remplacer,
    // et compter ou non un « label utilisé ».
    const posedBefore = prefixPosedIn(value, this.config).label;
    // Ce qu'on INSÈRE peut être un alias — un geste de décoration réécrit le préfixe tel
    // qu'il est écrit. Les deux décisions ci-dessus portent sur le label, pas sur son
    // orthographe : elles se prennent donc sur la forme canonique, sans quoi décorer
    // `bug: x` compterait un usage de label et casserait la bascule.
    // `null` quand le label posé n'est PAS de la configuration (`riskk`). Deux décisions en
    // dépendent, et aucune ne doit alors s'appuyer sur la chaîne écrite : ce serait comparer
    // à un label qui n'existe pas, et surtout COMPTER du texte saisi par la personne — le
    // §10 interdit d'émettre autre chose qu'un identifiant du vocabulaire. Décorer un
    // préfixe inconnu ne compte donc aucun usage, plutôt que d'en inventer un.
    const canonicalEffective = resolveLabel(effectiveLabel, this.config)?.label.id ?? null;
    const { nextValue, caret, delta, changedAt, removed } = computePrefixInsertion(
      value,
      { label: effectiveLabel, decorations },
      // `sameLabel` se décide ICI, où la configuration est disponible : `posedBefore` est
      // déjà l'id canonique rendu par `resolveLabel()`, alias résolu (§3.2).
      { toggle, sameLabel: canonicalEffective !== null && posedBefore === canonicalEffective }
    );
    // « label utilisé » (§10) : l'identifiant du label effectivement POSÉ, jamais la ligne
    // écrite, et jamais un label qu'on vient de RETIRER. Cliquer deux fois le même bouton
    // pose puis retire ; compter les deux gonflait l'usage d'un label qu'on a justement
    // renoncé à employer (revue Codex, PR #31). Compté à l'insertion, et non à la lecture
    // d'un préfixe déjà saisi — ce qui compterait le même commentaire à chaque frappe.
    //
    // Et compté seulement si le label CHANGE. Ce même point d'entrée sert aux décorations :
    // la barre d'outils rappelle `insertPrefix()` avec le label courant (ou `null`) pour
    // poser `(blocking)`, `(non-blocking)`, une décoration libre… `removed` vaut alors
    // `false` et chacune de ces retouches recomptait le même label. L'agrégat aurait mesuré
    // les modifications de décoration, pas les labels posés (revue Codex, PR #31) — et
    // d'autant plus fort que la personne hésite, ce qui n'a aucun sens à remonter.
    // Et compté sous l'id CANONIQUE : « l'alias n'est pas un label distinct […] il est
    // comptabilisé sous son label canonique » (§3.2).
    if (!removed && canonicalEffective !== null && posedBefore !== canonicalEffective) {
      this.deps.telemetry?.({ kind: 'label-used', label: canonicalEffective });
    }
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
