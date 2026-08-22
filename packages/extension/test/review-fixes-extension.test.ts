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
      platformProfile: () => ({ id: 'github', suggestionInfoString: null, slashPrefixes: [] }),
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

  it('assiste avec la dernière valeur connue MAIS signale l’état dégradé', async () => {
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

    // Le cache expire, puis la route tombe : l'assistance continue avec la configuration
    // précédemment connue, mais le blocage est désarmé (état dégradé signalé).
    now += 3601 * 1000;
    fail = true;
    const second = await resolver.resolve(adapter, pr);
    expect(second.config.mode).toBe('enforce'); // dernière valeur connue
    expect(second.degraded).toBe(true); // jamais masqué
  });
});

describe('écart A — §5.2 : la table des abréviations ne fuit pas le prototype', () => {
  it('les clés héritées (constructor, toString) ne sont pas des abréviations', () => {
    const abbr = defaultConfig().shortcuts.abbreviations;
    expect(Object.hasOwn(abbr, 'constructor')).toBe(false);
    expect(Object.hasOwn(abbr, '?i')).toBe(true);
  });
});
