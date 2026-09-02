import { describe, expect, it } from 'vitest';
import { validate, analyze, isBlocking, isCompliant, malformedMotif } from '../src/validator.js';
import { codes, codeSev, config, githubProfile, azdoProfile, GITHUB_TOOL_COMMANDS, user, vInput } from './helpers.js';

const withToolCommands = (c: ReturnType<typeof config>) => {
  c.toolCommands = GITHUB_TOOL_COMMANDS;
};

describe('§3.5.1 — temps 1, reconnaissance du préfixe (séquentiel et exclusif)', () => {
  it('nominal : aucun diagnostic', () => {
    expect(validate(vInput('issue: le nom est ambigu\n\ndétail'), config())).toEqual([]);
  });

  it('CA-17 : trois messages non interchangeables', () => {
    // Attention n'est pas un label, l'espace avant le deux-points prouve la phrase → E-NO-LABEL.
    expect(codes(validate(vInput('Attention : le build casse'), config()))).toEqual(['E-NO-LABEL']);
    // Forme correcte, label inconnu → E-UNKNOWN-LABEL avec la liste des labels.
    const unknown = validate(vInput('attention: le build casse'), config());
    expect(codes(unknown)).toEqual(['E-UNKNOWN-LABEL']);
    expect(unknown[0]!.message).toContain('issue');
    // Casse → W-CASE, avertissement, correction auto.
    const cased = validate(vInput('Issue: le nom est ambigu\n\ndétail'), config());
    expect(codeSev(cased)).toEqual([['W-CASE', 'warn']]);
    expect(cased[0]!.fix?.replacement).toBe('issue: le nom est ambigu');
  });

  it('CA-38 : E-MALFORMED-PREFIX, motif exact, jamais E-NO-LABEL sur une tentative', () => {
    const unclosed = validate(vInput('issue (blocking: x'), config());
    expect(codes(unclosed)).toEqual(['E-MALFORMED-PREFIX']);
    expect(unclosed[0]!.message).toMatch(/parenth/i);
    const spaceBefore = validate(vInput('issue : le nom est ambigu'), config());
    expect(codes(spaceBefore)).toEqual(['E-MALFORMED-PREFIX']);
    expect(spaceBefore[0]!.fix?.replacement).toBe('issue: le nom est ambigu');
  });

  it('motifs de E-MALFORMED-PREFIX, évalués dans l’ordre (§3.5.1)', () => {
    expect(malformedMotif('issue (blocking: x')).toBe('unclosed-paren'); // 1
    expect(malformedMotif('issue blocking): x')).toBe('unopened-paren'); // 2
    expect(malformedMotif('issue (blocking) x')).toBe('missing-colon'); // 3 — parens fermées
    expect(malformedMotif('issue : le nom est ambigu')).toBe('space-before-colon'); // 4
    expect(malformedMotif('issue:pas-d-espace')).toBe('missing-space-after-colon'); // 5
    expect(malformedMotif('issue2: x')).toBe('unexpected-character'); // 6
    expect(malformedMotif('issue (ux) (perf): x')).toBe('unexpected-character'); // 6
  });

  it('étage 1b : tentative détectée via alias aussi', () => {
    const cfg = config((c) => {
      c.labels.find((l) => l.id === 'issue')!.aliases = ['bug'];
    });
    expect(codes(validate(vInput('bug : x'), cfg))).toEqual(['E-MALFORMED-PREFIX']);
  });

  it('E-EMPTY-SUBJECT sur `issue:` et `issue: ` — même diagnostic, même chemin (§3.4.2)', () => {
    // Cumulatif : `issue:` est bloquant (règle 5) et sans discussion.
    expect(codes(validate(vInput('issue:'), config()))).toEqual(['E-EMPTY-SUBJECT', 'W-NO-DISCUSSION']);
    expect(codes(validate(vInput('issue: '), config()))).toEqual(['E-EMPTY-SUBJECT', 'W-NO-DISCUSSION']);
  });

  it('E-UNKNOWN-LABEL propose le plus proche (isue → issue)', () => {
    const diags = validate(vInput('isue: fuite mémoire'), config());
    expect(codes(diags)).toEqual(['E-UNKNOWN-LABEL']);
    expect(diags[0]!.message).toContain('issue');
    expect(diags[0]!.fix?.replacement).toBe('issue: fuite mémoire');
  });

  it('W-CASE n’interrompt pas la suite : contrôles de contenu appliqués', () => {
    const diags = validate(vInput('Issue: ab'), config());
    expect(codes(diags)).toEqual(['W-CASE', 'W-SUBJECT-TOO-SHORT', 'W-NO-DISCUSSION']);
  });

  it('temps 1 : au plus un diagnostic, arrêt au premier étage en échec', () => {
    // Ligne mal formée avec sujet court : le temps 2 n'est jamais atteint.
    expect(codes(validate(vInput('issue (blocking: x'), config()))).toEqual(['E-MALFORMED-PREFIX']);
  });
});

describe('§3.3 — décorations', () => {
  it('CA-16 : E-DECORATION-SYNTAX sur (perf*) et ()', () => {
    expect(codes(validate(vInput('issue (perf*): le nom est ambigu\n\nd'), config()))).toEqual([
      'E-DECORATION-SYNTAX',
    ]);
    expect(codes(validate(vInput('issue (): le nom est ambigu\n\nd'), config()))).toEqual([
      'E-DECORATION-SYNTAX',
    ]);
  });

  it('espace interne et élément vide → E-DECORATION-SYNTAX', () => {
    expect(codes(validate(vInput('issue (non blocking): le nom est ambigu\n\nd'), config()))).toEqual([
      'E-DECORATION-SYNTAX',
    ]);
    expect(codes(validate(vInput('issue (blocking,,): le nom est ambigu\n\nd'), config()))).toEqual([
      'E-DECORATION-SYNTAX',
    ]);
  });

  it('CA-16 : un seul W-DECORATION-STYLE par commentaire, énumérant tous les écarts', () => {
    const upper = validate(vInput('issue (BLOCKING): le nom est ambigu\n\nd'), config());
    expect(codes(upper)).toEqual(['W-DECORATION-STYLE']);
    const both = validate(vInput('issue( blocking ): le nom est ambigu\n\nd'), config());
    expect(codes(both)).toEqual(['W-DECORATION-STYLE']);
    expect(both[0]!.message).toMatch(/espace|space/i);
    expect(both[0]!.fix?.replacement).toBe('issue (blocking): le nom est ambigu');
  });

  it('doublon exact → W-DECORATION-STYLE, corrigé par la réécriture', () => {
    const diags = validate(vInput('issue (blocking, blocking): le nom est ambigu\n\nd'), config());
    expect(codes(diags)).toEqual(['W-DECORATION-STYLE']);
    expect(diags[0]!.fix?.replacement).toBe('issue (blocking): le nom est ambigu');
  });

  it('les deux formes de séparation de l’amont sont acceptées sans diagnostic (§3.1)', () => {
    expect(validate(vInput('issue (ux,non-blocking): le nom est ambigu'), config())).toEqual([]);
    expect(validate(vInput('issue (ux, non-blocking): le nom est ambigu'), config())).toEqual([]);
  });

  it('décoration libre autorisée par défaut, E-UNKNOWN-DECORATION quand allowFree=false', () => {
    expect(validate(vInput('issue (security): le nom est ambigu\n\nd'), config())).toEqual([]);
    const cfg = config((c) => {
      c.decorations.allowFree = false;
    });
    const diags = validate(vInput('issue (foo, bar): fuite mémoire\n\nd'), cfg);
    expect(codes(diags)).toEqual(['E-UNKNOWN-DECORATION']); // un seul, énumérant foo et bar
    expect(diags[0]!.message).toContain('foo');
    expect(diags[0]!.message).toContain('bar');
  });

  it('CA-04 : nitpick (blocking) → E-CONFLICT ; issue (blocking, non-blocking) → E-CONFLICT', () => {
    expect(codes(validate(vInput('nitpick (blocking): virgule finale'), config()))).toEqual([
      'E-CONFLICT',
    ]);
    expect(codes(validate(vInput('issue (blocking, non-blocking): fuite mémoire\n\nd'), config()))).toEqual([
      'E-CONFLICT',
    ]);
    expect(codes(validate(vInput('issue (blocking, if-minor): fuite mémoire\n\nd'), config()))).toEqual([
      'E-CONFLICT',
    ]);
  });

  it('(non-blocking) avec (if-minor) : même effet, pas de conflit', () => {
    expect(validate(vInput('issue (non-blocking, if-minor): fuite mémoire'), config())).toEqual([]);
  });
});

describe('§3.3, §5.5 — CommentAnalysis.decorations, pour l’affichage (badges)', () => {
  it('aucune décoration écrite → tableau vide', () => {
    expect(analyze(vInput('issue: le nom est ambigu'), config()).decorations).toEqual([]);
  });

  it('décoration connue et porteuse : id, forces et known repris de la configuration', () => {
    const a = analyze(vInput('issue (blocking): fuite mémoire'), config());
    expect(a.decorations).toEqual([{ id: 'blocking', forces: 'blocking', known: true }]);
  });

  it('(non-blocking) et (if-minor) restent deux entrées distinctes, même `forces`', () => {
    const a = analyze(vInput('issue (non-blocking, if-minor): fuite mémoire'), config());
    expect(a.decorations).toEqual([
      { id: 'non-blocking', forces: 'non-blocking', known: true },
      { id: 'if-minor', forces: 'non-blocking', known: true },
    ]);
  });

  it('décoration libre (allowFree) : known=false, forces=null', () => {
    const a = analyze(vInput('issue (security): le nom est ambigu\n\nd'), config());
    expect(a.decorations).toEqual([{ id: 'security', forces: null, known: false }]);
  });

  it('décoration inconnue et allowFree=false : REJETÉE, jamais exposée (sinon même badge qu’une décoration libre valide)', () => {
    const cfg = config((c) => {
      c.decorations.allowFree = false;
    });
    const a = analyze(vInput('issue (foo): fuite mémoire\n\nd'), cfg);
    expect(a.decorations).toEqual([]);
    expect(codes(a.diagnostics)).toEqual(['E-UNKNOWN-DECORATION']);
  });

  it('décoration inconnue rejetée mêlée à une décoration valide : seule la valide est exposée', () => {
    const cfg = config((c) => {
      c.decorations.allowFree = false;
    });
    const a = analyze(vInput('issue (foo, blocking): fuite mémoire\n\nd'), cfg);
    expect(a.decorations).toEqual([{ id: 'blocking', forces: 'blocking', known: true }]);
    expect(codes(a.diagnostics)).toEqual(['E-UNKNOWN-DECORATION']);
  });

  it('doublon : une seule entrée, à la première occurrence écrite (W-DECORATION-STYLE ne duplique pas le badge)', () => {
    const a = analyze(vInput('issue (blocking, blocking): fuite mémoire'), config());
    expect(a.decorations).toEqual([{ id: 'blocking', forces: 'blocking', known: true }]);
  });

  it('ordre d’écriture préservé, mélange connue/libre', () => {
    const a = analyze(vInput('issue (security, blocking): fuite mémoire'), config());
    expect(a.decorations.map((d) => d.id)).toEqual(['security', 'blocking']);
  });

  it('préfixe non reconnu ou label implicite : jamais de décoration exposée', () => {
    expect(analyze(vInput('pas de préfixe ici'), config()).decorations).toEqual([]);
    expect(analyze(vInput('```suggestion\nx\n```'), config()).decorations).toEqual([]);
  });
});

describe('§3.3 — précédence du caractère bloquant, départage E-CONFLICT', () => {
  const blocking = (body: string, c = config()) => isBlocking(vInput(body), c);

  it('règles 3 à 5', () => {
    expect(blocking('note (blocking): x')).toBe(false); // E-CONFLICT règle 1 → départage note=false
    expect(blocking('suggestion (blocking): x')).toBe(true); // règle 3
    expect(blocking('issue (non-blocking): x')).toBe(false); // règle 4
    expect(blocking('issue (if-minor): x')).toBe(false); // règle 4 — la liste doit le mentionner (§3.3)
    expect(blocking('issue: x')).toBe(true); // règle 5
    expect(blocking('praise: x')).toBe(false); // règle 5
    expect(blocking('todo: x')).toBe(true);
    expect(blocking('chore: x')).toBe(true);
  });

  it('départage : une racine en E-CONFLICT est bloquante si son label l’est par défaut (CA-04)', () => {
    expect(blocking('issue (blocking, non-blocking): x')).toBe(true); // issue → bloquant
    expect(blocking('nitpick (blocking): x')).toBe(false); // nitpick → non bloquant
  });

  it('préfixe non reconnu, exempté ou label inconnu → jamais bloquant', () => {
    expect(blocking('pas de préfixe ici')).toBe(false);
    expect(blocking('inconnu: x')).toBe(false);
    expect(isBlocking(vInput('issue: x', { isSystemGenerated: true }), config())).toBe(false);
  });

  it('alias : hérite intégralement du label canonique (§8.2)', () => {
    const cfg = config((c) => {
      c.labels.find((l) => l.id === 'issue')!.aliases = ['bug'];
    });
    expect(isBlocking(vInput('bug: fuite mémoire'), cfg)).toBe(true);
  });
});

describe('§3.5.1 — temps 2, sujet, discussion, contexte', () => {
  it('W-SUBJECT-TOO-SHORT / TOO-LONG, seuils configurables', () => {
    expect(codes(validate(vInput('note: abc'), config()))).toEqual(['W-SUBJECT-TOO-SHORT']);
    expect(codes(validate(vInput(`note: ${'a'.repeat(121)}`), config()))).toEqual([
      'W-SUBJECT-TOO-LONG',
    ]);
    const cfg = config((c) => {
      c.rules.minSubjectLength = 2;
    });
    expect(validate(vInput('note: abc'), cfg)).toEqual([]);
  });

  it('exclusion : un sujet vide n’est pas un sujet court', () => {
    expect(codes(validate(vInput('issue:\n\ncorps'), config()))).toEqual(['E-EMPTY-SUBJECT']);
  });

  it('CA-03 : issue (non-blocking) sans discussion ne produit pas W-NO-DISCUSSION', () => {
    expect(validate(vInput('issue (non-blocking): le nom est ambigu'), config())).toEqual([]);
  });

  it('W-NO-DISCUSSION sur un bloquant effectif sans contenu hors ligne de préfixe (§3.1)', () => {
    expect(codes(validate(vInput('issue: le nom est ambigu'), config()))).toEqual([
      'W-NO-DISCUSSION',
    ]);
    // Le code cité en tête EST de la discussion — jamais d'avertissement dans ce cas.
    expect(validate(vInput('```\ncode\n```\nissue: le nom est ambigu'), config())).toEqual([]);
    // C'est le caractère bloquant effectif qui décide, pas le label seul.
    expect(codes(validate(vInput('note (blocking): le nom est ambigu'), config()))).toContain(
      'E-CONFLICT'
    ); // note départagée non bloquante → pas de W-NO-DISCUSSION
    expect(codes(validate(vInput('note (blocking): le nom est ambigu'), config()))).not.toContain(
      'W-NO-DISCUSSION'
    );
  });

  it('W-MISSING-DECORATION : suggestion/question sans décoration porteuse ; (perf) ne l’éteint pas', () => {
    expect(codes(validate(vInput('suggestion: extraire une méthode\n\nd'), config()))).toEqual([
      'W-MISSING-DECORATION',
    ]);
    expect(codes(validate(vInput('question: pourquoi ce choix ?\n\nd'), config()))).toEqual([
      'W-MISSING-DECORATION',
    ]);
    expect(codes(validate(vInput('suggestion (perf): extraire une méthode\n\nd'), config()))).toEqual([
      'W-MISSING-DECORATION',
    ]);
    expect(validate(vInput('suggestion (non-blocking): extraire une méthode\n\nd'), config())).toEqual([]);
    expect(validate(vInput('issue: fuite mémoire\n\nd'), config())).toEqual([]);
  });

  it('CA-21 : W-NOT-BLOCKABLE en zone non bloquante, éteint par (non-blocking)', () => {
    const zone = { zone: 'conversation' as const, canCarryBlockingState: false };
    expect(codes(validate(vInput('issue: merci de rebaser\n\nd', zone), config()))).toEqual([
      'W-NOT-BLOCKABLE',
    ]);
    expect(validate(vInput('issue (non-blocking): merci de rebaser\n\nd', zone), config())).toEqual([]);
  });

  it('cumulatifs : plusieurs codes différents sur un même commentaire, ordre du §3.5.2', () => {
    const diags = validate(vInput('Issue (BLOCKING): abc', { canCarryBlockingState: false }), config());
    expect(codes(diags)).toEqual([
      'W-CASE',
      'W-DECORATION-STYLE',
      'W-SUBJECT-TOO-SHORT',
      'W-NO-DISCUSSION',
      'W-NOT-BLOCKABLE',
    ]);
  });
});

describe('§3.5.1 — étages −2 et −1', () => {
  it('CA-07 : une réponse de fil n’exige pas de label avec la configuration par défaut', () => {
    expect(validate(vInput('Corrigé, merci', { zone: 'reply', canCarryBlockingState: false }), config())).toEqual([]);
  });

  it('étage −2 : une réponse `decision` est toujours validée (§4.1)', () => {
    const reply = { zone: 'reply' as const, canCarryBlockingState: false };
    // Motif trop court → E-DECISION-SUBJECT, seuil minDecisionSubjectLength seul (§3.5.1).
    expect(codes(validate(vInput('decision: ok', reply), config()))).toEqual(['E-DECISION-SUBJECT']);
    expect(
      validate(vInput('decision: hors périmètre de cette PR, dette suivie en PROJ-142', reply), config())
    ).toEqual([]);
    // Sans aucun sujet, E-EMPTY-SUBJECT l'emporte (§3.5.1, exclusion).
    expect(codes(validate(vInput('decision:', reply), config()))).toEqual(['E-EMPTY-SUBJECT']);
    // W-CASE reste évalué à l'étage 3 après la reprise (§3.5.1).
    expect(codes(validate(vInput('Decision: hors périmètre de cette PR, dette suivie ailleurs', reply), config()))).toEqual([
      'W-CASE',
    ]);
  });

  it('étage −2 : une réponse au préfixe mal formé ne porte pas le label decision → non validée', () => {
    expect(
      validate(vInput('decision : trop court', { zone: 'reply', canCarryBlockingState: false }), config())
    ).toEqual([]);
  });

  it('étage −2 : une decision dans un corps de revue éteint (validateReviewSummary=false) n’est pas validée', () => {
    const cfg = config((c) => {
      c.scope.validateReviewSummary = false;
    });
    expect(
      validate(vInput('decision: ok', { zone: 'review-body', canCarryBlockingState: false }), cfg)
    ).toEqual([]);
  });

  it('corps de revue validé par défaut (validateReviewSummary=true)', () => {
    expect(
      codes(validate(vInput('du texte libre', { zone: 'review-body', canCarryBlockingState: false }), config()))
    ).toEqual(['E-NO-LABEL']);
  });

  it('validateReplies=true : les réponses sont validées', () => {
    const cfg = config((c) => {
      c.scope.validateReplies = true;
    });
    expect(
      codes(validate(vInput('Corrigé, merci', { zone: 'reply', canCarryBlockingState: false }), cfg))
    ).toEqual(['E-NO-LABEL']);
  });

  it('CA-19 : corps vide ou blanc — aucun diagnostic', () => {
    expect(validate(vInput(''), config())).toEqual([]);
    expect(validate(vInput('   \n\t'), config())).toEqual([]);
  });

  it('CA-20 : message de plateforme exempté structurellement, sans dépendre d’exemptUsers', () => {
    const cfg = config((c) => {
      c.exemptUsers = [];
    });
    expect(validate(vInput('Branch updated', { isSystemGenerated: true }), cfg)).toEqual([]);
  });

  it('CA-08 : auteur exempté (bots), comparaison sur login insensible à la casse', () => {
    const cfg = config((c) => {
      c.exemptUsers = ['Dependabot[bot]'];
    });
    expect(validate(vInput('Bump lodash', { author: user('dependabot[bot]') }), cfg)).toEqual([]);
  });

  it('CA-40 : commande slash exemptée génériquement si toolCommands contient `/*` (§4.2)', () => {
    // Reconnues sans figurer dans aucune liste : la forme du premier jeton suffit.
    expect(validate(vInput('/azp run'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('/azp'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('/deploy staging'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('/lgtm'), config(withToolCommands))).toEqual([]);
    // Faux positif écarté par la forme : un second `/` dans le jeton n'est pas une commande.
    expect(codes(validate(vInput('/etc/hosts n’est pas le bon endroit'), config(withToolCommands)))).toEqual([
      'E-NO-LABEL',
    ]);
    expect(codes(validate(vInput('/api/v1/users devrait être versionné'), config(withToolCommands)))).toEqual([
      'E-NO-LABEL',
    ]);
    // toolCommands vide par défaut (§4.2) : sans configuration explicite, rien n'est exempté —
    // et le comportement ne dépend d'aucun champ de PlatformProfile.
    expect(codes(validate(vInput('/azp run'), config()))).toEqual(['E-NO-LABEL']);
  });

  it('CA-40 : interpellation d’un robot exemptée si son handle figure dans toolCommands (§4.2)', () => {
    expect(validate(vInput('@codex review'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('@dependabot rebase'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('@coderabbitai review'), config(withToolCommands))).toEqual([]);
    // Jeton entier requis : une mention qui continue le mot n'est pas une commande.
    expect(codes(validate(vInput('@codexplique pourquoi'), config(withToolCommands)))).toEqual(['E-NO-LABEL']);
    // Handle absent de la liste : pas exempté, même en forme de commande.
    expect(codes(validate(vInput('@notre-bot deploy'), config(withToolCommands)))).toEqual(['E-NO-LABEL']);
    // Interpeller une personne reste une remarque de revue.
    expect(codes(validate(vInput('@alice peux-tu regarder ça ?'), config(withToolCommands)))).toEqual([
      'E-NO-LABEL',
    ]);
    // toolCommands vide par défaut : sans configuration explicite, rien n'est exempté.
    expect(codes(validate(vInput('@codex review'), config()))).toEqual(['E-NO-LABEL']);
  });

  it('CA-40 : mention insensible à la casse — @Codex désigne le même compte que @codex (§4.2)', () => {
    expect(validate(vInput('@Codex review'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('@COPILOT review'), config(withToolCommands))).toEqual([]);
    expect(validate(vInput('@DependaBot rebase'), config(withToolCommands))).toEqual([]);
  });

  it('allowlistPatterns appliquées au corps entier après trim() (§4.2)', () => {
    const cfg = config((c) => {
      c.allowlistPatterns = ['^LGTM$'];
    });
    expect(validate(vInput('LGTM'), cfg)).toEqual([]);
    expect(validate(vInput('LGTM\n'), cfg)).toEqual([]); // trim du corps entier, pas la seule ligne
    expect(codes(validate(vInput('LGTM mais corrige a'), cfg))).toEqual(['E-NO-LABEL']);
  });

  it('aucun contenu propre : bloc cité + citation → exempté ; contournement assumé (§4.2)', () => {
    expect(validate(vInput('```\ntout mon commentaire\n```'), config())).toEqual([]);
    expect(validate(vInput('> tout mon commentaire'), config())).toEqual([]);
  });
});

describe('§4.2 / §3.5.1 étage 0 — bloc de suggestion natif', () => {
  const sugg = '```suggestion\nconst x = 1;\n```';

  it('CA-37 : bloc + phrase libre → conforme, label suggestion implicite, sans W-MISSING-DECORATION ni sujet', () => {
    const a = analyze(vInput(`${sugg}\nça devrait suffire`), config());
    expect(a.diagnostics).toEqual([]);
    expect(a.implicitSuggestion).toBe(true);
    expect(a.resolved?.label.id).toBe('suggestion');
  });

  it('bloc seul → pas exempté (il dit quelque chose), conforme sous label implicite', () => {
    const a = analyze(vInput(sugg), config());
    expect(a.outcome).toBe('analyzed');
    expect(a.diagnostics).toEqual([]);
    expect(a.implicitSuggestion).toBe(true);
  });

  it('cas 2 : préfixe explicite bien formé au-dessus du bloc — il l’emporte', () => {
    const a = analyze(vInput(`issue (blocking): fuite mémoire\n${sugg}`), config());
    expect(a.implicitSuggestion).toBe(false);
    expect(a.resolved?.label.id).toBe('issue');
    expect(a.diagnostics).toEqual([]);
    expect(a.blocking).toBe(true);
  });

  it('CA-38/étage 0 cas 3 : tentative ratée au-dessus d’un bloc → E-MALFORMED-PREFIX, jamais conforme', () => {
    const a = analyze(vInput(`issue (blocking: x\n${sugg}`), config());
    expect(codes(a.diagnostics)).toEqual(['E-MALFORMED-PREFIX']);
  });

  it('pas d’étage 0 sur une plateforme sans marqueur établi (§B.6)', () => {
    const a = analyze(vInput(`${sugg}\nune phrase`, { platform: azdoProfile }), config());
    expect(codes(a.diagnostics)).toEqual(['E-NO-LABEL']);
  });
});

describe('§3.5.2 — sévérités, conformité', () => {
  it('severities surcharge ; off retire le diagnostic de la liste restituée', () => {
    const cfg = config((c) => {
      c.severities = { 'W-MISSING-DECORATION': 'off', 'W-SUBJECT-TOO-SHORT': 'error' };
    });
    expect(validate(vInput('suggestion: extraire une méthode\n\nd'), cfg)).toEqual([]);
    expect(codeSev(validate(vInput('note: abc'), cfg))).toEqual([['W-SUBJECT-TOO-SHORT', 'error']]);
  });

  it('limite basse : un code E- ne descend jamais sous warn (§8.2)', () => {
    const cfg = config((c) => {
      c.severities = { 'E-EMPTY-SUBJECT': 'off' };
    });
    expect(codeSev(validate(vInput('issue:'), cfg))).toEqual([
      ['E-EMPTY-SUBJECT', 'warn'],
      ['W-NO-DISCUSSION', 'warn'],
    ]);
  });

  it('conforme = aucun diagnostic error après severities (§3.5.2)', () => {
    expect(isCompliant(validate(vInput('Issue: le nom est ambigu\n\nd'), config()))).toBe(true);
    expect(isCompliant(validate(vInput('issue:'), config()))).toBe(false);
  });
});
