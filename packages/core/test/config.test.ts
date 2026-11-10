import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import { defaultConfig } from '../src/config/defaults.js';
import { hasNestedQuantifier } from '../src/config/schema.js';
import { MODE_SCALE, vetFloor, vettedConfigUrl } from '../src/config/floor.js';
import type { ConfigRead, Floor } from '../src/types.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });
const foundText = (t: string): ConfigRead => ({ status: 'found', text: t });

describe('§8.2 — valeurs par défaut du produit', () => {
  it('dix-neuf labels livrés, tous actifs sauf `quibble` — Conventional Comments, `decision` et les labels ajoutés — et les décorations du §3.3', () => {
    const c = defaultConfig();
    expect(c.labels).toHaveLength(19);
    // `quibble` est livré, pour rester fidèle à la liste de l'amont, mais désactivé : l'amont le
    // définit lui-même comme un `nitpick` sous un autre nom (§3.2).
    expect(c.labels.filter((l) => !l.enabled).map((l) => l.id)).toEqual(['quibble']);
    // L'ordre de la liste est l'ordre par défaut des boutons (§5.1) : la zone `reply` va du plus
    // conciliant au plus tranché. `summary` et `reviewed` sont ajoutés et n'ouvrent ni ne
    // répondent à aucun point : ils sont `status`, de la passe à la clôture. `decision` répond à
    // un point : il est `reply`.
    expect(c.labels.filter((l) => l.kind === 'reply').map((l) => l.id)).toEqual(['thanks', 'done', 'ack', 'decision', 'disagree']);
    expect(c.labels.filter((l) => l.kind === 'status').map((l) => l.id)).toEqual(['summary', 'reviewed']);
    expect(c.labels.filter((l) => l.blockingByDefault).map((l) => l.id).sort()).toEqual([
      'chore',
      'issue',
      'todo',
    ]);
    expect(c.labels.filter((l) => l.alwaysNonBlocking).map((l) => l.id).sort()).toEqual([
      'ack',
      'decision',
      'disagree',
      'done',
      'nitpick',
      'note',
      'reviewed',
      'summary',
      'thanks',
      'thought',
    ]);
    expect(c.mode).toBe('assist');
    expect(c.severities).toEqual({});
    expect(c.decorations.allowFree).toBe(true);
    expect(c.scope).toEqual({ validateReplies: false, validateReviewSummary: true });
    // Les clés du vérificateur retiré (§8.2, « Clés retirées ») n'existent plus.
    for (const key of ['formatSeverity', 'overrideLabel', 'resolverOverrideGroup', 'activation', 'docUrl']) {
      expect(key in c, key).toBe(false);
    }
  });

  it('abréviations : uniques au moment du Tab, ?que/?qui séparés (§5.2)', () => {
    const abbr = defaultConfig().shortcuts.abbreviations;
    const keys = Object.keys(abbr);
    expect(new Set(keys).size).toBe(keys.length);
    expect(abbr['?que']).toBe('question: ');
    expect(abbr['?qui']).toBe('quibble: ');
    // `?su` reste `suggestion` ; `summary` prend `?sum` (§5.2, CA-55).
    expect(abbr['?su']).toBe('suggestion: ');
    expect(abbr['?sum']).toBe('summary: ');
  });

  it('chaque label porte une icône et une couleur par défaut (issue #18) — sans elles, le rendu du §5.1/§5.5 reste monochrome sur tout dépôt sans configuration propre', () => {
    const c = defaultConfig();
    for (const l of c.labels) {
      expect(l.icon).toBeTruthy();
      expect(l.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // Treize teintes distinctes : la couleur existe pour reconnaître un label sans lire le
    // texte, un doublon irait à l'encontre de cet objectif.
    const colors = c.labels.map((l) => l.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  // Garde de contraste (issue #18, review PR #41) : un premier choix de palette satisfaisait
  // « forme hexadécimale + unicité » (test ci-dessus) tout en étant proche de l'invisible en
  // thème sombre — jusqu'à 1,23:1 pour une teinte contre le fond réel d'un bouton Primer non
  // pressé en thème dark-dimmed. Ni la forme ni l'unicité ne peuvent attraper ça ; seul un
  // calcul de contraste le peut, donc c'en est un.
  //
  // Fonds mesurés en DIRECT sur github.com (light.css/dark.css/dark_dimmed.css réels, servis
  // sous les mêmes attributs data-color-mode/data-light-theme/data-dark-theme que la page
  // elle-même applique) le 2026-09-03 — jamais recopiés d'un chiffre cité ailleurs sans
  // vérification. `--button-default-bgColor-rest` résout vers `--control-bgColor-rest` ;
  // « canvas » et « muted » sont les fonds candidats les plus proches pour `.cct-badge`, qui
  // n'a pas de fond propre et prend celui du conteneur de commentaire qui le porte. Ces 9
  // fonds sont ceux de l'état NON pressé de `.cct-label-button` et de `.cct-badge` — l'état
  // pressé (fond `--bgColor-accent-emphasis`, un bleu d'emphase) n'y satisfait aucune teinte
  // possible en nombre suffisant pour rester une palette d'autant de couleurs distinctes, et
  // n'est donc délibérément pas gardé ici (cf. commentaire de defaults.ts).
  const GITHUB_PRIMER_BACKGROUNDS: Record<string, string> = {
    'light/canvas': '#ffffff',
    'light/muted': '#f6f8fa',
    'light/button-rest': '#f6f8fa',
    'dark/canvas': '#0d1117',
    'dark/muted': '#151b23',
    'dark/button-rest': '#212830',
    'dimmed/canvas': '#212830',
    'dimmed/muted': '#262c36',
    'dimmed/button-rest': '#2a313c',
  };

  // Luminance relative et ratio de contraste — formule WCAG 2.1 telle quelle (pas de
  // bibliothèque : quatre lignes, et l'auto-test ci-dessous vaut vérification directe).
  function srgbToLinear(c: number): number {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  }
  function relativeLuminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(srgbToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastRatio(hexA: string, hexB: string): number {
    const [la, lb] = [relativeLuminance(hexA), relativeLuminance(hexB)];
    const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
    return (lighter + 0.05) / (darker + 0.05);
  }

  it('la formule de contraste elle-même est correcte (auto-test, valeurs de référence connues)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#4C2889', '#4C2889')).toBeCloseTo(1, 5);
  });

  it('la bordure colorée de chaque label reste perceptible sur les fonds Primer clair/sombre/dark-dimmed (§10, issue #18) — WCAG 2.1 SC 1.4.11, 3:1', () => {
    const c = defaultConfig();
    for (const l of c.labels) {
      for (const [bgName, bg] of Object.entries(GITHUB_PRIMER_BACKGROUNDS)) {
        const ratio = contrastRatio(l.color!, bg);
        expect(ratio, `${l.id} (${l.color}) contre ${bgName} (${bg}) : ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('§8.1.2 / §8.1.4 — précédence et fusion', () => {
  it('fichier de dépôt > organisation > défauts, fusion par id sans suppression', () => {
    const { config } = resolveConfig(
      null,
      found({ labels: [{ id: 'issue', color: '#111111' }], rules: { minSubjectLength: 3 } }),
      found({ labels: [{ id: 'issue', color: '#222222' }, { id: 'perf-note', blockingByDefault: false }] }));
    expect(config.labels.find((l) => l.id === 'issue')!.color).toBe('#222222');
    expect(config.labels.find((l) => l.id === 'perf-note')).toBeDefined();
    expect(config.labels).toHaveLength(defaultConfig().labels.length + 1); // jamais de suppression
    expect(config.rules.minSubjectLength).toBe(3);
  });

  it('retirer un label passe par enabled:false, jamais par suppression (§8.1.4)', () => {
    const { config } = resolveConfig(null, absent, found({ labels: [{ id: 'chore', enabled: false }] }));
    expect(config.labels.find((l) => l.id === 'chore')!.enabled).toBe(false);
    expect(config.labels).toHaveLength(defaultConfig().labels.length);
  });

  it('severities fusionne par code ; exemptUsers par union', () => {
    const { config } = resolveConfig(
      null,
      found({ severities: { 'W-CASE': 'error' }, exemptUsers: ['bot-a'] }),
      found({ severities: { 'W-NO-DISCUSSION': 'off' }, exemptUsers: ['bot-b'] }));
    expect(config.severities).toEqual({ 'W-CASE': 'error', 'W-NO-DISCUSSION': 'off' });
    expect(config.exemptUsers).toEqual(['bot-a', 'bot-b']);
  });
});

describe('§8.1.1 — plancher', () => {
  const floor: Floor = { floorVersion: 1, minimumMode: 'enforce' };

  it('CA-14/CA-24 : un mode de dépôt sous le plancher est ignoré, et le fait signalé', () => {
    const { config, notices } = resolveConfig(floor, absent, found({ mode: 'off' }));
    expect(config.mode).toBe('enforce');
    expect(notices.some((n) => n.kind === 'floor-override' && n.ref === 'mode')).toBe(true);
  });

  it('durcir au-delà du plancher est permis', () => {
    const { config } = resolveConfig({ minimumMode: 'assist' }, absent, found({ mode: 'enforce' }));
    expect(config.mode).toBe('enforce');
  });

  it('severities du plancher non abaissables', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', severities: { 'W-CASE': 'error' } },
      absent,
      found({ severities: { 'W-CASE': 'warn' } }));
    expect(config.severities['W-CASE']).toBe('error');
  });

  it('labels.minimum : enabled/blockingByDefault ne passent pas à false en dessous du plancher (§8.1.1)', () => {
    const { config, notices } = resolveConfig(
      { minimumMode: 'off', labels: { minimum: ['issue', 'todo'] } },
      absent,
      found({ labels: [{ id: 'issue', enabled: false }, { id: 'todo', blockingByDefault: false }, { id: 'chore', enabled: false }] }));
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(true);
    expect(config.labels.find((l) => l.id === 'todo')!.blockingByDefault).toBe(true);
    expect(config.labels.find((l) => l.id === 'chore')!.enabled).toBe(false); // hors minimum : libre
    expect(notices.filter((n) => n.kind === 'floor-override').length).toBeGreaterThanOrEqual(2);
  });

  it('exemptUsers : minimum irrétirable ; closed interdit tout ajout (§8.1.1)', () => {
    const open = resolveConfig(
      { minimumMode: 'off', exemptUsers: { minimum: ['svc-bot'], closed: false } },
      absent,
      found({ exemptUsers: ['moi-meme'] }));
    expect(open.config.exemptUsers.sort()).toEqual(['moi-meme', 'svc-bot']);
    const closed = resolveConfig(
      { minimumMode: 'off', exemptUsers: { minimum: ['svc-bot'], closed: true } },
      absent,
      found({ exemptUsers: ['moi-meme'] }));
    expect(closed.config.exemptUsers).toEqual(['svc-bot']); // un dépôt ne s'ajoute pas lui-même
  });

  it('configCacheTtlSeconds : valeur imposée, ni minimum ni maximum (§8.1.3 règle 4)', () => {
    const { config } = resolveConfig(
      { minimumMode: 'off', configCacheTtlSeconds: 600 },
      absent,
      found({ configCacheTtlSeconds: 60 }));
    expect(config.configCacheTtlSeconds).toBe(600);
  });

  it('plancher absent = {minimumMode: off}, aucune règle imposée', () => {
    const { config } = resolveConfig(null, absent, found({ mode: 'off' }));
    expect(config.mode).toBe('off');
  });

  it('floorVersion non supportée : plancher non appliqué, repli assist, signalé (§8.1.1)', () => {
    const { config, notices } = resolveConfig(
      { floorVersion: 99, minimumMode: 'enforce' },
      absent,
      found({ mode: 'enforce' }));
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.kind === 'unsupported-version')).toBe(true);
  });
});

describe('§8.1.5 — configuration absente, illisible ou invalide', () => {
  it('JSON invalide : repli sur le dernier niveau valide + invalid-config avec la ligne fautive', () => {
    const { config, notices } = resolveConfig(
      null,
      found({ mode: 'enforce' }),
      foundText('{\n  "mode": "off",\n  oops\n}'));
    expect(config.mode).toBe('enforce'); // organisation, puis défauts
    const notice = notices.find((n) => n.kind === 'invalid-config');
    expect(notice).toBeDefined();
    expect(notice!.message).toMatch(/line \d+/);
  });

  it('valeur hors domaine pour une clé connue ("mode": "banana") : document invalide', () => {
    const { config, notices } = resolveConfig(null, absent, found({ mode: 'banana' }));
    expect(config.mode).toBe('assist'); // défauts
    expect(notices.some((n) => n.kind === 'invalid-config')).toBe(true);
  });

  it('clé inconnue : simplement ignorée avec avertissement, aucun repli (§8.1.5)', () => {
    const { config, notices } = resolveConfig(
      null,
      absent,
      found({ mode: 'enforce', futureKey: true }));
    expect(config.mode).toBe('enforce'); // la contrainte ne disparaît pas
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'futureKey')).toBe(true);
    expect(notices.some((n) => n.kind === 'invalid-config')).toBe(false);
  });

  it('fichier absent + jamais évalué : nominal, aucun notice', () => {
    const { notices } = resolveConfig(null, absent, absent);
    expect(notices).toEqual([]);
  });

  it('version de schéma supérieure : repli assist, ou plancher si plus strict, signalé', () => {
    const noFloor = resolveConfig(null, absent, found({ version: 99, mode: 'enforce' }));
    expect(noFloor.config.mode).toBe('assist');
    expect(noFloor.notices.some((n) => n.kind === 'unsupported-version')).toBe(true);
    const withFloor = resolveConfig(
      { minimumMode: 'enforce' },
      absent,
      found({ version: 99, mode: 'off' }));
    expect(withFloor.config.mode).toBe('enforce'); // le plancher en vigueur, plus strict
  });

  it('coreMinVersion non satisfaite : même repli, mot pour mot', () => {
    const { config, notices } = resolveConfig(null, absent, found({ coreMinVersion: '99.0.0', mode: 'enforce' }));
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.kind === 'unsupported-version')).toBe(true);
  });

  it('lecture impossible (unreachable) : niveau sauté — la dégradation est l’affaire de l’appelant', () => {
    const { config } = resolveConfig(
      null,
      { status: 'unreachable', reason: 'network' },
      found({ mode: 'enforce' }));
    expect(config.mode).toBe('enforce');
  });

  it('configUrl posée dans le fichier de dépôt : ignorée et signalée (§8.1.2)', () => {
    const { config, notices } = resolveConfig(
      { minimumMode: 'off', configUrl: 'https://interne.example/org.json' },
      absent,
      found({ configUrl: 'https://depot-pirate.example/ma-config.json' }));
    expect(config.configUrl).toBe('https://interne.example/org.json');
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'configUrl')).toBe(true);
  });
});

describe('§8.2 — bornes statiques des allowlistPatterns', () => {
  it('quantificateur imbriqué détecté statiquement', () => {
    expect(hasNestedQuantifier('^(a+)+$')).toBe(true);
    expect(hasNestedQuantifier('(\\d{2,4})*')).toBe(true);
    expect(hasNestedQuantifier('^LGTM$')).toBe(false);
    expect(hasNestedQuantifier('^(approved|lgtm)$')).toBe(false);
    expect(hasNestedQuantifier('a+b*c?')).toBe(false);
    expect(hasNestedQuantifier('(abc)+')).toBe(false); // groupe quantifié sans quantificateur interne
    expect(hasNestedQuantifier('[a+]+')).toBe(false); // classe de caractères, pas un groupe
  });

  it('motif trop long ou invalide : ignoré et signalé, les autres conservés', () => {
    const { config, notices } = resolveConfig(
      null,
      absent,
      found({ allowlistPatterns: ['^LGTM$', 'a'.repeat(300), '^(a+)+$', '[invalid'] }));
    expect(config.allowlistPatterns).toEqual(['^LGTM$']);
    expect(notices.filter((n) => n.kind === 'config-warning')).toHaveLength(3);
  });
});

describe('§8.1.1 — le document de plancher est vérifié comme celui d’un dépôt', () => {
  // Le plancher est écrit par une administration, mais il arrive par le même chemin
  // qu’un fichier de dépôt : du JSON désérialisé. Ses entrées court-circuitaient les
  // filtres que `parseConfigDocument()` applique aux MÊMES clés, et sa forme n’était
  // vérifiée nulle part.

  it('un motif de plancher hors des bornes du §8.2 est écarté et signalé', () => {
    // Le cas qui compte : `^(a+)+$` est exactement ce que les bornes ReDoS interdisent
    // à un dépôt. Sans cette passe, un plancher l’imposait aux deux composants — le
    // navigateur du relecteur ET le service mutualisé.
    const floor: Floor = { allowlistPatterns: { minimum: ['^(a+)+$', '^ok$'] } };
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.allowlistPatterns).toEqual(['^ok$']);
    expect(notices.some((n) => n.kind === 'config-warning' && n.message.startsWith('floor: '))).toBe(true);
  });

  it('une entrée toolCommands hors grammaire est écartée et signalée', () => {
    const floor: Floor = { toolCommands: { minimum: ['LGTM', '@bot'] } };
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.toolCommands).toEqual(['@bot']);
    expect(notices.some((n) => n.kind === 'config-warning' && n.message.includes('floor: toolCommands'))).toBe(true);
  });

  it('l’avertissement dit que l’entrée vient du PLANCHER, pas d’un dépôt', () => {
    // Sans le préfixe, une administration qui débogue sa politique lit un message
    // identique à celui d’un fichier de dépôt et cherche au mauvais endroit.
    const floor: Floor = { toolCommands: { minimum: ['LGTM'] } };
    const repo = found({ toolCommands: ['NOPE'] });
    const { notices } = resolveConfig(floor, absent, repo);
    const warnings = notices.filter((n) => n.kind === 'config-warning' && n.ref === 'LGTM');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message.startsWith('floor: ')).toBe(true);
    expect(notices.some((n) => n.ref === 'NOPE' && !n.message.startsWith('floor: '))).toBe(true);
  });

  it('`{ closed: true }` sans `minimum` ne fait plus lever la résolution', () => {
    // `out[key] = [...rule.minimum]` sur un `minimum` absent : le type dit qu’il est
    // obligatoire, mais la valeur vient d’un JSON.parse, jamais d’un compilateur.
    const floor = { allowlistPatterns: { closed: true } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ allowlistPatterns: ['^x$'] }));
    expect(config.allowlistPatterns).toEqual([]); // closed + minimum vide ferme la clé
    expect(notices.some((n) => n.ref === 'allowlistPatterns.minimum')).toBe(true);
  });

  it('un labels.minimum qui n’est pas un tableau ne fait plus lever', () => {
    const floor = { labels: { minimum: 'issue' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ labels: [{ id: 'issue', enabled: false }] }));
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(false); // plancher vide : rien à protéger
    expect(notices.some((n) => n.ref === 'labels.minimum')).toBe(true);
  });

  it('un `closed` non booléen garde la liste FERMÉE, et le signale', () => {
    // `"closed": "true"` est la coquille JSON la plus banale. `=== true` la résolvait en
    // `false` et ROUVRAIT la liste : le dépôt regagnait des exemptions que l'administration
    // croyait avoir fermées. Régression dans le sens permissif — le seul interdit ici.
    const floor = { exemptUsers: { minimum: ['ci[bot]'], closed: 'true' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ exemptUsers: ['moi'] }));
    expect(config.exemptUsers).toEqual(['ci[bot]']); // fermée : l'ajout du dépôt est écarté
    expect(notices.some((n) => n.ref === 'exemptUsers.closed')).toBe(true);
  });

  it('`closed` absent laisse la liste ouverte, sans avertissement', () => {
    // Contre-épreuve du précédent : l'absence est le défaut du schéma, pas une faute.
    const floor: Floor = { exemptUsers: { minimum: ['ci[bot]'] } };
    const { config, notices } = resolveConfig(floor, absent, found({ exemptUsers: ['moi'] }));
    expect(config.exemptUsers).toEqual(expect.arrayContaining(['ci[bot]', 'moi']));
    expect(notices.some((n) => n.ref === 'exemptUsers.closed')).toBe(false);
  });

  it('une entrée non textuelle DANS le tableau est écartée et signalée', () => {
    // Le contrat annoncé est « écartée ET signalée ». Ne signaler que le tableau absent
    // laissait une politique à moitié appliquée en silence.
    const floor = { exemptUsers: { minimum: ['ci[bot]', 42] } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.exemptUsers).toEqual(['ci[bot]']);
    expect(notices.some((n) => n.ref === 'exemptUsers.minimum' && n.message.includes('non-string'))).toBe(true);
  });

  it('une clé de plancher inconnue est écartée et signalée', () => {
    // `minimumMood` laisse l'administration croire son plancher posé alors que tout le
    // reste du code ignore la clé.
    const floor = { minimumMood: 'enforce' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.mode).toBe('assist'); // le défaut produit : aucun plancher appliqué
    expect(notices.some((n) => n.ref === 'minimumMood' && n.message.includes('unknown floor key'))).toBe(true);
  });

  it('un configCacheTtlSeconds négatif est écarté, pas installé', () => {
    // Installé, il rendait tout cache inutilisable : `écoulé < -1000` est toujours faux,
    // donc relecture des deux niveaux à chaque évaluation et à chaque navigation.
    const floor = { configCacheTtlSeconds: -1 } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.configCacheTtlSeconds).toBeGreaterThanOrEqual(0);
    expect(notices.some((n) => n.ref === 'configCacheTtlSeconds')).toBe(true);
  });

  it('un minimumMode hors énumération est écarté et signalé', () => {
    const floor = { minimumMode: 'ENFORCE' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.ref === 'minimumMode')).toBe(true);
  });

  it('une sévérité de plancher hors énumération est écartée, les autres restent', () => {
    const floor = { severities: { 'E-NO-LABEL': 'error', 'E-UNKNOWN-LABEL': 'critique' } } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, found({ severities: { 'E-NO-LABEL': 'warn' } }));
    expect(config.severities['E-NO-LABEL']).toBe('error'); // le plancher tient
    expect(notices.some((n) => n.ref === 'severities.E-UNKNOWN-LABEL')).toBe(true);
  });

  it('une version de plancher entre guillemets ne déclenche pas le repli par coercition', () => {
    // `"99" > 1` est vrai en JavaScript : la comparaison passait avant la vérification de
    // type, et une version mal écrite faisait retomber le plancher en `assist`.
    const floor = { floorVersion: '99', minimumMode: 'enforce' } as unknown as Floor;
    const { config, notices } = resolveConfig(floor, absent, absent);
    expect(config.mode).toBe('enforce'); // le plancher est appliqué, pas escamoté
    expect(notices.some((n) => n.ref === 'floorVersion')).toBe(true);
    expect(notices.some((n) => n.kind === 'unsupported-version')).toBe(false);
  });

  it('la règle d’URL du plancher : nulle si non applicable, transmise sinon', () => {
    // La règle elle-même. Que les APPELANTS la consultent AVANT de lire le réseau se
    // teste là où le défaut vivait — `server/test/orchestrator.test.ts`.
    const trop = { floorVersion: 99, configUrl: 'https://interne.example/cc.json' } as Floor;
    expect(vettedConfigUrl(vetFloor(trop))).toBeNull();
    const bon = { floorVersion: 1, configUrl: 'https://interne.example/cc.json' } as Floor;
    expect(vettedConfigUrl(vetFloor(bon))).toBe('https://interne.example/cc.json');
  });

  it('un configUrl qui n’est pas une chaîne est écarté, pas transmis', () => {
    const floor = { configUrl: 42 } as unknown as Floor;
    const vet = vetFloor(floor);
    expect(vettedConfigUrl(vet)).toBeNull();
    expect(vet.notices.some((n) => n.ref === 'configUrl')).toBe(true);
  });

  it('une sous-clé inconnue d’une règle de liste est signalée', () => {
    // `closd` laissait `closed` absent, donc la liste OUVERTE, alors que
    // l'administration la voulait fermée — et sans un mot.
    const floor = { exemptUsers: { minimum: ['ci[bot]'], closd: true } } as unknown as Floor;
    const { notices } = resolveConfig(floor, absent, absent);
    expect(notices.some((n) => n.ref === 'exemptUsers.closd')).toBe(true);
  });

  it('une version fractionnaire est écartée, pas tenue pour supérieure', () => {
    // `1.5 > 1` est vrai : une comparaison écrite à la main la déclarait non supportée,
    // là où la vérification exige un entier et applique le reste du document.
    const floor = { floorVersion: 1.5, minimumMode: 'enforce' } as unknown as Floor;
    const vet = vetFloor(floor);
    expect(vet.unsupported).toBe(false);
    expect(vet.notices.some((n) => n.ref === 'floorVersion')).toBe(true);
    const { config } = resolveConfig(floor, absent, absent);
    expect(config.mode).toBe('enforce'); // le reste du plancher s'applique
  });

  it('une sous-clé inconnue de labels est signalée', () => {
    // `minmum` : `issue` est planché, `todo` ne l'est pas, et rien ne le dit. Un niveau
    // inférieur peut alors le désactiver alors que l'administration le croyait protégé.
    const floor = { labels: { minimum: ['issue'], minmum: ['todo'] } } as unknown as Floor;
    const repo = found({ labels: [{ id: 'issue', enabled: false }, { id: 'todo', enabled: false }] });
    const { config, notices } = resolveConfig(floor, absent, repo);
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(true);  // planché
    expect(config.labels.find((l) => l.id === 'todo')!.enabled).toBe(false);  // pas planché
    expect(notices.some((n) => n.ref === 'labels.minmum')).toBe(true);        // et c'est dit
  });

  it('contre-épreuve : un plancher bien formé s’applique intégralement', () => {
    const floor: Floor = {
      minimumMode: 'enforce',
      exemptUsers: { minimum: ['ci[bot]'] },
      allowlistPatterns: { minimum: ['^ok$'] },
      toolCommands: { minimum: ['/*'] },
      labels: { minimum: ['issue'] },
    };
    const { config, notices } = resolveConfig(floor, absent, found({ labels: [{ id: 'issue', enabled: false }] }));
    expect(config.mode).toBe('enforce');
    expect(config.exemptUsers).toContain('ci[bot]');
    expect(config.allowlistPatterns).toEqual(['^ok$']);
    expect(config.toolCommands).toEqual(['/*']);
    expect(config.labels.find((l) => l.id === 'issue')!.enabled).toBe(true);
    expect(notices.some((n) => n.kind === 'config-warning')).toBe(false);
  });
});

describe('§7 — `warn` est lu comme `assist`, et le fait signalé', () => {
  it('dans un fichier de configuration : mode assist, avis « valeur obsolète », aucun repli', () => {
    const { config, notices } = resolveConfig(null, absent, found({ mode: 'warn', labels: [{ id: 'kudos' }] }));
    expect(config.mode).toBe('assist');
    // Pas de repli du §8.1.5 : le reste du document s'applique.
    expect(config.labels.some((l) => l.id === 'kudos')).toBe(true);
    expect(notices.filter((n) => n.ref === 'mode').map((n) => n.kind)).toEqual(['config-warning']);
    expect(notices.find((n) => n.ref === 'mode')!.message).toMatch(/obsolete value "warn".*"assist"/);
    expect(notices.some((n) => n.kind === 'invalid-config')).toBe(false);
  });

  it('dans un document d’organisation : de même', () => {
    const { config, notices } = resolveConfig(null, found({ mode: 'warn' }), absent);
    expect(config.mode).toBe('assist');
    expect(notices.some((n) => n.kind === 'config-warning' && n.ref === 'mode')).toBe(true);
  });

  it('dans le plancher (`minimumMode`) : borne assist, avis, et un dépôt en off est relevé', () => {
    const vetted = vetFloor({ minimumMode: 'warn' } as unknown as Floor);
    expect(vetted.floor.minimumMode).toBe('assist');
    expect(vetted.notices.map((n) => [n.kind, n.ref])).toEqual([['config-warning', 'minimumMode']]);
    const { config } = resolveConfig({ minimumMode: 'warn' } as unknown as Floor, absent, found({ mode: 'off' }));
    expect(config.mode).toBe('assist');
  });

  it('l’échelle n’a plus que trois crans : off < assist < enforce (§8.1.1)', () => {
    expect(Object.keys(MODE_SCALE)).toEqual(['off', 'assist', 'enforce']);
    // Sous un plancher assist, enforce reste permis ; off est relevé.
    expect(resolveConfig({ minimumMode: 'assist' }, absent, found({ mode: 'enforce' })).config.mode).toBe('enforce');
  });
});

describe('§8.2 « Clés retirées » — une clé du vérificateur est une clé inconnue, signalée, sans repli', () => {
  const RETIRED: Record<string, unknown> = {
    formatSeverity: 'error',
    overrideLabel: 'cc-override',
    resolverOverrideGroup: ['acme/tech-leads'],
    activation: { activatedAt: '2026-09-01T00:00:00Z' },
    docUrl: 'https://conventionalcomments.org/',
  };

  it.each(Object.entries(RETIRED))('`%s` dans un fichier de dépôt : ignorée, config-warning, le reste s’applique', (key, value) => {
    const { config, notices } = resolveConfig(null, absent, found({ mode: 'enforce', [key]: value }));
    expect(config.mode).toBe('enforce'); // aucun repli : la contrainte ne disparaît pas
    expect(notices.filter((n) => n.ref === key).map((n) => n.kind)).toEqual(['config-warning']);
    expect(notices.some((n) => n.kind === 'invalid-config')).toBe(false);
    expect(key in config).toBe(false); // elle ne parvient pas à la configuration effective
  });

  it.each(Object.entries(RETIRED))('`%s` dans un document d’organisation : de même', (key, value) => {
    const { config, notices } = resolveConfig(null, found({ mode: 'enforce', [key]: value }), absent);
    expect(config.mode).toBe('enforce');
    expect(notices.filter((n) => n.ref === key).map((n) => n.kind)).toEqual(['config-warning']);
  });

  it.each(['formatSeverity', 'activation', 'resolverOverrideGroup'])(
    '`%s` dans le plancher : clé de plancher inconnue, écartée et signalée, le reste du plancher s’applique',
    (key) => {
      const floor = { minimumMode: 'enforce', [key]: RETIRED[key] } as unknown as Floor;
      const { config, notices } = resolveConfig(floor, absent, absent);
      expect(config.mode).toBe('enforce');
      expect(notices.filter((n) => n.ref === key).map((n) => n.kind)).toEqual(['config-warning']);
    }
  );
});
