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

  it('avale une ligne vide en tête avec le préfixe, quand les deux vivent dans le même nœud de texte', () => {
    const body = '\nissue: fix this';
    const el = document.createElement('div');
    el.textContent = body; // un seul nœud de texte : "\nissue: " est un bandeau blanc unique
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')?.textContent).toBe('\nissue: ');
    expect(el.querySelector('.cct-hidden-prefix')?.nextSibling?.textContent).toBe('fix this');
  });

  it('masque le préfixe même quand il vit dans un <p> précédé d’un nœud de texte blanc FRÈRE (indentation GitHub réelle, PR #40)', () => {
    // Mesuré sur une vraie page github.com, pas une supposition : `.comment-body` porte un nœud
    // de texte "\n          " comme enfant DIRECT, avant le <p> qui contient le texte réel — un
    // décalage calculé sur la chaîne CONCATÉNÉE (bodyText) aurait scindé le <p> une dizaine de
    // caractères trop loin, corrompant le sujet, sans qu'aucun test à un seul nœud ne le voie.
    const el = document.createElement('td');
    el.innerHTML = '\n          <p dir="auto">issue (blocking, security): Manual rendering check.</p>\n';
    const body = el.textContent!; // "\n          issue (blocking, security): Manual rendering check.\n"
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const hidden = el.querySelector('.cct-hidden-prefix');
    expect(hidden?.textContent).toBe('issue (blocking, security): ');
    expect(hidden?.parentElement?.tagName).toBe('P'); // scindé DANS le <p>, pas dans le nœud blanc qui le précède
    expect(hidden?.nextSibling?.textContent).toBe('Manual rendering check.');
    expect(commentBodyText(el)).toBe(body); // le nœud blanc précédent, lui, n'a pas bougé
  });

  it('renonce quand le nœud de texte trouvé ne correspond pas à la ligne reconnue par analyze()', () => {
    // Un bloc de code délimité est écarté par analyze() (§3.4.1 étape 2) mais reste le premier
    // texte VISIBLE du DOM — s'il contenait par coïncidence un mot qui ressemble à un label,
    // le nœud trouvé ne doit jamais être confondu avec la ligne réellement reconnue.
    const el = document.createElement('div');
    el.innerHTML = '<pre><code>issue tracker note</code></pre><p>issue: fix this</p>';
    const body = '```\nissue tracker note\n```\nissue: fix this';
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector(':scope > .cct-badge-label')).not.toBeNull(); // le label est bien résolu…
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull(); // …mais rien n'est masqué pour autant
  });

  it('masque le préfixe même quand une mise en forme inline suit dans le sujet (revue Reefact, PR #40)', () => {
    // `expectedPrefix` (label + décorations + ":" + blancs) ne doit exiger l'égalité qu'avec
    // CETTE portion, jamais avec la ligne entière : dès qu'un `code`/lien/gras/mention suit le
    // préfixe, GitHub scinde la ligne sur un autre nœud DOM — cas courant, pas un cas limite.
    const el = document.createElement('div');
    el.innerHTML = '<p>issue: use <code>Foo</code></p>';
    const body = el.textContent!; // "issue: use Foo"
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const hidden = el.querySelector('.cct-hidden-prefix');
    expect(hidden?.textContent).toBe('issue: ');
    expect(hidden?.nextSibling?.textContent).toBe('use ');
    expect(el.querySelector('code')?.textContent).toBe('Foo'); // la mise en forme inline reste intacte
  });

  it('réentretient le masquage sur le chemin rapide, quand une réhydratation de plateforme a effacé le wrapper sans toucher aux badges (revue Reefact, PR #40)', () => {
    // Même risque que celui déjà pris en compte pour les badges de décoration eux-mêmes (revue
    // Codex, PR #38) : un remplacement partiel du sous-arbre natif peut laisser les badges CCT
    // intacts tout en faisant réapparaître le texte complet. Le chemin rapide (signature ET
    // compte de badges inchangés) ne doit pas laisser le préfixe démasqué pour autant.
    const body = 'praise: nice work';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');
    const badgeBefore = el.querySelector(':scope > .cct-badge-label');
    expect(el.querySelector('.cct-hidden-prefix')).not.toBeNull();

    // Réhydratation simulée : les badges (enfants directs) survivent, le reste (span masqué +
    // sujet) est remplacé par un nœud de texte neuf portant de nouveau le corps complet.
    const hidden = el.querySelector('.cct-hidden-prefix')!;
    const rest = hidden.nextSibling!;
    hidden.remove();
    rest.remove();
    el.appendChild(document.createTextNode(body));

    decorateComment(el, body, defaultConfig(), profile, 'en'); // même config, même corps

    expect(el.querySelector(':scope > .cct-badge-label')).toBe(badgeBefore); // badges inchangés : chemin rapide pris
    expect(el.querySelector('.cct-hidden-prefix')?.textContent).toBe('praise: '); // …le préfixe, lui, est remasqué
    expect(el.querySelector('.cct-hidden-prefix')?.nextSibling?.textContent).toBe('nice work');
  });
});
