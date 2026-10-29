// @vitest-environment happy-dom
//
// LABELS ET DÉCORATIONS NE PARTAGENT JAMAIS UNE RANGÉE (§5.1).
//
// La barre était un unique conteneur `flex-wrap` : une seule suite de commandes, que la
// largeur disponible coupait où elle voulait. Sur une boîte de commentaire GitHub, le
// dernier bouton de label se retrouvait à côté du sélecteur de décoration — deux gestes de
// natures différentes rendus comme s'ils appartenaient à la même famille (retour
// utilisateur). Retirer les icônes des boutons recule ce seuil ; il ne le supprime pas.
//
// La règle tient en DEUX moitiés, dans deux fichiers, et aucune ne sépare quoi que ce soit
// sans l'autre : le DOM (deux `.cct-toolbar-row`) et le CSS (`flex-direction: column` sur
// `.cct-toolbar`). Sans la seconde, les deux rangées sont deux éléments en ligne que la
// largeur réunit dès qu'elle le peut — l'invariant serait rendu faux sans qu'aucune
// assertion sur le DOM ne bouge. Ce fichier lit donc les deux.
//
// Ce qu'il NE PEUT PAS voir, et qui doit rester écrit ici : happy-dom ne fait aucune mise en
// page (`getBoundingClientRect()` y rend des zéros), donc rien de ce qui suit ne mesure une
// rangée à l'écran. La lecture du CSS est TEXTUELLE — même technique que badge-sizing.test.ts
// et pour la même raison. C'est un vrai navigateur qui l'a mesuré, une fois, à la main.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from '@cct/core';
import { buildToolbar } from '../src/ui/toolbar.js';

const css = readFileSync(resolve(process.cwd(), 'packages/extension/src/styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ' '
);

function ruleBody(selector: string): string {
  const re = new RegExp(selector.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}');
  const m = re.exec(css);
  if (!m) throw new Error(`règle ${selector} introuvable dans styles.css`);
  return m[1]!;
}

function toolbar(config = defaultConfig()): HTMLElement {
  return buildToolbar({
    config,
    lang: 'fr',
    onLabel: () => {},
    onFreeDecoration: () => {},
    currentPrefix: () => ({
      hasPrefix: false,
      label: null,
      writtenLabel: null,
      decorations: [],
      malformedDecorations: false,
    }),
  }).element;
}

/** La rangée qui contient cet élément — ce que l'écran appellerait « sa ligne ». */
const rowOf = (el: Element | null): Element | null => el?.closest('.cct-toolbar-row') ?? null;

describe('§5.1 — la barre d’outils empile ses rangées', () => {
  it('aucun bouton de label ne partage sa rangée avec une commande de décoration', () => {
    const config = defaultConfig();
    // TOUS les labels livrés, optionnels et de réponse compris (§3.2) : c'est le cas qui déborde
    // le plus, et il grandit avec la configuration plutôt qu'avec un nombre écrit ici.
    for (const label of config.labels) label.enabled = true;
    const root = toolbar(config);

    const labelRows = new Set([...root.querySelectorAll('.cct-label-button')].map(rowOf));
    const decorationRows = new Set(
      [...root.querySelectorAll('.cct-decoration-group, .cct-free-decoration')].map(rowOf)
    );
    // Deux rangées de labels — les remarques, puis les réponses (CA-48) —, une de décorations.
    expect(labelRows.size).toBe(2);
    expect(decorationRows.size).toBe(1);
    for (const row of labelRows) expect(decorationRows.has(row)).toBe(false);
    // Aucune des deux n'est `null` : un `closest()` qui ne trouve rien rendrait deux
    // ensembles à un seul élément, `null` et `null`, et les deux assertions ci-dessus
    // passeraient sur une barre entièrement plate.
    expect([...labelRows, ...decorationRows].every((r) => r !== null)).toBe(true);
  });

  it('le sélecteur segmenté et le champ libre restent ENSEMBLE sur la rangée des décorations', () => {
    // Ce sont deux façons de dire la même chose (§5.1) : les séparer serait aussi faux que
    // de mêler un label aux décorations.
    const root = toolbar();
    const row = rowOf(root.querySelector('.cct-decoration-group'));
    // Non nul d'abord : sans rangée du tout, les deux `closest()` rendent `null` et
    // l'égalité ci-dessous serait vraie sur une barre entièrement plate — vérifié en
    // retirant la moitié DOM de la règle, où ce test passait seul contre trois.
    expect(row).not.toBeNull();
    expect(rowOf(root.querySelector('.cct-free-decoration'))).toBe(row);
  });

  it('les rangées ne sont que de la mise en page : l’arbre d’accessibilité reste celui d’avant', () => {
    // `role="none"` sur les deux boîtes — sans lui, deux conteneurs génériques s'intercalent
    // entre le `role="toolbar"` et ses commandes.
    const root = toolbar();
    const rows = [...root.querySelectorAll('.cct-toolbar-row')];
    expect(rows).toHaveLength(3); // remarques, réponses, décorations
    for (const row of rows) expect(row.getAttribute('role')).toBe('none');
    expect(root.getAttribute('role')).toBe('toolbar');
  });

  it('la moitié CSS de la règle : la barre empile, la rangée seule se replie', () => {
    // Sans `column`, les deux rangées redeviennent des éléments en ligne que la largeur
    // réunit — le DOM ci-dessus resterait pourtant vrai, mot pour mot.
    expect(ruleBody('.cct-toolbar')).toMatch(/flex-direction\s*:\s*column/);
    expect(ruleBody('.cct-toolbar')).not.toMatch(/flex-wrap\s*:\s*wrap/);
    // Et la rangée, elle, se replie sur elle-même : tous les labels sur une fenêtre étroite
    // passent à la ligne DANS leur rangée, sans jamais rejoindre celle des décorations.
    expect(ruleBody('.cct-toolbar-row')).toMatch(/flex-wrap\s*:\s*wrap/);
  });
});

// CA-48 — la STRUCTURE des deux groupes (§5.1). La géométrie — les réponses sous la dernière
// remarque, jamais à côté, et le trait entre les deux, à toutes les largeurs — est mesurée dans
// un vrai navigateur par `npm run check:composer-layout`.
describe('CA-48 — les réponses sur leur propre ligne, sous un trait', () => {
  const resolved = (doc: object) =>
    resolveConfig(null, { status: 'absent' }, { status: 'found', text: JSON.stringify(doc) }, null, false).config;
  const labelsIn = (root: Element) =>
    [...root.querySelectorAll('.cct-label-button')].map((b) => (b as HTMLElement).dataset['label']);

  it('les labels `remark` — `reviewed` compris —, puis une rangée `reply` à part, puis les décorations', () => {
    const bar = toolbar();
    const [labels, replies, decorations] = [...bar.querySelectorAll('.cct-toolbar-row')];
    expect(replies!.classList.contains('cct-reply-row')).toBe(true);
    expect(labelsIn(labels!)).toEqual([
      'praise', 'nitpick', 'suggestion', 'issue', 'todo', 'question', 'thought', 'chore', 'note', 'typo', 'polish', 'quibble',
      'reviewed',
    ]);
    expect(labelsIn(replies!)).toEqual(['thanks', 'done', 'ack', 'decision', 'disagree']);
    expect(decorations!.querySelector('.cct-label-button')).toBeNull();
    expect(decorations!.classList.contains('cct-decoration-row')).toBe(true);
  });

  it('le type range le bouton, pas son identifiant', () => {
    const bar = toolbar(resolved({ labels: [{ id: 'merci', kind: 'reply' }, { id: 'done', kind: 'remark' }] }));
    const [labels, replies] = [...bar.querySelectorAll('.cct-toolbar-row')];
    expect(labelsIn(replies!)).toEqual(['thanks', 'ack', 'decision', 'disagree', 'merci']);
    expect(labelsIn(labels!)).toContain('done');
  });

  it('sans label `reply` actif, ni rangée ni trait simple ; le double trait des décorations reste', () => {
    const bar = toolbar(resolved({ labels: ['thanks', 'done', 'ack', 'decision', 'disagree'].map((id) => ({ id, enabled: false })) }));
    expect(bar.querySelectorAll('.cct-toolbar-row')).toHaveLength(2);
    expect(bar.querySelector('.cct-reply-row')).toBeNull();
    expect(bar.querySelector('.cct-decoration-row')).not.toBeNull();
  });

  it('sans label `remark` actif, la rangée des réponses n’a pas de trait : il ne séparerait rien', () => {
    const remarks = defaultConfig().labels.filter((l) => l.kind === 'remark').map((l) => ({ id: l.id, enabled: false }));
    const bar = toolbar(resolved({ labels: remarks }));
    expect(labelsIn(bar)).toEqual(['thanks', 'done', 'ack', 'decision', 'disagree']);
    expect(bar.querySelector('.cct-reply-row')).toBeNull();
  });

  it('moitié CSS : trait simple au-dessus des réponses, double au-dessus des décorations, sur toute la largeur', () => {
    const row = ruleBody('.cct-reply-row');
    expect(row).toMatch(/border-top:\s*1px solid/);
    expect(row).toMatch(/align-self:\s*stretch/);
    const decorations = ruleBody('.cct-decoration-row');
    expect(decorations).toMatch(/border-top:\s*3px double/);
    expect(decorations).toMatch(/align-self:\s*stretch/);
  });
});
