// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';
import { writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';
import type { TelemetryEvent } from '../src/telemetry.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function setup(
  mode: 'enforce' | 'warn' = 'enforce',
  opts: {
    telemetry?: (event: TelemetryEvent) => boolean;
    initialCountedCodes?: ReadonlySet<string>;
    /** Langue RÉSOLUE au §8.1.2 — celle que `resolveUiLanguage()` rend au contrôleur. */
    lang?: string;
    /** Clé `language` du document de configuration (§8.2) — `null` par défaut, comme
     * `defaultConfig()` : c'est le cas ordinaire, celui où seule la préférence locale parle. */
    configLanguage?: string | null;
  } = {}
) {
  const host = document.createElement('div');
  const textarea = document.createElement('textarea');
  // Génération React du CommentBox GitHub (cf. selectors.ts, `class*="CommentBox"`) : c'est
  // le cas par défaut que la plupart des tests exercent ; voir plus bas pour le cas où cette
  // classe est absente (DOM hérité, Azure DevOps).
  textarea.className = 'CommentBox-input';
  const submit = document.createElement('button');
  submit.type = 'submit';
  host.append(textarea, submit);
  document.body.appendChild(host);

  const editor: EditorHandle = {
    id: 'e1',
    element: textarea,
    context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
  };

  const adapter: Partial<PlatformAdapter> = {
    platformProfile: () => ({ id: 'github', suggestionInfoString: 'suggestion' }),
    getSubmitControls: (): SubmitControl[] => [{ element: submit, kind: 'submit' }],
    readValue: () => textarea.value,
    writeValue: (_e, text, caret) => writeToTextField(textarea, text, caret),
  };

  const config = defaultConfig();
  config.mode = mode;
  config.activation.activatedAt = '2026-09-01T00:00:00Z';
  config.language = opts.configLanguage ?? null;

  const controller = new EditorController({
    adapter: adapter as PlatformAdapter,
    editor,
    resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
    published: null,
    lang: opts.lang ?? 'fr',
    currentUserLogin: 'alice',
    telemetry: opts.telemetry,
    initialCountedCodes: opts.initialCountedCodes,
  });
  return { controller, textarea, submit, host };
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
    expect(toolbar!.querySelectorAll('.cct-label-button')).toHaveLength(10);
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

  it('ne pose pas le retrait hors du CommentBox GitHub moderne (DOM hérité, Azure DevOps)', () => {
    const { controller, textarea, host } = setup();
    // Aucun conteneur borderless ni padding propre à neutraliser sur ces éditeurs (§ci-dessus
    // dans editor-controller.ts) : la zone de saisie porte sa propre bordure et son propre
    // padding, que ce retrait effacerait à tort.
    textarea.className = 'comment-textarea';
    controller.attach();
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(false);
    controller.dispose();
  });

  it('pose le retrait sur le composeur React reconnu par data-testid, sans classe CommentBox', () => {
    const { controller, textarea, host } = setup();
    // Second sélecteur candidat de la même génération React dans selectors.ts
    // (`div[data-testid*="comment-composer"] textarea`) : le composeur, et non la classe
    // du textarea, porte l'indice de reconnaissance.
    textarea.className = '';
    host.setAttribute('data-testid', 'comment-composer-foo');
    controller.attach();
    expect(host.classList.contains('cct-host')).toBe(true);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
  });

  it('pose le retrait sur le composeur lui-même, pas sur un wrapper intermédiaire, quand la zone de saisie y est nichée', () => {
    const { controller, textarea, host } = setup();
    // Le sélecteur `div[data-testid*="comment-composer"] textarea` est un sélecteur
    // descendant : la zone de saisie peut être nichée sous un wrapper intermédiaire (ici
    // `host`, qui reste le parent direct utilisé pour insérer la barre d'outils) distinct
    // du composeur qui doit recevoir le retrait — en-tête et onglets natifs sont à son
    // niveau, pas à celui du wrapper.
    textarea.className = '';
    const composer = document.createElement('div');
    composer.setAttribute('data-testid', 'comment-composer-foo');
    host.replaceWith(composer);
    composer.appendChild(host);
    controller.attach();
    expect(composer.classList.contains('cct-host')).toBe(true);
    expect(host.classList.contains('cct-host')).toBe(false);
    expect(textarea.classList.contains('cct-editor')).toBe(true);
    controller.dispose();
    expect(composer.classList.contains('cct-host')).toBe(false);
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
    offConfig.activation.activatedAt = '2026-09-01T00:00:00Z';
    controller.updateResolved({ config: offConfig, notices: [], fingerprint: 'cccc3333', degraded: false }, null);

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

  it('mode warn : diagnostics affichés, jamais de blocage (CA-09)', async () => {
    const { controller, textarea, submit } = setup('warn');
    controller.attach();
    writeToTextField(textarea, 'pas de label ici');
    await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 50));
    expect(submit.hasAttribute('aria-disabled')).toBe(false);
    controller.dispose();
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
