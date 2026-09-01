// @vitest-environment happy-dom
// Non-régression des écarts confirmés par la revue adversariale du composant A.

import { describe, expect, it } from 'vitest';
import { computePrefixInsertion } from '@cct/adapter-shared';
import { defaultConfig, type ConfigRead, type PrRef } from '@cct/core';
import { ClientConfigResolver } from '../src/config-resolver.js';
import type { PlatformAdapter } from '@cct/adapter-shared';

describe('écart A — §3.4.1 : l’insertion de préfixe vise la ligne de préfixe, pas la première ligne', () => {
  it('cliquer un label sous une citation n’écrase jamais la citation', () => {
    const { nextValue } = computePrefixInsertion('> du code cité\nle nom est ambigu', {
      label: 'issue',
      decorations: [],
    });
    expect(nextValue).toBe('> du code cité\nissue: le nom est ambigu');
  });

  it('remplace le préfixe existant situé sous un bloc délimité', () => {
    const { nextValue } = computePrefixInsertion('```\ncode\n```\nissue: le nom est ambigu', {
      label: 'todo',
      decorations: [],
    });
    expect(nextValue).toBe('```\ncode\n```\ntodo: le nom est ambigu');
  });

  it('corps entièrement cité : nouvelle première ligne, contenu conservé', () => {
    const { nextValue } = computePrefixInsertion('> tout est cité', { label: 'note', decorations: [] });
    expect(nextValue).toBe('note: \n> tout est cité');
  });

  it('toggle : le label seul décide, pas l’état du sélecteur de décoration (§5.1)', () => {
    const { nextValue, removed } = computePrefixInsertion(
      'issue (blocking): le nom est ambigu',
      { label: 'issue', decorations: [] }, // sélecteur sur « aucune »
      { toggle: true }
    );
    expect(removed).toBe(true);
    expect(nextValue).toBe('le nom est ambigu');
  });
});

describe('résidu A — §3.4.1 étapes 4-6 : le préfixe existant est reconnu comme la validation le reconnaît', () => {
  it('ligne de préfixe indentée (CA-18) : remplacement, jamais un second préfixe', () => {
    const { nextValue } = computePrefixInsertion('   issue: le nom est ambigu\n\nDétail.', {
      label: 'todo',
      decorations: [],
    });
    expect(nextValue).toBe('   todo: le nom est ambigu\n\nDétail.');
  });

  it('toggle sur une ligne indentée : le préfixe est retiré, la tête conservée', () => {
    const { nextValue, removed } = computePrefixInsertion(
      '   issue: le nom est ambigu',
      { label: 'issue', decorations: [] },
      { toggle: true }
    );
    expect(removed).toBe(true);
    expect(nextValue).toBe('   le nom est ambigu');
  });

  it('BOM de tête (corpus bom-at-head) : remplacement, BOM conservé', () => {
    const { nextValue } = computePrefixInsertion('\uFEFFissue: le nom est ambigu', {
      label: 'todo',
      decorations: [],
    });
    expect(nextValue).toBe('\uFEFFtodo: le nom est ambigu');
  });

  it('emoji de tête toléré (§3.4.2) : décoration conservée, emoji conservé', () => {
    const { nextValue } = computePrefixInsertion('\u{1F41B} issue (blocking): x', {
      label: 'todo', // décorations non spécifiées : clic sur un label, donc conservation (CA-02)
    });
    expect(nextValue).toBe('\u{1F41B} todo (blocking): x');
  });

  it('toggle avec emoji de tête : le préfixe est retiré, jamais empilé', () => {
    const { nextValue, removed } = computePrefixInsertion(
      '\u{1F41B} issue (blocking): x',
      { label: 'issue', decorations: [] },
      { toggle: true }
    );
    expect(removed).toBe(true);
    expect(nextValue).toBe('\u{1F41B} x');
  });

  it('changedAt : une insertion sous une citation ne décale pas les positions de la citation (CA-02)', () => {
    const { changedAt, delta } = computePrefixInsertion('> du code cité\nle nom est ambigu', {
      label: 'issue',
      decorations: [],
    });
    expect(changedAt).toBe('> du code cité\n'.length); // la citation, avant, ne bouge pas
    expect(delta).toBe('issue: '.length);
  });

  it('changedAt : un corps entièrement cité se décale du préfixe ET du saut de ligne', () => {
    const { nextValue, delta, changedAt } = computePrefixInsertion('> tout est cité', {
      label: 'note',
      decorations: [],
    });
    expect(nextValue).toBe('note: \n> tout est cité');
    expect(changedAt).toBe(0);
    expect(delta).toBe('note: '.length + 1);
  });
});

describe('écart A — §5.4 cond. 4 : une lecture unreachable n’est jamais masquée par le cache', () => {
  const pr: PrRef = {
    platform: 'github',
    createdAt: '2026-10-01T00:00:00Z',
    host: 'github.com',
    scope: ['acme', 'demo'],
    number: 42,
  };

  function makeAdapter(read: () => Promise<ConfigRead>): PlatformAdapter {
    return {
      matches: () => true,
      platformProfile: () => ({ id: 'github', suggestionInfoString: null }),
      getRepoConfig: read,
      getOrgConfig: async () => ({ status: 'absent' }),
      observeEditors: () => ({ dispose: () => {} }),
      getSubmitControls: () => [],
      readValue: () => '',
      writeValue: () => {},
      getThreads: async () => [],
      getCompletionControl: () => null,
      getCurrentUser: async () => ({ id: 'u', login: 'u', isServiceAccount: false }),
      readPublishedResult: () => null,
    };
  }

  it('repli sur le NIVEAU INFÉRIEUR (§8.1.5), état dégradé signalé — jamais la valeur expirée du même niveau', async () => {
    let now = 0;
    const resolver = new ClientConfigResolver(async () => null, () => now);
    let fail = false;
    const adapter = makeAdapter(async () =>
      fail
        ? { status: 'unreachable', reason: 'down' }
        : { status: 'found', text: JSON.stringify({ mode: 'enforce' }) }
    );

    const first = await resolver.resolve(adapter, pr);
    expect(first.degraded).toBe(false);
    expect(first.config.mode).toBe('enforce');

    // Le cache expire, puis la route tombe : « repli sur le niveau inférieur, en état
    // dégradé » (§8.1.5, §9.2.3) — organisation absente ici, donc les défauts produit.
    // Réutiliser la valeur expirée ferait énoncer des diagnostics au nom d'une règle
    // que l'extension n'a pas pu relire.
    now += 3601 * 1000;
    fail = true;
    const second = await resolver.resolve(adapter, pr);
    expect(second.config.mode).toBe('assist'); // niveau inférieur : défauts produit
    expect(second.degraded).toBe(true); // jamais masqué

    // La lecture impossible n'est pas mise en cache : la panne terminée, la lecture
    // suivante rétablit la configuration du dépôt et lève l'état dégradé.
    now += 1000;
    fail = false;
    const third = await resolver.resolve(adapter, pr);
    expect(third.config.mode).toBe('enforce');
    expect(third.degraded).toBe(false);
  });
});

describe('écart A — §5.2 : la table des abréviations ne fuit pas le prototype', () => {
  it('les clés héritées (constructor, toString) ne sont pas des abréviations', () => {
    const abbr = defaultConfig().shortcuts.abbreviations;
    expect(Object.hasOwn(abbr, 'constructor')).toBe(false);
    expect(Object.hasOwn(abbr, '?i')).toBe(true);
  });
});
