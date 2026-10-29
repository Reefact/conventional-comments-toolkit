// @vitest-environment happy-dom
//
// L'INFOBULLE D'UN LABEL : DEUX QUESTIONS, DEUX TEXTES.
//
// Le bouton répond à qui écrit — « quand employer ce label ? » : une consigne d'emploi, puis
// l'exemple (§5.1). Le badge répond à qui lit — « que me dit ce commentaire ? » : une
// signification, sans exemple, puisque le commentaire est sous ses yeux (§5.5). Les deux passent
// par `labelTooltip()`, et ce fichier les tient ensemble.
//
// Le curseur du badge est une affirmation de CSS : lue dans le texte de styles.css, comme le
// fait badge-sizing.test.ts, et non dans un `getComputedStyle` happy-dom.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig, type EffectiveConfig } from '@cct/core';
import { buildToolbar } from '../src/ui/toolbar.js';
import { labelTooltip, ui } from '../src/ui/strings.js';
import { decorateWithHtmlShape } from './helpers/decorate.js';

const profile = { id: 'github', suggestionInfoString: 'suggestion' };

function withCustomLabel(): EffectiveConfig {
  const config = defaultConfig();
  config.labels.push({ ...config.labels[0]!, id: 'risk', aliases: [], enabled: true });
  return config;
}

function badgeOf(body: string, config: EffectiveConfig, lang: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = body;
  document.body.append(el);
  decorateWithHtmlShape(el, body, config, profile, lang);
  const badge = el.querySelector<HTMLElement>('.cct-badge-label');
  if (badge === null) throw new Error(`aucun badge de label pour « ${body} »`);
  return badge;
}

function buttonOf(id: string, config: EffectiveConfig, lang: string): HTMLButtonElement {
  const element = buildToolbar({
    config,
    lang,
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
  const button = element.querySelector<HTMLButtonElement>(`.cct-label-button[data-label="${id}"]`);
  if (button === null) throw new Error(`aucun bouton pour ${id}`);
  return button;
}

describe('infobulle d’un label — le bouton dit quand l’employer, le badge ce qu’il signifie (§5.1, §5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('le badge d’un label livré porte sa signification, sans exemple, dans la langue de l’interface', () => {
    const fr = badgeOf('ack: bien noté', defaultConfig(), 'fr');
    expect(fr.title).toBe(ui('fr', 'badge.label.ack'));
    expect(fr.title).not.toContain(ui('fr', 'example.ack'));
    expect(badgeOf('ack: noted', defaultConfig(), 'en').title).toBe(ui('en', 'badge.label.ack'));
  });

  it('le bouton d’un label livré porte sa consigne d’emploi, puis l’exemple', () => {
    const title = buttonOf('ack', defaultConfig(), 'fr').title;
    expect(title).toBe(`${ui('fr', 'label.ack')}\n${ui('fr', 'label.example', { example: ui('fr', 'example.ack') })}`);
  });

  it('chaque label livré a ses deux textes, distincts, dans les deux langues', () => {
    for (const lang of ['fr', 'en']) {
      for (const { id } of defaultConfig().labels) {
        const badge = labelTooltip(lang, { id }, 'badge');
        const button = labelTooltip(lang, { id }, 'button');
        expect(badge, `${lang} ${id}`).not.toBeNull();
        expect(button, `${lang} ${id}`).not.toBeNull();
        expect(badge, `${lang} ${id}`).not.toBe(button);
        expect(badge, `${lang} ${id}`).not.toContain(`badge.label.${id}`);
      }
    }
  });

  it('un label qu’aucune source ne décrit n’a pas d’infobulle — jamais la clé « label.risk »', () => {
    const config = withCustomLabel();
    expect(labelTooltip('fr', { id: 'risk' }, 'badge')).toBeNull();
    expect(labelTooltip('fr', { id: 'risk' }, 'button')).toBeNull();
    expect(badgeOf('risk: le nom est ambigu', config, 'fr').hasAttribute('title')).toBe(false);
    expect(buttonOf('risk', config, 'fr').hasAttribute('title')).toBe(false);
  });
});

describe('`labels[].description` et `labels[].usage` — ce que la configuration écrit (§8.2)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function written(id: string, fields: { description?: string; usage?: string }): EffectiveConfig {
    const config = id === 'risk' ? withCustomLabel() : defaultConfig();
    Object.assign(config.labels.find((l) => l.id === id)!, fields);
    return config;
  }

  it('`description` seule sert aux deux surfaces — le comportement de 1.0.0-beta.14', () => {
    const config = written('risk', { description: 'Risque de régression à évaluer avant fusion.' });
    expect(badgeOf('risk: le cache change de clé', config, 'fr').title).toBe('Risque de régression à évaluer avant fusion.');
    expect(buttonOf('risk', config, 'fr').title).toBe('Risque de régression à évaluer avant fusion.');
  });

  it('`usage` va au bouton, `description` au badge', () => {
    const config = written('risk', { description: 'Un risque de régression relevé.', usage: 'Signaler un risque de régression.' });
    expect(badgeOf('risk: le cache change de clé', config, 'fr').title).toBe('Un risque de régression relevé.');
    expect(buttonOf('risk', config, 'fr').title).toBe('Signaler un risque de régression.');
  });

  it('écrites sur un label livré, elles REMPLACENT le catalogue, exemple compris', () => {
    const config = written('issue', { description: 'Chez nous : un défaut qui casse un contrat.', usage: 'Signaler un contrat cassé.' });
    expect(badgeOf('issue: x y z', config, 'fr').title).toBe('Chez nous : un défaut qui casse un contrat.');
    expect(buttonOf('issue', config, 'fr').title).toBe('Signaler un contrat cassé.');
  });

  it('`usage` seule ne touche que le bouton : le badge garde la signification du catalogue', () => {
    const config = written('issue', { usage: 'Signaler un contrat cassé.' });
    expect(buttonOf('issue', config, 'fr').title).toBe('Signaler un contrat cassé.');
    expect(badgeOf('issue: x y z', config, 'fr').title).toBe(ui('fr', 'badge.label.issue'));
  });

  it('vide, chacune retire l’infobulle de sa surface — même d’un label que le catalogue décrit', () => {
    const noBadge = written('ack', { description: '' });
    expect(badgeOf('ack: bien noté', noBadge, 'fr').hasAttribute('title')).toBe(false);
    // `description` vide, sans `usage` : le bouton la prend en repli, et n'a donc rien non plus.
    expect(buttonOf('ack', noBadge, 'fr').hasAttribute('title')).toBe(false);

    const noButton = written('ack', { usage: '' });
    expect(buttonOf('ack', noButton, 'fr').hasAttribute('title')).toBe(false);
    expect(badgeOf('ack: bien noté', noButton, 'fr').title).toBe(ui('fr', 'badge.label.ack'));
  });

  it('absentes, le label livré garde les textes du catalogue', () => {
    expect(defaultConfig().labels.every((l) => l.description === undefined && l.usage === undefined)).toBe(true);
    expect(badgeOf('issue: x y z', defaultConfig(), 'fr').title).toBe(ui('fr', 'badge.label.issue'));
  });

  it('un changement de description en direct rafraîchit le badge déjà posé', () => {
    const el = document.createElement('div');
    el.textContent = 'issue: x y z';
    document.body.append(el);
    decorateWithHtmlShape(el, 'issue: x y z', defaultConfig(), profile, 'fr');
    decorateWithHtmlShape(el, 'issue: x y z', written('issue', { description: 'Autre signification.' }), profile, 'fr');
    const badges = el.querySelectorAll<HTMLElement>('.cct-badge-label');
    expect(badges).toHaveLength(1);
    expect(badges[0]!.title).toBe('Autre signification.');
  });
});

describe('curseur du badge (§5.5)', () => {
  const css = readFileSync(resolve(process.cwd(), 'packages/extension/src/styles.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ' '
  );

  it('le badge garde la flèche au survol, pas la barre de sélection de texte', () => {
    const rule = /\.cct-badge\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/cursor\s*:\s*default\s*;/);
  });
});
