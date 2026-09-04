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
import { defaultConfig } from '@cct/core';
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
    // Les labels optionnels aussi (§3.2) : treize boutons, c'est le cas qui déborde le plus.
    for (const label of config.labels) label.enabled = true;
    const root = toolbar(config);

    const labelRows = new Set([...root.querySelectorAll('.cct-label-button')].map(rowOf));
    const decorationRows = new Set(
      [...root.querySelectorAll('.cct-decoration-group, .cct-free-decoration')].map(rowOf)
    );
    expect(labelRows.size).toBe(1);
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
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.getAttribute('role')).toBe('none');
    expect(root.getAttribute('role')).toBe('toolbar');
  });

  it('la moitié CSS de la règle : la barre empile, la rangée seule se replie', () => {
    // Sans `column`, les deux rangées redeviennent des éléments en ligne que la largeur
    // réunit — le DOM ci-dessus resterait pourtant vrai, mot pour mot.
    expect(ruleBody('.cct-toolbar')).toMatch(/flex-direction\s*:\s*column/);
    expect(ruleBody('.cct-toolbar')).not.toMatch(/flex-wrap\s*:\s*wrap/);
    // Et la rangée, elle, se replie sur elle-même : treize labels sur une fenêtre étroite
    // passent à la ligne DANS leur rangée, sans jamais rejoindre celle des décorations.
    expect(ruleBody('.cct-toolbar-row')).toMatch(/flex-wrap\s*:\s*wrap/);
  });
});
