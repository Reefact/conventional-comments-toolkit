// @vitest-environment happy-dom
// La forme du HTML rendu (§5.5, §9.2.3 `renderedBodyShape`) est CONSULTÉE, pas décorative.
//
// `decorateComment()` a longtemps écrit `'P'` et `'BR'` en dur, à quatre endroits : des faits
// mesurés sur github.com, appliqués à toute plateforme. C'est la seule fuite de nom dont
// l'absence produisait un rendu FAUX plutôt qu'un renoncement propre — sur un corps où la fin
// de ligne n'est pas un `<br>`, la borne du sujet ne se déclenche jamais et un frère entier
// passe dans le sujet, donc en gras avec tout ce qui le suit.
//
// Ces tests fournissent une forme DIFFÉRENTE de celle de GitHub et vérifient que le rendu
// suit. Sans eux, le paramètre pourrait être ignoré sans que rien ne le dise : les quelque
// quatre-vingt-dix autres appels s'appuient sur le défaut et passeraient à l'identique.

import { afterEach, describe, expect, it } from 'vitest';
import { commentBodyText, MARKDOWN_HTML_BODY_SHAPE, type RenderedBodyShape } from '@cct/adapter-shared';
import { defaultConfig } from '@cct/core';
import { decorateComment } from '../src/ui/badges.js';

const profile = { id: 'github', suggestionInfoString: 'suggestion' };

/** Une plateforme hypothétique dont le rendu enveloppe ses lignes dans `<div>` et matérialise
 * les fins de ligne par `<hr>`. Elle n'existe pas, et c'est voulu : ce qu'on teste est que le
 * code partagé OBÉIT à la réponse de l'adaptateur, pas qu'une plateforme réelle réponde ceci.
 * Inventer une forme plausible d'Azure DevOps serait précisément l'affirmation non mesurée que
 * tout ce chantier retire du code. */
const OTHER_SHAPE: RenderedBodyShape = Object.freeze({
  paragraphTags: Object.freeze(['DIV']),
  lineBreakTag: 'HR',
});

describe('§5.5 — la forme du corps rendu vient de la plateforme, pas d’une constante', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('masque le préfixe dans le conteneur que la plateforme déclare, pas dans un <p>', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div>issue: le nom est ambigu</div>';
    document.body.appendChild(el);

    // Avec la forme de GitHub, ce `<div>` n'est pas un conteneur de paragraphe reconnu : le
    // masquage RENONCE, ce qui est l'issue sûre (§9.4, CA-11).
    decorateComment(el, 'issue: le nom est ambigu', defaultConfig(), profile, 'en', MARKDOWN_HTML_BODY_SHAPE);
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('…et masque bien quand la plateforme déclare ce conteneur', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div>issue: le nom est ambigu</div>';
    document.body.appendChild(el);

    decorateComment(el, 'issue: le nom est ambigu', defaultConfig(), profile, 'en', OTHER_SHAPE);
    expect(el.querySelector('.cct-hidden-prefix')?.textContent).toBe('issue: ');
  });

  it('borne le sujet sur la fin de ligne que la plateforme déclare', () => {
    // Le corps porte les DEUX marqueurs : un `<hr>` d'abord, un `<br>` ensuite. La borne
    // retenue distingue donc réellement les deux formes, au lieu de constater qu'un rendu
    // s'affiche.
    const html = '<div>issue: le sujet<hr>après hr<br>après br</div>';

    const withOther = document.createElement('div');
    withOther.innerHTML = html;
    document.body.appendChild(withOther);
    decorateComment(withOther, 'issue: le sujet', defaultConfig(), profile, 'en', OTHER_SHAPE);
    const subject = withOther.querySelector('.cct-subject');
    expect(subject).not.toBeNull();
    // Le sujet s'arrête au `<hr>` : « après hr » n'y entre pas.
    expect(subject!.textContent).toBe('le sujet');
    expect(subject!.textContent).not.toContain('après hr');
  });

  it('un SECOND rendu sur une forme non-P n’accumule pas les badges, et le corps se relit', () => {
    // Le défaut que ce test verrouille (revue Reefact, PR #66) : `decorateComment` pose ses
    // badges dans le conteneur que la plateforme déclare, mais `OWN_BADGES` cherchait sous un
    // `<p>` écrit en dur. Sur une forme non-`P`, la relecture ne les retirait plus — leur texte
    // passait pour le corps — et le rendu suivant ne les retrouvait pas non plus, donc les
    // empilait.
    const el = document.createElement('div');
    el.innerHTML = '<div>issue: le nom est ambigu</div>';
    document.body.appendChild(el);

    decorateComment(el, 'issue: le nom est ambigu', defaultConfig(), profile, 'en', OTHER_SHAPE);
    const afterFirst = el.querySelectorAll('.cct-badge').length;
    expect(afterFirst).toBeGreaterThan(0);

    // Le corps relu ne doit contenir AUCUN texte de badge : c'est ce que `analyze()` recevra
    // au tour suivant, et un corps pollué casse la reconnaissance du préfixe.
    const reread = commentBodyText(el);
    expect(reread).toContain('issue: le nom est ambigu');
    expect(reread.trim()).toBe('issue: le nom est ambigu');

    // Second passage, corps relu comme en production : le compte ne bouge pas.
    decorateComment(el, reread, defaultConfig(), profile, 'en', OTHER_SHAPE);
    expect(el.querySelectorAll('.cct-badge').length).toBe(afterFirst);
  });

  it('forme INCONNUE (null) : le masquage renonce, les badges restent, le corps est entier', () => {
    // La réponse d'une plateforme dont le rendu n'a pas été mesuré — celle d'Azure DevOps
    // aujourd'hui (revue Reefact, PR #66). Deviner `<p>`/`<br>` serait plausible et non vérifié,
    // et une mauvaise borne fait glisser une partie de la discussion dans le sujet mis en avant.
    // Renoncer est la dégradation sûre du §9.4 (CA-11).
    const el = document.createElement('div');
    el.innerHTML = '<p>issue: le nom est ambigu<br>et la suite de la discussion</p>';
    document.body.appendChild(el);

    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en', null);

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.querySelector('.cct-subject')).toBeNull();
    // Les badges ne dépendent d'aucune des deux balises : ils restent posés.
    expect(el.querySelectorAll('.cct-badge').length).toBeGreaterThan(0);
    // Et le corps reste ENTIER — c'est ce que « renoncer » doit vouloir dire.
    expect(commentBodyText(el)).toContain('et la suite de la discussion');
  });

  it('une plateforme qui redevient INCONNUE défait le masquage déjà posé', () => {
    // Une plateforme peut passer de « mesurée » à « inconnue » entre deux rendus. Sauter l'appel
    // plutôt que de le faire avec `null` laisserait un préfixe masqué que plus rien n'entretient.
    const el = document.createElement('div');
    el.innerHTML = '<p>issue: le nom est ambigu</p>';
    document.body.appendChild(el);

    decorateComment(el, 'issue: le nom est ambigu', defaultConfig(), profile, 'en', MARKDOWN_HTML_BODY_SHAPE);
    expect(el.querySelector('.cct-hidden-prefix')).not.toBeNull();

    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en', null);
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(commentBodyText(el)).toContain('issue: le nom est ambigu');
  });

  it('le défaut nommé vaut exactement ce que le code écrivait en dur', () => {
    // Contre-épreuve du déplacement : les deux adaptateurs répondent aujourd'hui la même
    // chose, et le refactoring devait être à comportement RIGOUREUSEMENT nul. Si ce défaut
    // dérivait un jour, tous les autres tests de badges changeraient de sens en silence.
    expect(MARKDOWN_HTML_BODY_SHAPE.paragraphTags).toEqual(['P']);
    expect(MARKDOWN_HTML_BODY_SHAPE.lineBreakTag).toBe('BR');
  });
});
