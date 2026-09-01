// @vitest-environment happy-dom
//
// LA BARRE D'OUTILS PAR LE GESTE (§5.1) — et non par ses fonctions.
//
// Les quatre défauts que ce fichier verrouille ont été trouvés par un utilisateur, pas par
// la suite, et ils avaient tous la même forme : invisibles à un test qui appelle
// `insertPrefix()` ou `computePrefixInsertion()` directement, évidents à un test qui
// CLIQUE. Le segment « aucune » n'effaçait rien ; le sélecteur entier était inerte sur un
// commentaire déjà labellisé ; le radiogroup affichait « aucune » sur un commentaire
// décoré ; le champ libre perdait en silence ce qu'on venait d'y taper dès qu'on en
// sortait.
//
// Un test par API aurait pu passer sur les quatre : chacun appelle la fonction avec les
// arguments que la barre, elle, n'envoyait justement pas. C'est le même angle mort que la
// revue de la PR #31 avait nommé pour la télémétrie — les tests y étaient rangés par
// contrat de module, jamais par ce qui arrive à un onglet. Ici : jamais par ce que fait
// une personne devant l'éditeur.

import { describe, expect, it, beforeEach } from 'vitest';
import { defaultConfig, type PrRef } from '@cct/core';
import { EditorController, VALIDATION_DEBOUNCE_MS } from '../src/editor-controller.js';
import { writeToTextField } from '@cct/adapter-shared';
import type { EditorHandle, PlatformAdapter, SubmitControl } from '@cct/adapter-shared';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

function setup(tweak: (config: ReturnType<typeof defaultConfig>) => void = () => {}) {
  const host = document.createElement('div');
  const textarea = document.createElement('textarea');
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
  config.mode = 'enforce';
  config.activation.activatedAt = '2026-09-01T00:00:00Z';
  tweak(config);

  const controller = new EditorController({
    adapter: adapter as PlatformAdapter,
    editor,
    resolved: { config, notices: [], fingerprint: 'aaaa1111', degraded: false },
    published: null,
    lang: 'fr',
    currentUserLogin: 'alice',
  });
  controller.attach();
  return { controller, textarea };
}

/** Les gestes, nommés comme la personne les ferait. */
const clickLabel = (id: string): void =>
  (document.querySelector(`.cct-label-button[data-label="${id}"]`) as HTMLElement).click();

/** Le sélecteur segmenté : `null` désigne le premier segment, « aucune ». */
function clickDecoration(id: string | null): void {
  const segments = [...document.querySelectorAll('.cct-decoration-segment')] as HTMLElement[];
  const target = id === null ? segments[0] : segments.find((s) => s.textContent === `(${id})`);
  expect(target, `segment ${id ?? 'aucune'} absent de la barre`).toBeDefined();
  target!.click();
}

const freeField = (): HTMLInputElement =>
  document.querySelector('.cct-free-decoration') as HTMLInputElement;

const checkedSegment = (): string | null =>
  document.querySelector('.cct-decoration-segment[aria-checked="true"]')?.textContent ?? null;

/** Écrire À LA MAIN, puis laisser la validation débattue passer : c'est ainsi qu'arrive un
 * commentaire que la barre n'a jamais vu poser. */
async function typeByHand(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  writeToTextField(textarea, value, value.length);
  await new Promise((r) => setTimeout(r, VALIDATION_DEBOUNCE_MS + 20));
}

describe('§5.1 — le sélecteur de décoration, au clic', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('« aucune » RETIRE la décoration écrite', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    clickDecoration('blocking');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');

    clickDecoration(null);
    expect(textarea.value).toBe('issue: le nom est ambigu');
  });

  it('changer de décoration remplace, sans empiler', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    clickDecoration('blocking');
    clickDecoration('non-blocking');
    expect(textarea.value).toBe('issue (non-blocking): le nom est ambigu');
  });

  // Le sélecteur n'agissait que sur un label CLIQUÉ dans la même session d'édition. Un
  // commentaire rouvert, tapé à la main ou posé par la complétion n'avait laissé aucun clic
  // derrière lui : toute la barre de décoration était alors sans effet, silencieusement.
  it('agit sur un commentaire déjà labellisé, qu’aucun clic n’a posé', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue: le nom est ambigu');

    clickDecoration('blocking');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');
  });

  // Et sans attendre : la barre se réaligne à la validation DÉBATTUE (150 ms), donc entre la
  // frappe et ce réalignement il existe une fenêtre où ce qu'elle a mémorisé est en retard
  // sur le texte. Quelqu'un qui tape vite y clique. C'est pour cette fenêtre-là que le clic
  // relit le texte au lieu de se fier à ce que la barre croit savoir — un test qui attend
  // toujours la validation ne peut pas l'exprimer.
  it('agit aussi AVANT la validation débattue, sur un texte plus récent que la barre', () => {
    const { textarea } = setup();
    writeToTextField(textarea, 'issue: le nom est ambigu', 24); // pas d'attente : refresh non encore passé

    clickDecoration('blocking');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');
  });

  // CA-02 doit tenir PAR LE GESTE, et pas seulement dans la fonction : c'est le clic sur un
  // label que le critère décrit.
  it('CA-02 : poser un autre label conserve la décoration écrite', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');

    clickLabel('todo');
    expect(textarea.value).toBe('todo (blocking): le nom est ambigu');
  });

  it('ce que la barre MONTRE est ce que le commentaire porte', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');
    expect(checkedSegment()).toBe('(blocking)');

    clickDecoration(null);
    expect(checkedSegment()).toBe('aucune');
    expect(textarea.value).toBe('issue: le nom est ambigu');
  });

  it('une décoration sans segment ne fait cocher AUCUN segment — surtout pas « aucune »', async () => {
    const { textarea } = setup();
    // `(perf)` est descriptive : elle n'a pas de segment, et prétendre « aucune » serait
    // affirmer qu'il n'y a pas de décoration alors qu'il y en a une.
    await typeByHand(textarea, 'issue (perf): le nom est ambigu');
    expect(checkedSegment()).toBeNull();
  });
});

describe('§5.1 — le champ de décoration libre', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('Tab pose la décoration au lieu de la perdre', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');

    const free = freeField();
    free.value = 'perf';
    free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(textarea.value).toBe('issue (perf): le nom est ambigu');
    expect(free.value).toBe('');
  });

  it('quitter le champ la pose aussi — cliquer ailleurs n’efface plus le travail', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');

    const free = freeField();
    free.value = 'ux';
    free.dispatchEvent(new Event('blur', { bubbles: false }));
    expect(textarea.value).toBe('issue (ux): le nom est ambigu');
  });

  it('Tab ne bloque pas le déplacement du focus (§5.1, CA-12)', () => {
    setup();
    const free = freeField();
    free.value = 'perf';
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    free.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  // §3.3 : la forme d'une décoration est structurelle, indépendante de `allowFree`. Sur
  // Entrée, poser « perf critique » était une faute délibérée ; sur une perte de focus, ce
  // serait un accident — d'où un champ qui GARDE ce qu'il ne peut pas poser.
  it('une forme illégale n’est ni posée ni jetée : elle reste, signalée', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    const before = textarea.value;

    const free = freeField();
    free.value = 'perf critique';
    free.dispatchEvent(new Event('blur', { bubbles: false }));
    expect(textarea.value).toBe(before);
    expect(free.value).toBe('perf critique');
    expect(free.getAttribute('aria-invalid')).toBe('true');

    // Et corriger la saisie lève le signalement.
    free.value = 'perf-critique';
    free.dispatchEvent(new Event('input', { bubbles: true }));
    expect(free.getAttribute('aria-invalid')).toBeNull();
  });

  it('un champ vide quitté ne pose rien', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickLabel('issue');
    const before = textarea.value;

    const free = freeField();
    free.dispatchEvent(new Event('blur', { bubbles: false }));
    expect(textarea.value).toBe(before);
  });
});

// ————— La FENÊTRE DE VALIDATION DÉBATTUE (150 ms) —————
// La barre se réaligne sur le texte à la validation, débattue à 150 ms. Entre une frappe et
// ce réalignement, tout ce qu'elle aurait mémorisé est en retard sur le commentaire — et
// quelqu'un qui tape vite, ou qui colle, clique dans cet intervalle. Trois des quatre
// trouvailles de la revue vivaient là (revue Codex, PR #35), une par geste : le premier
// correctif ne faisait relire le texte QU'AU segment de décoration.
//
// Ces tests ne laissent donc jamais passer la validation avant de cliquer.
describe('§5.1 — les gestes dans la fenêtre de validation débattue', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('le second clic RETIRE, même si la barre n’a pas encore vu le label', () => {
    const { textarea } = setup();
    writeToTextField(textarea, 'issue: le nom est ambigu', 24); // pas d'attente

    clickLabel('issue');
    expect(textarea.value).toBe('le nom est ambigu');
  });

  it('le champ libre décore le label ÉCRIT, il ne le remplace pas', () => {
    const { textarea } = setup();
    writeToTextField(textarea, 'issue: le nom est ambigu', 24); // pas d'attente

    const free = freeField();
    free.value = 'perf';
    free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    // Sans la lecture au geste : `suggestion (perf): …` — une décoration réécrivait le label.
    expect(textarea.value).toBe('issue (perf): le nom est ambigu');
  });
});

// ————— Ce que la barre dit du COMMENTAIRE, dans les termes de la CONFIGURATION —————
describe('§3.2, §3.3 — alias, casse et décorations illégales', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  // §3.2 : un alias « hérite intégralement » de son label. Il n'a pas de bouton propre —
  // c'est celui du label canonique qui doit s'allumer.
  it('un ALIAS allume le bouton de son label canonique', async () => {
    // Les alias viennent de la CONFIGURATION (§8.2) : la configuration par défaut n'en
    // déclare aucun. Le premier jet de ce test tenait `bug` pour un alias d'`issue` parce
    // que la spécification l'emploie en exemple — un faux qui décrivait un produit qui
    // n'existe pas (CLAUDE.md, règle 2). Il est donc déclaré ici.
    const { textarea } = setup((config) => {
      config.labels.find((l) => l.id === 'issue')!.aliases = ['bug'];
    });
    await typeByHand(textarea, 'bug: le nom est ambigu');

    expect(document.querySelector('.cct-label-button[data-label="issue"]')!.getAttribute('aria-pressed')).toBe('true');
    // Et le geste suit : cliquer `issue` sur un commentaire écrit `bug:` le RETIRE.
    clickLabel('issue');
    expect(textarea.value).toBe('le nom est ambigu');
  });

  // La casse d'un id configuré est libre (§8.2) : la comparer telle quelle laissait le
  // bouton d'un label `Risk` éteint sur un commentaire qui le porte.
  it('un label configuré en casse mixte est reconnu', async () => {
    const { textarea } = setup((config) => {
      config.labels.push({
        ...config.labels[0]!,
        id: 'Risk',
        aliases: [],
        enabled: true,
      });
    });
    await typeByHand(textarea, 'risk: le nom est ambigu');

    expect(document.querySelector('.cct-label-button[data-label="Risk"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  // Des parenthèses vides sont une coquille (§3.4.2), pas une absence de décoration : le
  // validateur signale E-DECORATION-SYNTAX au même instant. Cocher « aucune » affirmerait
  // le contraire, à l'œil comme au lecteur d'écran.
  it('une décoration ILLÉGALE ne fait cocher aucun segment, « aucune » comprise', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (): le nom est ambigu');
    expect(checkedSegment()).toBeNull();

    await typeByHand(textarea, 'issue (perf critique): le nom est ambigu');
    expect(checkedSegment()).toBeNull();
  });
});

// ————— DES ENCHAÎNEMENTS, pas des gestes isolés —————
// Le round 2 de la revue a trouvé une régression qu'aucun test ne pouvait voir : deux de mes
// correctifs, chacun juste, se combinaient mal. Le `blur` du champ libre part AVANT le
// `click` d'un bouton, et le clic voyait alors posé le label que le blur venait de créer —
// il le retirait. Tous mes tests cliquaient un geste à la fois (revue Codex, PR #35).
describe('§5.1 — enchaînements de gestes', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('taper une décoration libre PUIS cliquer un label pose les deux', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';

    const free = freeField();
    free.value = 'perf';
    // L'ordre réel du navigateur : le champ perd le focus au profit du bouton, puis le clic.
    free.dispatchEvent(new FocusEvent('blur', { relatedTarget: document.querySelector('.cct-label-button[data-label="suggestion"]') }));
    clickLabel('suggestion');

    expect(textarea.value).toBe('suggestion (perf): le nom est ambigu');
    expect(free.value).toBe('');
  });

  // La sélection de la barre est une intention en attente ; sur un commentaire déjà
  // labellisé, c'est le TEXTE qui dit la décoration. `sync()` y recopiait ce que le texte
  // portait, si bien que changer de label après avoir effacé la décoration la restaurait.
  it('changer de label ne restaure pas une décoration qu’on vient d’effacer', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');
    // Effacer la décoration à la main, puis cliquer AVANT la validation débattue.
    writeToTextField(textarea, 'issue: le nom est ambigu', 24);

    clickLabel('todo');
    expect(textarea.value).toBe('todo: le nom est ambigu');
  });

  it('mais sur un commentaire SANS label, le segment choisi d’abord s’applique', () => {
    const { textarea } = setup();
    textarea.value = 'le nom est ambigu';
    clickDecoration('blocking'); // aucun label : rien ne bouge encore
    expect(textarea.value).toBe('le nom est ambigu');

    clickLabel('issue');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');
  });

  // Le test ci-dessus passait pour la MAUVAISE raison : rien ne revalidait entre les deux
  // clics. Or `sync()` recopiait le texte dans la sélection, donc la moindre revalidation —
  // taper le sujet, par exemple, ce que tout le monde fait entre les deux — effaçait le
  // choix et cochait « aucune » (revue Codex, PR #35).
  it('… même si l’on écrit le sujet entre les deux clics', async () => {
    const { textarea } = setup();
    clickDecoration('blocking');
    await typeByHand(textarea, 'le nom est ambigu'); // une validation complète s'intercale
    expect(checkedSegment()).toBe('(blocking)'); // la barre montre toujours le choix en attente

    clickLabel('issue');
    expect(textarea.value).toBe('issue (blocking): le nom est ambigu');
  });
});

describe('§3.2 — un geste de décoration ne réécrit pas l’orthographe du label', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  const withAlias = (config: ReturnType<typeof defaultConfig>) => {
    config.labels.find((l) => l.id === 'issue')!.aliases = ['bug'];
  };

  // « L'extension propose la réécriture vers la forme canonique […] sans l'imposer » (§3.2).
  // Décorer n'est pas l'occasion de l'imposer en douce.
  it('décorer `bug:` garde `bug:`', async () => {
    const { textarea } = setup(withAlias);
    await typeByHand(textarea, 'bug: le nom est ambigu');

    clickDecoration('blocking');
    expect(textarea.value).toBe('bug (blocking): le nom est ambigu');
  });

  it('le champ libre non plus', async () => {
    const { textarea } = setup(withAlias);
    await typeByHand(textarea, 'bug: le nom est ambigu');

    const free = freeField();
    free.value = 'perf';
    free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(textarea.value).toBe('bug (perf): le nom est ambigu');
  });
});

describe('§8.2 — la casse d’une décoration configurée', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  // Même défaut que pour les labels, laissé sur les décorations : `parseDecorations` rend
  // une forme canonique en minuscules, l'id configuré garde sa casse, et une comparaison
  // stricte ne les apparie jamais.
  it('un segment configuré `Blocking` se coche sur un commentaire qui le porte', async () => {
    const { textarea } = setup((config) => {
      const blocking = config.decorations.known.find((d) => d.id === 'blocking')!;
      blocking.id = 'Blocking';
    });
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');
    expect(checkedSegment()).toBe('(Blocking)');
  });
});

describe('§3.3 — ce que la barre ne peut PAS affirmer', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  // Règle 2 du §3.3 : deux porteuses aux effets opposés produisent `E-CONFLICT`, et `core/`
  // les ignore toutes les deux — « aucune règle de la première gagne n'est définie ». En
  // cocher une présentait un côté du conflit comme le choix actif.
  it('des décorations porteuses CONTRADICTOIRES ne font cocher aucun segment', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking, non-blocking): le nom est ambigu');
    expect(checkedSegment()).toBeNull();
  });

  // Deux porteuses au MÊME effet ne se contredisent pas (§3.3 : ce sont les effets opposés
  // qui font le conflit) : la barre peut alors dire ce qu'elle affiche.
  it('deux porteuses au même effet ne sont pas un conflit', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (non-blocking, if-minor): le nom est ambigu');
    expect(checkedSegment()).toBe('(non-blocking)');
  });
});

describe('§5.1 — effacer un label et décorer dans la foulée', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  // Le miroir du défaut du round précédent : `null` voulait dire « aucun label » ET « je ne
  // me prononce pas », et le second sens retombait sur une analyse en retard de 150 ms.
  it('valider une décoration après avoir effacé le préfixe ne le RECRÉE pas', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue: le nom est ambigu'); // analysé : le contrôleur connaît `issue`
    writeToTextField(textarea, 'le nom est ambigu', 17); // effacé, avant toute revalidation

    const free = freeField();
    free.value = 'perf';
    free.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    // `suggestion` est le repli d'un commentaire SANS label — pas `issue`, que la personne
    // vient précisément de retirer.
    expect(textarea.value).toBe('suggestion (perf): le nom est ambigu');
  });
});

describe('§5.1 — deux intentions contraires dans le même geste', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  // « Décore » et « retire » ne peuvent pas être le même clic. Décidée avant que la
  // décoration en attente soit lue, la bascule l'emportait : écrire `perf` puis cliquer le
  // label DÉJÀ actif retirait le préfixe et jetait la décoration — un geste qui ajoute en
  // enlevait deux (revue Codex, PR #35).
  it('écrire une décoration puis cliquer le label ACTIF décore, ne retire pas', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue: le nom est ambigu');

    const free = freeField();
    free.value = 'perf';
    // Le focus part vers le bouton : le champ s'abstient, c'est le clic qui pose.
    free.dispatchEvent(new FocusEvent('blur', { relatedTarget: document.querySelector('.cct-label-button[data-label="issue"]') }));
    clickLabel('issue');

    expect(textarea.value).toBe('issue (perf): le nom est ambigu');
  });

  // Et sans décoration en attente, la bascule reste la bascule.
  it('sans rien en attente, cliquer le label actif retire toujours', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue: le nom est ambigu');

    clickLabel('issue');
    expect(textarea.value).toBe('le nom est ambigu');
  });

  // La sélection de la barre est tantôt une INTENTION, tantôt un REFLET du texte. Sans
  // porter d'où elle vient, le reflet d'un commentaire dont le label a disparu se réinsérait
  // au clic suivant — la décoration effacée revenait (revue Codex, PR #35).
  it('la décoration LUE d’un label effacé ne revient pas', async () => {
    const { textarea } = setup();
    await typeByHand(textarea, 'issue (blocking): le nom est ambigu');
    expect(checkedSegment()).toBe('(blocking)');

    await typeByHand(textarea, 'le nom est ambigu'); // préfixe effacé, validation passée
    expect(checkedSegment()).toBe('aucune');

    clickLabel('todo');
    expect(textarea.value).toBe('todo: le nom est ambigu');
  });
});
