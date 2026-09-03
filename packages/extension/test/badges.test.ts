// @vitest-environment happy-dom
// Masquage du préfixe structuré à l'affichage (§5.5) : `decorateComment()` retire de la vue
// le "label (décorations): " en tête d'un commentaire déjà publié, dont l'information est
// désormais portée par les badges — jamais le corps STOCKÉ côté serveur, qu'aucune de ces
// écritures n'atteint (badges.ts, applyPrefixVisibility). Couvre le cas sûr (préfixe entier
// dans le premier nœud de texte) et les replis défensifs (§9.4) quand il ne l'est pas.

import { afterEach, describe, expect, it } from 'vitest';
import { commentBodyText } from '@cct/adapter-shared';
import { defaultConfig } from '@cct/core';
import { decorateComment } from '../src/ui/badges.js';

const profile = { id: 'github', suggestionInfoString: 'suggestion' };

describe('decorateComment() — masquage du préfixe structuré (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('masque "label: " en tête, laisse le sujet visible', () => {
    const body = 'praise: nice work';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const hidden = el.querySelector('.cct-hidden-prefix');
    expect(hidden?.textContent).toBe('praise: ');
    // Le texte visible restant est un nœud FRÈRE du span masqué, pas son enfant.
    expect(hidden?.nextSibling?.textContent).toBe('nice work');
  });

  it('masque "label (décorations): " en entier, parenthèses comprises', () => {
    const body = 'issue (blocking): fix this';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const hidden = el.querySelector('.cct-hidden-prefix');
    expect(hidden?.textContent).toBe('issue (blocking): ');
    expect(hidden?.nextSibling?.textContent).toBe('fix this');
  });

  it('ne modifie jamais ce que commentBodyText() relit (§5.5) — analyze() reste correct au tour suivant', () => {
    const body = 'issue (blocking, security): fuite mémoire';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).not.toBeNull();
    expect(commentBodyText(el)).toBe(body); // badges ET préfixe masqué exclus de la relecture
  });

  it('idempotent : un second rendu à corps inchangé ne double pas le wrapper ni ne le retouche', () => {
    const body = 'praise: nice work';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');
    const first = el.querySelector('.cct-hidden-prefix');

    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll('.cct-hidden-prefix')).toHaveLength(1);
    expect(el.querySelector('.cct-hidden-prefix')).toBe(first); // même nœud, pas reconstruit
  });

  it('révèle le préfixe quand la résolution est perdue sur un changement de configuration en direct (§8.1.1)', () => {
    const body = 'praise: nice work';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');
    expect(el.querySelector('.cct-hidden-prefix')).not.toBeNull();

    const disabled = defaultConfig();
    disabled.labels.find((l) => l.id === 'praise')!.enabled = false;
    decorateComment(el, body, disabled, profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.textContent).toBe(body); // texte complet reconstitué, rien perdu
  });

  it('renonce quand le préfixe déborde du premier nœud de texte (émoji ou mise en forme imbriquée avant le ":")', () => {
    const body = 'issue (blocking): fix this';
    const el = document.createElement('div');
    el.innerHTML = '<em>issue</em> (blocking): fix this'; // premier nœud de texte : "issue" seul, 5 caractères
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.querySelector(':scope > .cct-badge-label')).not.toBeNull(); // les badges, eux, se posent normalement
  });

  it('renonce quand un BOM interne rendrait la correspondance ligne brute/normalisée incertaine', () => {
    const body = 'issue (\uFEFFblocking): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.querySelector(':scope > .cct-badge-label')).not.toBeNull(); // analyze() le résout quand même
  });

  it('renonce plutôt que de laisser un commentaire sans aucun texte visible (sujet vide)', () => {
    const body = 'issue:';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.textContent).toContain('issue:');
  });

  it('renonce quand une ligne vide précède le préfixe (hors du cas simple couvert)', () => {
    const body = '\nissue: fix this';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });
});
