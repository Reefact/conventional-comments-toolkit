import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { comment, config, ctx, evalInput, pr, thread, user } from './helpers.js';

const author = user('alice');
const prAuthor = user('bob');
const lead = user('lead');
const isLead = (u: { id: string }) => u.id === lead.id;

function blockingThread(opts: Parameters<typeof thread>[1] = {}) {
  return thread(comment('issue: fuite mémoire\n\ndétail', { author }), opts);
}

describe('§6.2.1 — deux critères, deux sévérités', () => {
  it('CA-22 : formatSeverity=warn — mal formé n’échoue pas ; fil bloquant non résolu échoue', () => {
    const enforce = config((c) => {
      c.mode = 'enforce';
    });
    const malformed = evaluate(
      evalInput({
        config: enforce,
        threads: [thread(comment('nitpick sans deux-points', { author, canCarryBlockingState: true }))],
      })
    );
    expect(malformed.state).toBe('success');
    expect(malformed.counts.nonCompliantComments).toBe(1);

    const blocked = evaluate(evalInput({ config: enforce, threads: [blockingThread()] }));
    expect(blocked.state).toBe('failure');
    expect(blocked.counts.unresolvedThreads).toBe(1);
    expect(blocked.unresolvedBlockingThreads[0]!.root.author.login).toBe('alice');
  });

  it('formatSeverity=error : le critère 1 échoue le check en enforce', () => {
    const cfg = config((c) => {
      c.mode = 'enforce';
      c.formatSeverity = 'error';
    });
    const r = evaluate(
      evalInput({ config: cfg, threads: [thread(comment('pas de label ici', { author }))] })
    );
    expect(r.state).toBe('failure');
  });

  it('CA-05 : la complétion est refusée par le serveur — le verdict ne dépend d’aucune extension', () => {
    const r = evaluate(evalInput({ config: config((c) => (c.mode = 'enforce')), threads: [blockingThread()] }));
    expect(r.state).toBe('failure');
  });

  it('CA-03 : issue (non-blocking) ne compte pas au critère 2, les décomptes concordent', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [thread(comment('issue (non-blocking): le nom est ambigu', { author }))],
      })
    );
    expect(r.state).toBe('success');
    expect(r.counts.unresolvedThreads).toBe(0);
    expect(r.blockingThreadIds).toEqual([]);
    expect(r.counts.warnings).toBe(0); // pas de W-NO-DISCUSSION non plus (§3.1)
  });

  it('CA-04 : nitpick (blocking) n’ouvre pas de fil bloquant ; issue (blocking, non-blocking) en ouvre un', () => {
    const cfg = config((c) => (c.mode = 'enforce'));
    const nit = evaluate(
      evalInput({ config: cfg, threads: [thread(comment('nitpick (blocking): virgule', { author }))] })
    );
    expect(nit.counts.unresolvedThreads).toBe(0);
    expect(nit.counts.nonCompliantComments).toBe(1); // E-CONFLICT
    const dual = evaluate(
      evalInput({
        config: cfg,
        threads: [thread(comment('issue (blocking, non-blocking): fuite\n\nd', { author }))],
      })
    );
    expect(dual.counts.unresolvedThreads).toBe(1); // départage §3.3
  });

  it('mode warn : jamais en échec (CA-09, CA-23)', () => {
    const r = evaluate(evalInput({ config: config((c) => (c.mode = 'warn')), threads: [blockingThread()] }));
    expect(r.state).toBe('success');
    expect(r.counts.unresolvedThreads).toBe(1); // listé à titre informatif
  });

  it('critère 2 : zones sans état bloquant jamais comptées (§4.1)', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        loose: [
          {
            comment: comment('issue: merci de rebaser\n\nd', { author, canCarryBlockingState: false }),
            zone: 'conversation',
          },
        ],
      })
    );
    expect(r.state).toBe('success');
    expect(r.counts.unresolvedThreads).toBe(0);
    // Validé en format : W-NOT-BLOCKABLE présent dans les diagnostics.
    expect(r.formatDiagnostics.map((d) => d.code)).toContain('W-NOT-BLOCKABLE');
  });
});

describe('§6.1 — gouvernance de la résolution', () => {
  it('cas 1 : résolue par l’auteur du commentaire racine → retenue', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ resolution: 'resolved', resolvedBy: author })],
      })
    );
    expect(r.state).toBe('success');
    expect(r.counts.unresolvedThreads).toBe(0);
  });

  it('CA-13 : résolue par un tiers sans decision → refusée, cause dans la sortie', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ resolution: 'resolved', resolvedBy: prAuthor })],
      })
    );
    expect(r.state).toBe('failure');
    const refused = r.notices.find((n) => n.kind === 'resolution-refused');
    expect(refused).toBeDefined();
    expect(refused!.actor?.login).toBe('bob');
  });

  it('CA-13 : membre habilité + réponse decision valide → retenue', () => {
    const t = blockingThread({ resolution: 'resolved', resolvedBy: lead });
    t.replies = [
      comment('decision: hors périmètre de cette PR, dette suivie en PROJ-142\n\ncontexte', {
        author: lead,
        canCarryBlockingState: false,
      }),
    ];
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({ isOverrideMember: isLead }),
      })
    );
    expect(r.state).toBe('success');
  });

  it('membre habilité SANS decision valide → refusée (motif trop court, §6.1.1)', () => {
    const t = blockingThread({ resolution: 'resolved', resolvedBy: lead });
    t.replies = [comment('decision: ok', { author: lead, canCarryBlockingState: false })];
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({ isOverrideMember: isLead }),
      })
    );
    expect(r.state).toBe('failure');
    expect(r.notices.some((n) => n.kind === 'resolution-refused')).toBe(true);
  });

  it('decision valide mais postée par un non-membre → refusée', () => {
    const t = blockingThread({ resolution: 'resolved', resolvedBy: lead });
    t.replies = [
      comment('decision: hors périmètre de cette PR, dette suivie en PROJ-142', {
        author: prAuthor,
        canCarryBlockingState: false,
      }),
    ];
    const r = evaluate(
      evalInput({ config: config((c) => (c.mode = 'enforce')), threads: [t], ctx: ctx({ isOverrideMember: isLead }) })
    );
    expect(r.state).toBe('failure');
  });

  it('plateforme sans resolvedBy : acceptée + resolution-unattributed à chaque évaluation', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ resolution: 'resolved' })],
      })
    );
    expect(r.state).toBe('success');
    expect(r.notices.some((n) => n.kind === 'resolution-unattributed')).toBe(true);
  });

  it('resolution unknown : classée non résolue (§B.5)', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ resolution: 'unknown' })],
      })
    );
    expect(r.state).toBe('failure');
  });
});

describe('§6.1 — monotonie du caractère bloquant', () => {
  it('CA-36 : issue → note sur un fil déjà observé bloquant reste bloquant, signalé avec son auteur', () => {
    const edited = comment('note: finalement non\n\nd', { author, lastEditedBy: prAuthor });
    const t = thread(edited, { id: 'th-1' });
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({ knownBlockingThreadIds: ['th-1'], firstVerdicts: { 'th-1': { blocking: true, hadConflict: false } } }),
      })
    );
    expect(r.state).toBe('failure');
    expect(r.counts.unresolvedThreads).toBe(1);
    const notice = r.notices.find((n) => n.kind === 'weakening-edit');
    expect(notice?.actor?.login).toBe('bob');
  });

  it('lastEditedBy absent : notice émis sans acteur — jamais l’auteur du dernier événement (§6.1)', () => {
    const edited = comment('note: finalement non\n\nd', { author });
    const t = thread(edited, { id: 'th-1' });
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({ knownBlockingThreadIds: ['th-1'], firstVerdicts: { 'th-1': { blocking: true, hadConflict: false } } }),
      })
    );
    const notice = r.notices.find((n) => n.kind === 'weakening-edit');
    expect(notice).toBeDefined();
    expect(notice!.actor).toBeUndefined();
  });

  it('édition qui renforce (note → issue) : effet normal, entre dans l’ensemble', () => {
    const t = thread(comment('issue: devenu bloquant\n\nd', { author }), { id: 'th-2' });
    const r = evaluate(evalInput({ config: config((c) => (c.mode = 'enforce')), threads: [t] }));
    expect(r.blockingThreadIds).toEqual(['th-2']);
    expect(r.newFirstVerdicts['th-2']).toEqual({ blocking: true, hadConflict: false });
  });

  it('CA-36 contre-épreuve : corriger un E-CONFLICT présent dès la première observation, par l’auteur', () => {
    const corrected = comment('issue (non-blocking): fuite\n\nd', { author, lastEditedBy: author });
    const t = thread(corrected, { id: 'th-3' });
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({
          knownBlockingThreadIds: ['th-3'],
          firstVerdicts: { 'th-3': { blocking: true, hadConflict: true } },
        }),
      })
    );
    expect(r.state).toBe('success');
    expect(r.correctedThreadIds).toEqual(['th-3']);
    expect(r.notices.some((n) => n.kind === 'weakening-edit')).toBe(false);
  });

  it('l’exception ne vaut pas sans E-CONFLICT à la première observation (§6.1, chemin d’évasion)', () => {
    // issue: x observé bloquant sans conflit ; l'auteur de la PR édite vers (blocking, non-blocking)
    // puis vers (non-blocking) : le départage garde le fil bloquant, l'exception est refusée.
    const step2 = comment('issue (non-blocking): fuite\n\nd', { author, lastEditedBy: prAuthor });
    const t = thread(step2, { id: 'th-4' });
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({
          knownBlockingThreadIds: ['th-4'],
          firstVerdicts: { 'th-4': { blocking: true, hadConflict: false } },
        }),
      })
    );
    expect(r.state).toBe('failure');
    expect(r.correctedThreadIds).toEqual([]);
  });

  it('l’exception ne vaut pas quand l’édition n’est pas de l’auteur de la racine', () => {
    const t = thread(comment('issue (non-blocking): fuite\n\nd', { author, lastEditedBy: prAuthor }), {
      id: 'th-5',
    });
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({
          knownBlockingThreadIds: ['th-5'],
          firstVerdicts: { 'th-5': { blocking: true, hadConflict: true } },
        }),
      })
    );
    expect(r.state).toBe('failure');
  });

  it('lastEditedBy absent : la seconde condition est invérifiable, l’exception ne s’applique pas', () => {
    const t = thread(comment('issue (non-blocking): fuite\n\nd', { author }), { id: 'th-6' });
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [t],
        ctx: ctx({
          knownBlockingThreadIds: ['th-6'],
          firstVerdicts: { 'th-6': { blocking: true, hadConflict: true } },
        }),
      })
    );
    expect(r.state).toBe('failure');
  });

  it('suppression de la racine : le fil cesse d’être compté, signalé sans auteur', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [],
        ctx: ctx({ knownBlockingThreadIds: ['th-gone'] }),
      })
    );
    expect(r.state).toBe('success');
    const notice = r.notices.find((n) => n.kind === 'root-deleted');
    expect(notice).toBeDefined();
    expect(notice!.actor).toBeUndefined();
  });

  it('newFirstVerdicts : écrit pour les racines observées la première fois seulement', () => {
    const t = thread(comment('issue (blocking, non-blocking): fuite\n\nd', { author }), { id: 'th-7' });
    const first = evaluate(evalInput({ config: config(), threads: [t] }));
    expect(first.newFirstVerdicts['th-7']).toEqual({ blocking: true, hadConflict: true });
    const second = evaluate(
      evalInput({
        config: config(),
        threads: [t],
        ctx: ctx({ firstVerdicts: { 'th-7': { blocking: true, hadConflict: true } }, knownBlockingThreadIds: ['th-7'] }),
      })
    );
    expect(second.newFirstVerdicts).toEqual({});
  });
});

describe('§6.2.3 — périmètre d’activation', () => {
  it('CA-15 : PR créée avant activatedAt — statut vert, résumé explicite, rien d’évalué', () => {
    const r = evaluate(
      evalInput({
        pr: pr({ createdAt: '2026-08-01T00:00:00Z' }),
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread()],
        ctx: ctx({ activatedAt: '2026-09-01T00:00:00Z' }),
      })
    );
    expect(r.state).toBe('success');
    expect(r.counts).toEqual({ unresolvedThreads: 0, nonCompliantComments: 0, warnings: 0 });
    expect(r.headline).toMatch(/activation/i);
  });

  it('activation non datée : aucune PR dans le périmètre', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread()],
        ctx: ctx({ activatedAt: null }),
      })
    );
    expect(r.state).toBe('success');
    expect(r.headline).toMatch(/activation/i);
  });
});

describe('§6.2.4 — brouillon et §6.3.2 — exemption', () => {
  it('CA-35 : brouillon — jamais en échec, compteurs non nuls, vert (§6.5)', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread()],
        ctx: ctx({ isDraft: true }),
      })
    );
    expect(r.state).toBe('success');
    expect(r.isDraft).toBe(true);
    expect(r.counts.unresolvedThreads).toBe(1);
  });

  it('CA-26 : exemption par un membre habilité → vert ; par un non-habilité → refusée, étiquette en place', () => {
    const ok = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ id: 'th-x' })],
        ctx: ctx({
          knownBlockingThreadIds: ['th-x'],
          firstVerdicts: { 'th-x': { blocking: true, hadConflict: false } },
          exemption: { by: lead, at: '2026-10-02T00:00:00Z', labelPresent: true },
          isOverrideMember: isLead,
        }),
      })
    );
    expect(ok.state).toBe('success');
    expect(ok.exemption?.by.login).toBe('lead');
    expect(ok.actions).toEqual({});

    const refused = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ id: 'th-x' })],
        ctx: ctx({
          knownBlockingThreadIds: ['th-x'],
          firstVerdicts: { 'th-x': { blocking: true, hadConflict: false } },
          exemption: { by: prAuthor, at: '2026-10-02T00:00:00Z', labelPresent: true },
          isOverrideMember: isLead,
        }),
      })
    );
    expect(refused.state).toBe('failure');
    expect(refused.notices.some((n) => n.kind === 'exemption-refused' && n.actor?.login === 'bob')).toBe(true);
    expect(refused.actions.removeLabel).toBeUndefined(); // étiquette laissée en place
  });

  it('CA-26 : un nouveau fil bloquant remet l’exemption à zéro — retrait demandé, échec', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ id: 'th-new' })],
        ctx: ctx({
          knownBlockingThreadIds: [], // le fil n'était pas observé au tour précédent
          exemption: { by: lead, at: '2026-10-02T00:00:00Z', labelPresent: true },
          isOverrideMember: isLead,
        }),
      })
    );
    expect(r.state).toBe('failure');
    expect(r.actions.removeLabel).toBe('cc-override');
    expect(r.notices.some((n) => n.kind === 'exemption-reset')).toBe(true);
    expect(r.exemption).toBeUndefined();
  });

  it('CA-39 : étiquette disparue d’une exemption confirmée → restauration demandée, statut vert', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [blockingThread({ id: 'th-x' })],
        ctx: ctx({
          knownBlockingThreadIds: ['th-x'],
          firstVerdicts: { 'th-x': { blocking: true, hadConflict: false } },
          exemption: { by: lead, at: '2026-10-02T00:00:00Z', labelPresent: false },
          isOverrideMember: isLead,
        }),
      })
    );
    expect(r.state).toBe('success');
    expect(r.actions.addLabel).toBe('cc-override');
    expect(r.actions.removeLabel).toBeUndefined(); // jamais les deux (§9.2.1)
    expect(r.notices.some((n) => n.kind === 'exemption-label-restored')).toBe(true);
  });
});

describe('§6.4 / §9.2.2 — verdict imposé (forceState)', () => {
  it('grace-expired : neutre, listes vides, ni weakening-edit ni root-deleted', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [],
        forceState: { state: 'neutral', because: 'grace-expired' },
        ctx: ctx({ knownBlockingThreadIds: ['th-known'] }),
      })
    );
    expect(r.state).toBe('neutral');
    expect(r.notices.some((n) => n.kind === 'root-deleted')).toBe(false); // pas une disparition
    expect(r.notices.some((n) => n.kind === 'grace-expired')).toBe(true);
  });

  it('invalid-config sous enforce : échec imposé, quoi que disent les listes', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        configNotices: [{ kind: 'invalid-config', message: 'line 3' }],
        forceState: { state: 'failure', because: 'invalid-config' },
      })
    );
    expect(r.state).toBe('failure');
  });

  it('config-vanished : neutre imposé', () => {
    const r = evaluate(
      evalInput({
        config: config(),
        configNotices: [{ kind: 'config-vanished', message: 'gone' }],
        forceState: { state: 'neutral', because: 'config-vanished' },
      })
    );
    expect(r.state).toBe('neutral');
  });
});

describe('§6.3.1 — contenu de la sortie', () => {
  it('headline : trois nombres — fils, commentaires (pas diagnostics), avertissements un par un', () => {
    const bad = comment('isue: typo\n\nd', { author }); // E-UNKNOWN-LABEL
    const warn1 = comment('Issue: le nom est ambigu\n\nd', { author }); // W-CASE
    const r = evaluate(
      evalInput({
        config: config((c) => (c.mode = 'enforce')),
        threads: [thread(bad), thread(warn1), blockingThread()],
      })
    );
    expect(r.counts.nonCompliantComments).toBe(1); // un commentaire, même avec trois erreurs
    expect(r.counts.warnings).toBeGreaterThanOrEqual(1);
    expect(r.headline).toContain('1');
    expect(r.formatDiagnostics.every((d) => d.comment.permalink.length > 0)).toBe(true);
  });

  it('coreVersion et configFingerprint : deux empreintes distinctes (§6.3.1)', () => {
    const r = evaluate(evalInput({ config: config() }));
    expect(r.coreVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(r.configFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('targetUrl composée depuis server.statusTargetUrl (§8.2)', () => {
    const r = evaluate(
      evalInput({
        config: config((c) => {
          c.server.statusTargetUrl = 'https://cc.example/status';
        }),
      })
    );
    expect(r.targetUrl).toBe('https://cc.example/status/pr/github/acme/demo/42');
  });
});
