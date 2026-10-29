// @vitest-environment happy-dom
//
// L'INFOBULLE D'UN LABEL : SUR LE BOUTON ET SUR LE BADGE, LA MÊME.
//
// Le §5.1 la demandait au bouton de la barre d'outils ; le badge d'un commentaire publié (§5.5)
// est pourtant l'endroit où un lecteur rencontre un label qu'il ne connaît pas — `ack`,
// `quibble` —, bien plus souvent qu'en écrivant. Les deux passent par `labelTooltip()`, et ce
// fichier les tient ensemble, pour que l'une ne change pas sans l'autre.
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

describe('infobulle d’un label — badge et bouton disent la même chose (§5.1, §5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('le badge d’un label livré porte sa définition et son exemple, dans la langue de l’interface', () => {
    const fr = badgeOf('ack: bien noté', defaultConfig(), 'fr');
    expect(fr.title).toBe(labelTooltip('fr', 'ack'));
    expect(fr.title).toContain(ui('fr', 'label.ack'));
    expect(fr.title).toContain(ui('fr', 'label.example', { example: ui('fr', 'example.ack') }));

    const en = badgeOf('ack: noted', defaultConfig(), 'en');
    expect(en.title).toContain(ui('en', 'label.ack'));
  });

  it('le badge et le bouton d’un même label portent exactement la même infobulle', () => {
    for (const id of ['issue', 'reviewed', 'thanks']) {
      expect(badgeOf(`${id}: x y z`, defaultConfig(), 'fr').title).toBe(buttonOf(id, defaultConfig(), 'fr').title);
    }
  });

  it('un label qu’aucun catalogue ne décrit n’a pas d’infobulle — jamais la clé « label.risk »', () => {
    const config = withCustomLabel();
    expect(labelTooltip('fr', 'risk')).toBeNull();
    expect(badgeOf('risk: le nom est ambigu', config, 'fr').hasAttribute('title')).toBe(false);
    expect(buttonOf('risk', config, 'fr').hasAttribute('title')).toBe(false);
  });

  it('un label livré sans exemple garde sa définition seule', () => {
    expect(labelTooltip('fr', 'issue')).toContain(ui('fr', 'label.issue'));
    // Le garde porte sur la présence de l’exemple, pas sur la définition : une clé d’exemple
    // absente ne doit pas apparaître telle quelle.
    expect(labelTooltip('fr', 'issue')).not.toContain('example.issue');
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
