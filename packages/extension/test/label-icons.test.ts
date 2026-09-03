// @vitest-environment happy-dom
//
// L'ICÔNE D'UN LABEL : SUR LE BADGE, JAMAIS SUR LE BOUTON.
//
// Les deux surfaces rendent le même label, et la même configuration leur donne la même
// icône — `labels[].icon` (§8.2). Elles n'en font pourtant pas le même usage, et c'est
// délibéré : le badge d'un commentaire publié la porte (§5.5, docs/badges-decoration-
// mockup.html), le bouton de la barre d'outils ne la porte pas, parce qu'il est un élément
// d'une RANGÉE dont chaque pixel pris l'est à tous les autres — dix boutons par défaut,
// treize labels optionnels activés (§3.2) — et que ces icônes suffisaient à renvoyer le
// dernier label sur la rangée du sélecteur de décoration (retour utilisateur).
//
// Rien dans le code ne relie ces deux décisions : elles vivent dans deux modules, et la plus
// naturelle des « harmonisations » les réunirait dans un sens ou dans l'autre. Ce fichier les
// tient ENSEMBLE, pour que la moitié qui bougerait sans l'autre se voie.

import { describe, expect, it, afterEach } from 'vitest';
import { defaultConfig } from '@cct/core';
import { buildToolbar } from '../src/ui/toolbar.js';
import { decorateComment } from '../src/ui/badges.js';

const profile = { id: 'github', suggestionInfoString: 'suggestion' };

/** L'icône que la configuration par défaut donne à `issue` — le test ne vaut que si elle
 * existe vraiment : sans elle, « le bouton ne porte pas d'icône » serait vrai sans que le
 * code y soit pour rien. */
const ISSUE_ICON = '\u{1F528}';

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

describe('icônes de label — le bouton s’en passe, le badge la garde', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('la configuration par défaut donne bien une icône à chaque label (sans quoi les deux tests suivants ne prouveraient rien)', () => {
    const config = defaultConfig();
    expect(config.labels.find((l) => l.id === 'issue')?.icon).toBe(ISSUE_ICON);
    expect(config.labels.every((l) => (l.icon ?? '').length > 0)).toBe(true);
  });

  it('§5.1 — un bouton de label affiche son seul identifiant, jamais son icône', () => {
    const root = toolbar();
    const issue = root.querySelector('.cct-label-button[data-label="issue"]');
    // Égalité stricte, pas un `not.toContain` : c'est la largeur du bouton qui est en jeu,
    // donc tout ce qu'il affiche, espace de séparation compris.
    expect(issue?.textContent).toBe('issue');
  });

  it('§5.1 — AUCUN bouton de la barre ne porte l’icône de son label', () => {
    const config = defaultConfig();
    // Les labels optionnels aussi (§3.2) : c'est la rangée entière qui doit tenir, et un
    // dépôt qui les active a exactement le problème que ce choix règle.
    for (const label of config.labels) label.enabled = true;
    const root = toolbar(config);
    const buttons = [...root.querySelectorAll('.cct-label-button')] as HTMLElement[];
    expect(buttons).toHaveLength(config.labels.length);
    for (const button of buttons) {
      const label = config.labels.find((l) => l.id === button.dataset['label']);
      expect(label, `bouton ${button.dataset['label']} hors configuration`).toBeDefined();
      expect(button.textContent).toBe(label!.id);
    }
  });

  it('§5.5 — le badge d’un commentaire publié, lui, porte toujours l’icône', () => {
    const body = 'issue: le nom est ambigu';
    const el = document.createElement('div');
    el.textContent = body;
    document.body.appendChild(el);
    decorateComment(el, body, defaultConfig(), profile, 'fr');

    expect(el.querySelector('.cct-badge-label')?.textContent).toBe(`${ISSUE_ICON} issue`);
  });
});
