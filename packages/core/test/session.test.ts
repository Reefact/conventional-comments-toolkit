// Marqueur de session (§3.6, #160) : reconnaissance en dernière ligne, et neutralité de la
// métadonnée pour la validation (§3.5), les exemptions (§4.2) et le critère 2 (§6.2.1).

import { describe, expect, it } from 'vitest';
import { extractSessionMarker } from '../src/session.js';
import { analyze, isBlocking, validate } from '../src/validator.js';
import { evaluate } from '../src/evaluate.js';
import { defaultConfig } from '../src/config/defaults.js';
import { parseConfigDocument } from '../src/config/schema.js';
import { fingerprint } from '../src/config/fingerprint.js';
import { codes, comment, config, evalInput, thread, user, vInput } from './helpers.js';

const value = (body: string) => extractSessionMarker(body)?.value ?? null;

describe('CA-51 — reconnaissance du marqueur de session (§3.6)', () => {
  it('reconnu en dernière ligne, avec zéro, une ou plusieurs lignes blanches après', () => {
    const body = 'issue (blocking): titre\n\nDétail.\n\n[session:Melancholy-Coordinated-Value-Object]';
    expect(value(body)).toBe('Melancholy-Coordinated-Value-Object');
    expect(value(`${body}\n`)).toBe('Melancholy-Coordinated-Value-Object');
    expect(value(`${body}\n\n  \n\t\n`)).toBe('Melancholy-Coordinated-Value-Object');
    expect(value(`${body}\r\n\r\n`)).toBe('Melancholy-Coordinated-Value-Object');
  });

  it('toute valeur libre non vide ; aucun GUID exigé ; casse et blancs internes conservés', () => {
    expect(value('note: x\n[session:run 42]')).toBe('run 42');
    expect(value('note: x\n[session:3f2b0c1e-9d4a-4c55-8e0a-0b6f1d2c3e4f]')).toBe('3f2b0c1e-9d4a-4c55-8e0a-0b6f1d2c3e4f');
    expect(value('note: x\n[session:  Spaced  ]')).toBe('Spaced');
    expect(value('note: x\n[session:a]b]')).toBe('a]b');
    expect(value('note: x\n   [session:indented]   ')).toBe('indented');
  });

  it('la ligne brute est gardée telle qu’écrite, et le corps sans elle est exact au caractère près', () => {
    const m = extractSessionMarker('note: x\r\n\r\n  [session:Run-7]  \r\n')!;
    expect(m.raw).toBe('[session:Run-7]');
    expect(m.contentBody).toBe('note: x\r\n\r\n');
  });

  it.each([
    ['valeur vide', 'note: x\n[session:]'],
    ['valeur blanche', 'note: x\n[session:   ]'],
    ['pas en dernière ligne', 'note: x\n[session:a]\n\nencore du texte'],
    ['en ligne avec du texte', 'note: x\nfin [session:a]'],
    ['suivi de texte', 'note: x\n[session:a] fin'],
    ['dans un bloc de code délimité', 'note: x\n```\n[session:a]\n```'],
    ['dans un bloc de code jamais refermé', 'note: x\n```\n[session:a]'],
    ['dans une citation', 'note: x\n> [session:a]'],
    ['mot-clé dans une autre casse', 'note: x\n[Session:a]'],
    ['espace avant le deux-points', 'note: x\n[session :a]'],
    ['crochet fermant absent', 'note: x\n[session:a'],
    ['corps vide', ''],
  ])('non reconnu : %s', (_name, body) => {
    expect(extractSessionMarker(body)).toBeNull();
  });

  it('un marqueur mal formé ou mal placé reste du texte ordinaire : aucun diagnostic nouveau', () => {
    // Placé avant la discussion, la ligne compte comme discussion : aucun W-NO-DISCUSSION.
    expect(codes(validate(vInput('issue: titre conforme\n[session:a]\nsuite'), config()))).toEqual([]);
    // Seul dans le corps mais mal formé : c'est la ligne de préfixe, comme toute phrase.
    expect(codes(validate(vInput('[session:]'), config()))).toEqual(['E-NO-LABEL']);
  });
});

describe('CA-52 — la métadonnée ne satisfait aucune exigence et ne change aucun effet (§3.6)', () => {
  it('ne compte pas comme discussion : W-NO-DISCUSSION subsiste sur un commentaire bloquant', () => {
    expect(codes(validate(vInput('issue: le nom est ambigu'), config()))).toEqual(['W-NO-DISCUSSION']);
    expect(codes(validate(vInput('issue: le nom est ambigu\n\n[session:run-1]'), config()))).toEqual([
      'W-NO-DISCUSSION',
    ]);
  });

  it('ne devient jamais la ligne de préfixe, ni le sujet', () => {
    const a = analyze(vInput('issue:\n[session:run-1]'), config());
    expect(a.prefixLine).toBe('issue:');
    expect(codes(a.diagnostics)).toEqual(['E-EMPTY-SUBJECT', 'W-NO-DISCUSSION']);
    expect(a.session?.value).toBe('run-1');
  });

  it('seul dans le corps, il ne fait pas un commentaire : corps sans contenu, exempté comme un corps vide (§4.2)', () => {
    const a = analyze(vInput('[session:run-1]\n'), config());
    expect(a.outcome).toBe('exempt');
    expect(a.diagnostics).toEqual([]);
    expect(a.resolved).toBeNull();
    expect(a.session?.value).toBe('run-1');
  });

  it('n’est pas du contenu pour allowlistPatterns, appliquées au corps sans lui', () => {
    const cfg = config((c) => (c.allowlistPatterns = ['^LGTM$']));
    expect(analyze(vInput('LGTM\n\n[session:run-1]'), cfg).outcome).toBe('exempt');
  });

  it('ne change ni le label, ni les décorations, ni le caractère bloquant', () => {
    for (const body of ['issue: fuite mémoire\n\ndétail', 'note (non-blocking): rien\n\ndétail', 'praise: bien']) {
      const without = analyze(vInput(body), config());
      const withMarker = analyze(vInput(`${body}\n\n[session:run-1]`), config());
      expect(withMarker.resolved?.label.id).toBe(without.resolved?.label.id);
      expect(withMarker.decorations).toEqual(without.decorations);
      expect(withMarker.blocking).toBe(without.blocking);
      expect(isBlocking(vInput(`${body}\n\n[session:run-1]`), config())).toBe(without.blocking);
    }
  });

  it('le critère 2 et la résolution par `decision` sont inchangés', () => {
    const author = user('alice');
    const cfg = config((c) => (c.mode = 'enforce'));
    const blocking = evaluate(
      evalInput({ config: cfg, threads: [thread(comment('issue: fuite\n\ndétail\n\n[session:a]', { author }))] })
    );
    expect(blocking.state).toBe('failure');
    expect(blocking.counts.unresolvedThreads).toBe(1);

    const decided = evaluate(
      evalInput({
        config: cfg,
        threads: [
          thread(comment('issue: fuite\n\ndétail\n\n[session:a]', { author }), {
            resolution: 'resolved',
            replies: [comment('decision: on garde, le coût de la migration dépasse le gain\n\n[session:b]', { author })],
          }),
        ],
      })
    );
    expect(decided.counts.unresolvedThreads).toBe(0);
  });
});

describe('`sessionIcon` — présentation seule (§8.2)', () => {
  it('robot par défaut, surchargeable, chaîne non vide', () => {
    expect(defaultConfig().sessionIcon).toBe('\u{1F916}');
    const ok = parseConfigDocument(JSON.stringify({ sessionIcon: '\u{1F9ED}' }), { level: 'repo' });
    expect(ok.values?.['sessionIcon']).toBe('\u{1F9ED}');
    expect(ok.notices).toEqual([]);
    // Même règle que `badgeStyle` : une valeur du mauvais type rend le document invalide (§8.1.5).
    const bad = parseConfigDocument(JSON.stringify({ sessionIcon: '' }), { level: 'repo' });
    expect(bad.invalid).toBe(true);
  });

  it('hors du domaine de l’empreinte : la changer ne fait diverger aucun composant (§9.2.2)', () => {
    const a = config();
    const b = config((c) => (c.sessionIcon = '\u{1F9ED}'));
    expect(fingerprint(b)).toBe(fingerprint(a));
  });
});
