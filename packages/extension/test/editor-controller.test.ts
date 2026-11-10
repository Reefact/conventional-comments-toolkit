// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { defaultConfig, resolveConfig, type PrRef } from '@cct/core';
import { ClientConfigResolver, type ResolvedClientConfig } from '../src/config-resolver.js';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';
import { writeToTextField, NEUTRAL_EDITOR_CHROME } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitKeystrokes } from '@cct/adapter-shared';
import type { TelemetryEvent } from '../src/telemetry.js';
import { submitLookup } from './helpers/submit-lookup.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function setup(
  mode: 'enforce' | 'assist' = 'enforce',
  opts: {
    telemetry?: (event: TelemetryEvent) => boolean;
    initialCountedCodes?: ReadonlySet<string>;
    /** Langue RÉSOLUE au §8.1.2 — celle que `resolveUiLanguage()` rend au contrôleur. */
    lang?: string;
    /** Clé `language` du document de configuration (§8.2) — `null` par défaut, comme
     * `defaultConfig()` : c'est le cas ordinaire, celui où seule la préférence locale parle. */
    configLanguage?: string | null;
    /** Ordre personnel des boutons (§5.1) — préférence locale lue par le script de contenu. */
    labelOrder?: string[];
    /** Les touches que la plateforme fictive DÉCLARE (§5.4) — par défaut, Ctrl+Entrée au champ et
     * rien sur le bouton, la règle de GitHub. */
    keystrokes?: SubmitKeystrokes;
    /** La PR de l'éditeur — par défaut une PR récente. */
    pr?: PrRef;
    /** La configuration RÉSOLUE en main — par défaut, les défauts du produit au `mode` donné. */
    resolved?: ResolvedClientConfig;
    /** La relecture sans cache que le contrôleur lance avant de bloquer (§8.1.3, règle 3). */
    rereadConfig?: () => Promise<ResolvedClientConfig>;
  } = {}
) {
  const host = document.createElement('div');
  const textarea = document.createElement('textarea');
  let submit = document.createElement('button');
  submit.type = 'submit';
  host.append(textarea, submit);
  document.body.appendChild(host);

  const editor: EditorHandle = {
    id: 'e1',
    element: textarea,
    context: { zone: 'thread-root', action: 'compose', pr: opts.pr ?? pr, canCarryBlockingState: true },
  };

  // Le CHÂSSIS que l'adaptateur déclare (§9.2.3). Ce fichier teste le contrôleur PARTAGÉ : il
  // ne doit donc connaître aucune forme de DOM de plateforme — ni la classe `CommentBox`, ni
  // un composeur `data-testid`, qui vivaient ici et sont partis avec les sélecteurs qu'ils
  // exerçaient (adapters/github/test/editor-chrome.test.ts). Ce qui se teste ICI est le
  // CONTRAT : le contrôleur pare le conteneur que l'adaptateur nomme, quel qu'il soit, et
  // retombe sur la géométrie quand l'adaptateur ne se prononce pas.
  let framed: Element | null = host;

  const adapter: Partial<PlatformAdapter> = {
    platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
    getEditorChrome: () => ({ ...NEUTRAL_EDITOR_CHROME, framedContainer: framed }),
    getSubmitControls: () => submitLookup([{ element: submit, kind: 'submit' }]),
    submitKeystrokes: () => opts.keystrokes ?? { field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' }], control: [] },
    readValue: () => textarea.value,
    writeValue: (_e, text, caret) => writeToTextField(textarea, text, caret),
  };

  const config = defaultConfig();
  config.mode = mode;
  config.language = opts.configLanguage ?? null;

  const controller = new EditorController({
    adapter: adapter as PlatformAdapter,
    editor,
    resolved: opts.resolved ?? { config, notices: [], degraded: false, degradedReason: null },
    ...(opts.rereadConfig ? { rereadConfig: opts.rereadConfig } : {}),
    lang: opts.lang ?? 'fr',
    currentUserLogin: 'alice',
    telemetry: opts.telemetry,
    initialCountedCodes: opts.initialCountedCodes,
    ...(opts.labelOrder ? { labelOrder: opts.labelOrder } : {}),
  });
  return {
    controller,
    textarea,
    submit,
    host,
    /** Remplace le bouton par un NOUVEL élément, comme React le fait sur la page Overview de
     * GitHub quand le champ se remplit ; l'adaptateur répond ensuite par le nouveau. */
    replaceSubmit: (): HTMLButtonElement => {
      const next = document.createElement('button');
      next.type = 'submit';
      submit.replaceWith(next);
      submit = next;
      return next;
    },
    /** Ce que l'adaptateur répondra au prochain `attach()` — `null` valant « je ne me
     * prononce pas », la seule réponse d'une plateforme non mesurée. */
    setFramedContainer: (el: Element | null) => {
      framed = el;
    },
  };
}

describe('§9.3 — écriture programmatique (setter natif + input)', () => {
  it('déclenche un événement input qui remonte', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const handler = vi.fn();
    textarea.addEventListener('input', handler);
    writeToTextField(textarea, 'issue: x', 8);
    expect(textarea.value).toBe('issue: x');
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('§5 — contrôleur d’éditeur', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('§5.1 : injecte une barre d’outils au-dessus de la zone (un bouton par label actif)', () => {
    const { controller, host } = setup();
    controller.attach();
    const toolbar = host.querySelector('.cct-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.querySelectorAll('.cct-label-button')).toHaveLength(18); // tous les labels livrés sont actifs, sauf `quibble` (§3.2)
    controller.dispose();
  });

  it('CA-50 : l’ordre personnel des boutons atteint la barre qu’il injecte', () => {
    const { controller, host } = setup('enforce', { labelOrder: ['ack', 'issue'] });
    controller.attach();
    const first = (sel: string) => (host.querySelector(sel) as HTMLElement).dataset['label'];
    expect(first('.cct-toolbar-row > .cct-label-button')).toBe('issue');
    expect(first('.cct-reply-row .cct-label-button')).toBe('ack');
    controller.dispose();
  });

  it('marque le conteneur et la zone pour le retrait intérieur, et les démarque à dispose()', () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    // Le retrait n'est posé que sur les boîtes réellement instrumentées : un sélecteur
    // visant le conteneur de la plateforme restylerait aussi celles qu'on ne touche pas.
    expect(host.classList.contains('cct-host')).toBe(true);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
    // Rien de ce que attach() pose ne doit survivre au détachement.
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(false);
  });

  it('ne pose aucun retrait quand l’adaptateur ne se prononce pas et qu’aucun cadre ne se mesure', () => {
    const { controller, textarea, host, setFramedContainer } = setup();
    // La réponse d'une plateforme non mesurée (`NEUTRAL_EDITOR_CHROME`). Sans cadre trouvé par
    // la géométrie non plus, le contrôleur ne pose rien : ne rien savoir ne doit jamais faire
    // pire que ce qui existait, et poser le retrait au jugé effacerait le padding propre d'un
    // champ qu'on n'a pas regardé.
    setFramedContainer(null);
    controller.attach();
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(false);
    controller.dispose();
  });

  it('pare le conteneur que l’adaptateur NOMME, même s’il n’est pas le parent direct du champ', () => {
    const { controller, textarea, host, setFramedContainer } = setup();
    // Le châssis peut être un ancêtre ÉLOIGNÉ : la zone de saisie est parfois nichée sous un
    // wrapper intermédiaire (ici `host`, qui reste le parent direct où s'insère la barre
    // d'outils) distinct du cadre à parer — en-tête et onglets natifs sont au niveau du cadre,
    // pas à celui du wrapper. Le contrôleur suit l'adaptateur sans réinterpréter sa réponse.
    const frame = document.createElement('div');
    host.replaceWith(frame);
    frame.appendChild(host);
    setFramedContainer(frame);
    controller.attach();
    expect(frame.classList.contains('cct-host')).toBe(true);
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
    expect(frame.classList.contains('cct-host')).toBe(false);
  });

  it('§5.3 : rend une pastille et les diagnostics sous la zone', async () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const pastille = host.querySelector('.cct-pastille');
    expect(pastille?.getAttribute('data-state')).toBe('non-compliant');
    expect(host.querySelector('.cct-diagnostics li[data-code="E-NO-LABEL"]')).not.toBeNull();
    controller.dispose();
  });

  it('§5.4 : bouton marqué aria-disabled (jamais l’attribut natif disabled), clic intercepté', async () => {
    const { controller, textarea, submit } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(submit.hasAttribute('disabled')).toBe(false); // CA-12 : reste atteignable au clavier
    let clicked = false;
    submit.addEventListener('click', () => (clicked = true));
    submit.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    expect(clicked).toBe(false); // interception en capture
    controller.dispose();
  });

  it('CA-54 : un marqueur de session en double est signalé à la saisie, sans bloquer l’envoi sous `enforce`', async () => {
    const { controller, textarea, submit, host } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'note: un titre conforme\n\n[session:a]\n[session:b]');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const item = host.querySelector('.cct-diagnostics li[data-code="W-SESSION-MULTIPLE"]');
    expect(item?.textContent).toContain('2 marqueurs de session');
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    controller.dispose();
  });

  it('CA-01 : en enforce, un envoi non conforme est bloqué sans `activation.activatedAt`, quel que soit l’âge de la PR', async () => {
    // §5.4 amendé (décision du propriétaire, 2026-11-10) : le blocage ne dépend que du mode et
    // d'une configuration lue sans repli dégradé. Le périmètre d'activation d'un vérificateur
    // retiré le désarmait jusqu'ici — et, faute de date dans la configuration par défaut, il
    // le désarmait TOUJOURS : `enforce` ne bloquait rien.
    const ancient: PrRef = { ...pr, createdAt: '2001-01-01T00:00:00Z', number: 1 };
    const { controller, textarea, submit } = setup('enforce', { pr: ancient });
    expect('activation' in controller.config).toBe(false); // la clé n'existe même plus (§8.2)
    controller.attach();
    writeToTextField(textarea, 'pas de label ici'); // E-NO-LABEL
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));

    // Par le bouton…
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    let clicked = false;
    submit.addEventListener('click', () => (clicked = true));
    submit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicked).toBe(false);
    // …comme par le raccourci clavier.
    const key = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    controller.dispose();
  });

  it('§5.4 : un bouton RECRÉÉ par la page après attach() reste intercepté', async () => {
    // MESURÉ le 2026-11-09 sur la page Overview de GitHub : React remplace l'élément du bouton
    // *Comment* quand le champ se remplit. Un écouteur posé à attach() restait sur l'ancien, et
    // un commentaire non conforme se publiait d'un clic sous `enforce`.
    const { controller, textarea, replaceSubmit } = setup('enforce');
    controller.attach();
    const fresh = replaceSubmit();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(fresh.getAttribute('aria-disabled')).toBe('true');
    let clicked = false;
    fresh.addEventListener('click', () => (clicked = true));
    const notCanceled = fresh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicked).toBe(false);
    expect(notCanceled).toBe(false);
    controller.dispose();
  });

  it('revue Codex, PR #39 : updateResolved() applique une configuration nouvelle à un éditeur déjà attaché, sans le réattacher', async () => {
    const { controller, textarea, submit } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true'); // bloqué sous la config initiale

    // La configuration change PENDANT que l'éditeur reste ouvert (assouplissement du mode,
    // §8.1.3, ligne « Élargissant ») — un scénario que seul `updateResolved()` peut refléter :
    // `deps.resolved`, capturé une fois pour toutes à `attach()`, ne se relit jamais tout seul.
    const offConfig = defaultConfig();
    offConfig.mode = 'off';
    controller.updateResolved({ config: offConfig, notices: [], degraded: false, degradedReason: null });

    // Sans le correctif, ce même éditeur continuerait de bloquer sur la configuration
    // périmée jusqu'à sa fermeture/réouverture ou au rechargement de la page.
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    controller.dispose();
  });

  it('revue Codex, PR #39 : dispose() retire le grisage qu’il a lui-même posé, et annule la validation en attente', async () => {
    const { controller, textarea, submit } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici'); // diagnostic bloquant, débattu à 150 ms
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true');

    // `dispose()` défait la barre d'outils, la saisie rapide et les écouteurs — mais AVANT
    // ce correctif, ne touchait pas à `aria-disabled`, posé par `refresh()` sur un élément
    // de la PLATEFORME (`getSubmitControls()`), pas par `attach()` lui-même : un éditeur
    // disposé pendant qu'un diagnostic bloquant est affiché (passage en direct à `off`, §7)
    // laissait donc son bouton grisé indéfiniment, alors que l'extension venait de se
    // déclarer entièrement inactive.
    controller.dispose();

    expect(submit.hasAttribute('aria-disabled')).toBe(false);
  });

  it('revue Codex, PR #39 : dispose() annule aussi un `refresh()` de validation débattue déjà programmé', async () => {
    const { controller, textarea, submit } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici'); // programme un refresh() à VALIDATION_DEBOUNCE_MS
    // Disposé PENDANT la fenêtre de débat, avant que ce refresh() ne s'exécute : sans
    // l'annulation du timer, il grisait le bouton APRÈS `dispose()`, sur un contrôleur que
    // plus rien ne doit toucher — un aria-disabled qui survivrait à la révocation.
    controller.dispose();
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));

    expect(submit.hasAttribute('aria-disabled')).toBe(false);
  });

  it('revue Codex, PR #39 : le grisage préserve un `aria-disabled` NATIF déjà posé par la plateforme', async () => {
    const { controller, textarea, submit } = setup('enforce');
    // La plateforme a DÉJÀ désactivé ce bouton pour sa propre raison (branche protégée,
    // permissions…), avant même que ce contrôleur n'existe.
    submit.setAttribute('aria-disabled', 'true');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici'); // diagnostic bloquant, débattu à 150 ms
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true'); // grisage du contrôleur, même valeur

    // Le diagnostic se résorbe : sans restauration de la valeur NATIVE, `refresh()`
    // retirerait purement et simplement l'attribut, rendant accessible un bouton que la
    // plateforme avait natvement désactivé (revue Codex, PR #39).
    writeToTextField(textarea, 'issue: le nom est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true'); // restauré, jamais retiré

    controller.dispose();
  });

  it('revue Codex, PR #39 : dispose() restaure un `aria-disabled` NATIF plutôt que de le retirer', async () => {
    const { controller, textarea, submit } = setup('enforce');
    submit.setAttribute('aria-disabled', 'true'); // natif, préexistant à ce contrôleur
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.getAttribute('aria-disabled')).toBe('true');

    controller.dispose();

    // Un simple retrait rendrait accessible un bouton que la plateforme avait natvement
    // désactivé pour une raison qui n'a rien à voir avec ce contrôleur.
    expect(submit.getAttribute('aria-disabled')).toBe('true');
  });

  it('revue Codex, PR #39 : `initialCountedCodes` évite de recompter un diagnostic jamais disparu', async () => {
    const telemetryCalls: string[] = [];
    const telemetry = (event: TelemetryEvent) => {
      if (event.kind === 'validation-code') telemetryCalls.push(event.code);
      return true;
    };

    const { controller: controller1, textarea: textarea1 } = setup('enforce', { telemetry });
    controller1.attach();
    writeToTextField(textarea1, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(telemetryCalls.length).toBe(1); // comptage à l'apparition

    const snapshot = controller1.snapshotCountedCodes();
    controller1.dispose();

    // Reconstruction (revue Codex, PR #39) : `bootstrap()` en refait une à chaque
    // changement de configuration qui touche au rendu — langue, style de badge, TTL, état
    // dégradé — MÊME quand le diagnostic affiché, lui, ne change pas du tout. Sans reprise
    // de `#countedCodes`, le nouveau contrôleur recompterait ce diagnostic pourtant jamais
    // disparu, gonflant la télémétrie à chaque rebuild plutôt qu'à chaque apparition réelle.
    // Le texte porte DÉJÀ le diagnostic à l'attachement — comme dans `bootstrap()`, où le
    // même éditeur, avec son contenu déjà saisi, est reconstruit sur place (`reconcile()`) :
    // `attach()` y relit tout de suite le diagnostic toujours présent, jamais un textarea
    // vide qui l'aurait fait disparaître avant même la première validation.
    const { controller: controller2, textarea: textarea2 } = setup('enforce', {
      telemetry,
      initialCountedCodes: snapshot,
    });
    textarea2.value = 'pas de label ici';
    controller2.attach();
    expect(telemetryCalls.length).toBe(1); // toujours un seul comptage au total


    controller2.dispose();
  });

  it('§5.4 : Ctrl+Entrée intercepté quand le commentaire est en erreur (§4.3)', async () => {
    const { controller, textarea } = setup('enforce');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    controller.dispose();
  });

  describe('§5.4 : le garde n’arrête QUE les touches que la plateforme déclare (`submitKeystrokes`, 2026-11-10)', () => {
    // Le faux bouton agit sur la TOUCHE, sans émettre de `click` : c'est ce que fait le bouton
    // *Comment* d'Azure DevOps (Entrée, Ctrl+Entrée et Espace, mesurés par une sonde qui
    // bloquait la publication). Ce qui se teste ici est le CONTRAT : le garde partagé arrête ce
    // que l'adaptateur déclare, et rien de ce qu'il ne déclare pas.
    const AZDO_LIKE: SubmitKeystrokes = {
      field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' }],
      control: [
        { key: 'Enter', modifiers: 'any' },
        { key: ' ', modifiers: 'any' },
      ],
    };

    function buttonPublishesOnKeys(submit: HTMLButtonElement): string[] {
      const published: string[] = [];
      for (const type of ['keydown', 'keyup'] as const) {
        submit.addEventListener(type, (e) => {
          const key = (e as KeyboardEvent).key;
          if (key === 'Enter' || key === ' ') published.push(`${type}:${key}`);
        });
      }
      return published;
    }

    async function nonCompliant(keystrokes: SubmitKeystrokes) {
      const s = setup('enforce', { keystrokes });
      s.controller.attach();
      writeToTextField(s.textarea, 'pas de label ici');
      await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
      return s;
    }

    it.each([
      ['Entrée', { key: 'Enter' }],
      ['Ctrl+Entrée', { key: 'Enter', ctrlKey: true }],
      ['Espace', { key: ' ' }],
    ])('touches déclarées sur le bouton — %s, commentaire en erreur : rien n’atteint le bouton', async (_name, init) => {
      const { controller, submit } = await nonCompliant(AZDO_LIKE);
      const published = buttonPublishesOnKeys(submit);
      for (const type of ['keydown', 'keyup']) {
        const event = new KeyboardEvent(type, { ...init, bubbles: true, cancelable: true });
        submit.dispatchEvent(event);
        expect(event.defaultPrevented, type).toBe(true);
      }
      expect(published).toEqual([]);
      controller.dispose();
    });

    it('une plateforme qui ne déclare RIEN sur ses boutons n’est pas touchée par celles qui déclarent', async () => {
      // Le cas de GitHub et de GitLab : leurs boutons émettent un `click`, arrêté par l'autre
      // garde. La touche elle-même n'est jamais interceptée — la règle d'Azure DevOps ne fuit pas.
      const { controller, submit } = await nonCompliant({ field: AZDO_LIKE.field, control: [] });
      const published = buttonPublishesOnKeys(submit);
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      submit.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(published).toEqual(['keydown:Enter']);
      controller.dispose();
    });

    it('aucune touche n’est écrite dans le garde : un champ qui ne déclare rien laisse passer Ctrl+Entrée', async () => {
      const { controller, textarea } = await nonCompliant({ field: [], control: [] });
      const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      controller.dispose();
    });

    it('une touche propre à une plateforme est arrêtée au champ dès qu’elle est déclarée', async () => {
      const { controller, textarea } = await nonCompliant({ field: [{ key: 'Enter', modifiers: 'any' }], control: [] });
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      controller.dispose();
    });

    it('commentaire conforme : la touche déclarée passe, le bouton agit', async () => {
      const { controller, textarea, submit } = setup('enforce', { keystrokes: AZDO_LIKE });
      controller.attach();
      writeToTextField(textarea, 'issue (blocking): le nom de cette variable est ambigu\n\nIl désigne deux choses.');
      await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
      const published = buttonPublishesOnKeys(submit);
      submit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(published).toEqual(['keydown:Enter']);
      controller.dispose();
    });

    it('une touche déclarée mais visant autre chose qu’un bouton d’envoi n’est jamais arrêtée', async () => {
      const { controller, host } = await nonCompliant(AZDO_LIKE);
      const other = document.createElement('button');
      host.appendChild(other);
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      other.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      controller.dispose();
    });
  });

  it('CA-02 : clic sur un label insère le préfixe et conserve le texte', async () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    writeToTextField(textarea, 'le nom est ambigu');
    const issueButton = [...host.querySelectorAll('.cct-label-button')].find(
      (b) => b.getAttribute('data-label') === 'issue'
    ) as HTMLButtonElement;
    issueButton.click();
    expect(textarea.value).toBe('issue: le nom est ambigu');
    controller.dispose();
  });

  it('mode assist — et `warn`, son alias (§7) : diagnostics affichés, jamais de blocage (CA-09)', async () => {
    // `warn` n'est plus un mode : une configuration qui l'écrit est résolue `assist` (§7).
    const fromWarn = resolveConfig(null, { status: 'absent' }, { status: 'found', text: '{"mode": "warn"}' });
    expect(fromWarn.config.mode).toBe('assist');
    for (const resolved of [
      undefined, // `setup('assist')` : les défauts au mode assist
      { config: fromWarn.config, notices: fromWarn.notices, degraded: false, degradedReason: null },
    ]) {
      const { controller, textarea, submit, host } = setup('assist', resolved ? { resolved } : {});
      controller.attach();
      writeToTextField(textarea, 'pas de label ici');
      await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
      expect(host.querySelector('.cct-diagnostics li[data-code="E-NO-LABEL"]')).not.toBeNull();
      expect(submit.hasAttribute('aria-disabled')).toBe(false);
      let clicked = false;
      submit.addEventListener('click', () => (clicked = true));
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(clicked).toBe(true);
      controller.dispose();
      host.remove();
    }
  });

  it('correction en un clic : réécrit la ligne de préfixe (§5.3)', async () => {
    const { controller, textarea, host } = setup();
    controller.attach();
    writeToTextField(textarea, 'Issue: le nom est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const fix = host.querySelector('.cct-fix') as HTMLButtonElement;
    expect(fix).not.toBeNull();
    fix.click();
    expect(textarea.value).toBe('issue: le nom est ambigu');
    controller.dispose();
  });
});

describe('§5.3 + §8.1.2 — le message d’un diagnostic suit la langue RÉSOLUE', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  /** Le texte du diagnostic affiché, code et bouton de correction retirés. */
  function messageIn(host: HTMLElement, code: string): string {
    const li = host.querySelector(`.cct-diagnostics li[data-code="${code}"] span`);
    return li?.textContent ?? '';
  }

  it('sans clé `language` au dépôt, la préférence locale décide — pastille ET message', async () => {
    // Le cas ordinaire, et celui qui était faux : `defaultConfig()` laisse `language` à
    // `null`, la personne choisit « français » dans la page d'options, et TOUT ce que
    // l'extension écrit elle-même passait bien en français — la pastille, le bouton
    // « Corriger » — pendant que le seul texte venu de `core/`, le message du diagnostic,
    // restait en anglais. `analyze()` le choisit sur `config.language`, et c'est la clé du
    // dépôt qui y arrivait, jamais la langue résolue au §8.1.2.
    const { controller, textarea, host } = setup('warn', { lang: 'fr', configLanguage: null });
    controller.attach();
    writeToTextField(textarea, 'issue (blocking): le nom de cette variable est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(host.querySelector('.cct-pastille')?.textContent).toContain('Conforme, avec avertissements');
    expect(messageIn(host, 'W-NO-DISCUSSION')).toBe(
      'W-NO-DISCUSSION — Ce commentaire est bloquant mais ne comporte aucune discussion : expliquez pourquoi le point doit être traité.'
    );
    controller.dispose();
  });

  it('la préférence locale PRIME sur la clé `language` du dépôt, dans les deux sens (§8.1.2)', async () => {
    // Substituer la langue résolue ne doit pas revenir à imposer une langue : le §8.1.2 est
    // un ORDRE de priorité, et un dépôt en `"language": "fr"` doit rendre l'anglais à qui a
    // choisi « english » dans ses options — sans quoi le correctif troquerait un défaut
    // contre son symétrique.
    const en = setup('warn', { lang: 'en', configLanguage: 'fr' });
    en.controller.attach();
    writeToTextField(en.textarea, 'issue (blocking): le nom de cette variable est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(messageIn(en.host, 'W-NO-DISCUSSION')).toContain('This comment is blocking but has no discussion');
    en.controller.dispose();

    // Et le dépôt reste la source quand personne n'a de préférence locale : `resolveUiLanguage()`
    // rend alors la clé elle-même, donc `localizedConfig()` ne substitue rien.
    const fr = setup('warn', { lang: 'fr', configLanguage: 'fr' });
    fr.controller.attach();
    writeToTextField(fr.textarea, 'issue (blocking): le nom de cette variable est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(messageIn(fr.host, 'W-NO-DISCUSSION')).toContain('Ce commentaire est bloquant');
    fr.controller.dispose();
  });

  it('ce qui n’est PAS traduit : le code du diagnostic, et les identifiants de labels qu’il cite', async () => {
    // §10 : « les identifiants de labels restent en anglais ». Un message français cite donc
    // `issue`, `praise`, `nitpick`… tels quels, et le code du §3.5.1 reste `E-UNKNOWN-LABEL` —
    // ce sont des identifiants, pas de la prose. Traduire l'un ou l'autre rendrait le retour de
    // l'extension incomparable à celui du check (§6.3.1), qui les écrit dans la langue du dépôt.
    const { controller, textarea, host } = setup('warn', { lang: 'fr', configLanguage: null });
    controller.attach();
    writeToTextField(textarea, 'probleme: le nom de cette variable est ambigu');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    const li = host.querySelector('.cct-diagnostics li');
    expect(li?.getAttribute('data-code')).toBe('E-UNKNOWN-LABEL'); // le code, jamais traduit
    const message = messageIn(host, 'E-UNKNOWN-LABEL');
    expect(message).toContain('Label inconnu'); // la prose, elle, l'est
    for (const id of ['praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question']) {
      expect(message).toContain(id);
    }
    controller.dispose();
  });
});

describe('§8.1.3 règle 3 — relire la configuration avant de bloquer un envoi (second geste)', () => {
  const ORG_URL = 'https://interne.example/cc/organisation.json';

  /** Un résolveur RÉEL, dont la lecture d'organisation vient d'un texte que le test change
   * « côté plateforme », sans rien notifier à l'extension. Le plancher désigne le document
   * d'organisation (§8.1.1) ; le fichier de dépôt est absent. */
  function orgBacked(initialOrg: object) {
    let orgText = JSON.stringify(initialOrg);
    const reads: { bypassCache: boolean }[] = [];
    const adapter = {
      getRepoConfig: async () => ({ status: 'absent' as const }),
      getOrgConfig: async (_url: string | null, o?: { bypassCache: boolean }) => {
        reads.push({ bypassCache: o?.bypassCache === true });
        return { status: 'found' as const, text: orgText };
      },
    } as unknown as PlatformAdapter;
    const resolver = new ClientConfigResolver(async () => ({ floorVersion: 1, configUrl: ORG_URL }));
    return {
      reads,
      setOrg: (doc: object) => {
        orgText = JSON.stringify(doc);
      },
      resolve: () => resolver.resolve(adapter, pr),
      reread: () => resolver.resolve(adapter, pr, { bypassCache: true }),
    };
  }

  async function attachWith(
    resolved: ResolvedClientConfig,
    rereadConfig: () => Promise<ResolvedClientConfig>,
    body: string,
    keystrokes?: SubmitKeystrokes
  ) {
    const s = setup('enforce', { resolved, rereadConfig, ...(keystrokes ? { keystrokes } : {}) });
    s.controller.attach();
    writeToTextField(s.textarea, body);
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    return s;
  }

  function click(el: Element): { clicked: boolean; prevented: boolean } {
    let clicked = false;
    const listener = () => (clicked = true);
    el.addEventListener('click', listener);
    const notCanceled = el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    el.removeEventListener('click', listener);
    return { clicked, prevented: !notCanceled };
  }

  const flushReread = () => new Promise((r) => setTimeout(r, 0));

  it('CA-27 : organisation en cache en enforce, passée à assist sans notification — l’envoi est retenu, la configuration relue, le contrôle libéré avec un message', async () => {
    const org = orgBacked({ mode: 'enforce' });
    const cached = await org.resolve(); // la configuration EN CACHE : enforce
    expect(cached.config.mode).toBe('enforce');
    org.setOrg({ mode: 'assist' }); // assoupli côté plateforme, rien n'est notifié

    const { controller, textarea, submit, host } = await attachWith(cached, org.reread, 'pas de label ici');
    expect(submit.getAttribute('aria-disabled')).toBe('true'); // l'affichage suit encore le cache

    // La tentative d'envoi est RETENUE : jamais publiée sur une configuration non relue.
    const first = click(submit);
    expect(first.prevented).toBe(true);
    expect(first.clicked).toBe(false);
    await flushReread();

    // Relue sans cache (§8.1.3, règle 3), elle est en assist : le contrôle est libéré, et un
    // message invite à renvoyer — l'extension ne rejoue rien elle-même.
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    expect(host.querySelector('.cct-released')?.textContent).toContain('Renvoyez');
    expect(org.reads.at(-1)).toEqual({ bypassCache: true });
    expect(host.querySelector('.cct-live')?.textContent).toContain('Renvoyez');

    // Le second geste passe : plus aucun blocage, ni au clic ni au clavier.
    const second = click(submit);
    expect(second.prevented).toBe(false);
    expect(second.clicked).toBe(true);
    const key = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    controller.dispose();
  });

  it('CA-27 contre-épreuve : configuration inchangée — après la relecture, l’envoi reste bloqué', async () => {
    const org = orgBacked({ mode: 'enforce' });
    const cached = await org.resolve();
    const { controller, submit, host } = await attachWith(cached, org.reread, 'pas de label ici');

    expect(click(submit).prevented).toBe(true);
    await flushReread();

    expect(org.reads.at(-1)).toEqual({ bypassCache: true }); // relue, et toujours enforce
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('.cct-released')).toBeNull();
    expect(host.querySelector('.cct-live')?.textContent).toContain('Envoi bloqué');
    expect(click(submit).prevented).toBe(true); // toujours retenu
    await flushReread();
    controller.dispose();
  });

  it('CA-33 : un label ajouté par l’organisation est accepté dès la première saisie qu’il aurait fallu bloquer', async () => {
    const org = orgBacked({ mode: 'enforce' });
    const cached = await org.resolve();
    org.setOrg({ mode: 'enforce', labels: [{ id: 'kudos', enabled: true, blockingByDefault: false }] });

    // `kudos:` est inconnu de la configuration en cache : E-UNKNOWN-LABEL, donc bloqué.
    const { controller, submit, host } = await attachWith(cached, org.reread, 'kudos: joli découpage du module');
    expect(host.querySelector('.cct-diagnostics li[data-code="E-UNKNOWN-LABEL"]')).not.toBeNull();
    expect(submit.getAttribute('aria-disabled')).toBe('true');

    expect(click(submit).prevented).toBe(true);
    await flushReread();

    // Relue, l'organisation déclare `kudos` : plus aucune erreur, le contrôle est libéré —
    // sans attendre l'expiration du cache (3600 s par défaut).
    expect(host.querySelector('.cct-diagnostics li[data-code="E-UNKNOWN-LABEL"]')).toBeNull();
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    expect(host.querySelector('.cct-released')).not.toBeNull();
    // Et le cache a été réécrit : la résolution ordinaire suivante voit déjà le label.
    expect((await org.resolve()).config.labels.some((l) => l.id === 'kudos')).toBe(true);
    controller.dispose();
  });

  /** Une relecture que le test fait aboutir QUAND il le veut — entre l'appui et le relâchement. */
  function deferredReread() {
    let release: ((r: ResolvedClientConfig) => void) | null = null;
    const enforce = defaultConfig();
    enforce.mode = 'enforce';
    const cached: ResolvedClientConfig = { config: enforce, notices: [], degraded: false, degradedReason: null };
    const assist = defaultConfig();
    assist.mode = 'assist';
    return {
      cached,
      reread: () =>
        new Promise<ResolvedClientConfig>((resolve) => {
          release = resolve;
        }),
      releaseAssist: async () => {
        release!({ config: assist, notices: [], degraded: false, degradedReason: null });
        await flushReread();
      },
    };
  }

  const key = (type: string, init: KeyboardEventInit) =>
    new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });

  it('CA-27, au clavier sur le bouton : la relecture qui libère entre l’appui et le relâchement ne laisse passer ni le relâchement ni son clic — seul un nouveau geste passe', async () => {
    const r = deferredReread();
    const keystrokes: SubmitKeystrokes = {
      field: [{ key: 'Enter', modifiers: 'ctrl-or-meta' }],
      control: [{ key: ' ', modifiers: 'any' }],
    };
    const { controller, submit } = await attachWith(r.cached, r.reread, 'pas de label ici', keystrokes);

    const down = key('keydown', { key: ' ' });
    submit.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); // geste retenu, relecture lancée
    await r.releaseAssist(); // la relecture aboutit AVANT le relâchement
    expect(submit.hasAttribute('aria-disabled')).toBe(false); // le contrôle est libéré…

    // …mais le relâchement et le clic du PREMIER geste restent retenus.
    const up = key('keyup', { key: ' ' });
    submit.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(click(submit).prevented).toBe(true);

    // Un NOUVEAU geste passe, de bout en bout.
    const down2 = key('keydown', { key: ' ' });
    submit.dispatchEvent(down2);
    expect(down2.defaultPrevented).toBe(false);
    const up2 = key('keyup', { key: ' ' });
    submit.dispatchEvent(up2);
    expect(up2.defaultPrevented).toBe(false);
    expect(click(submit).prevented).toBe(false);
    controller.dispose();
  });

  it('CA-27, au clavier depuis le champ : le relâchement d’Entrée du premier geste reste retenu, même Ctrl déjà relâché', async () => {
    const r = deferredReread();
    const { controller, textarea } = await attachWith(r.cached, r.reread, 'pas de label ici');

    const down = key('keydown', { key: 'Enter', ctrlKey: true });
    textarea.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await r.releaseAssist();

    // Ctrl relâché d'abord : le `keyup` d'Entrée ne porte plus `ctrlKey`, il reste du même geste.
    const up = key('keyup', { key: 'Enter' });
    textarea.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);

    const down2 = key('keydown', { key: 'Enter', ctrlKey: true });
    textarea.dispatchEvent(down2);
    expect(down2.defaultPrevented).toBe(false);
    controller.dispose();
  });

  it('une seule relecture en vol par éditeur : les tentatives suivantes restent retenues sans en lancer d’autre', async () => {
    let calls = 0;
    let release: ((r: ResolvedClientConfig) => void) | null = null;
    const enforce = defaultConfig();
    enforce.mode = 'enforce';
    const cached: ResolvedClientConfig = { config: enforce, notices: [], degraded: false, degradedReason: null };
    const reread = () => {
      calls++;
      return new Promise<ResolvedClientConfig>((resolve) => {
        release = resolve;
      });
    };
    const { controller, textarea, submit, host } = await attachWith(cached, reread, 'pas de label ici');

    expect(click(submit).prevented).toBe(true);
    expect(click(submit).prevented).toBe(true); // retenu pendant la relecture
    const key = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(calls).toBe(1);

    const assist = defaultConfig();
    assist.mode = 'assist';
    release!({ config: assist, notices: [], degraded: false, degradedReason: null });
    await flushReread();
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    expect(host.querySelector('.cct-released')).not.toBeNull();
    controller.dispose();
  });

  it('aucune relecture à la frappe : seule une tentative d’envoi la déclenche', async () => {
    let calls = 0;
    const enforce = defaultConfig();
    enforce.mode = 'enforce';
    const cached: ResolvedClientConfig = { config: enforce, notices: [], degraded: false, degradedReason: null };
    const { controller, textarea } = await attachWith(
      cached,
      async () => {
        calls++;
        return cached;
      },
      'pas de label ici'
    );

    for (const text of ['pas de label', 'toujours pas', 'issue: enfin un label']) {
      writeToTextField(textarea, text);
      await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    }
    expect(calls).toBe(0);
    controller.dispose();
  });
});
