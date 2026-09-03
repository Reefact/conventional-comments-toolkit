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

  it('laisse un émoji de tête visible, hors du span masqué — il est TOLÉRÉ en entrée mais IGNORÉ pour l’analyse, sans rapport avec l’icône du badge (revue Reefact, PR #40)', () => {
    const body = '🔥 issue: fix this';
    const el = document.createElement('div');
    el.textContent = body; // un seul nœud de texte : émoji, label et sujet y vivent tous ensemble
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const hidden = el.querySelector('.cct-hidden-prefix');
    expect(hidden?.textContent).toBe('issue: '); // l'émoji n'entre pas dans le masquage…
    expect(hidden?.previousSibling?.textContent).toBe('🔥 '); // …il reste un nœud FRÈRE visible…
    expect(hidden?.nextSibling?.textContent).toBe('fix this');
    expect(commentBodyText(el)).toBe(body); // …et rien n'est perdu pour la relecture au tour suivant
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

  it('ne masque jamais à l’intérieur d’un bloc de code — les délimiteurs ``` n’existent plus dans le texte RENDU (revue Reefact, PR #40)', () => {
    // bodyText vient de commentBodyText(), donc du DOM RENDU : les ``` de la source Markdown
    // ont disparu, absorbés par la mise en forme <pre><code> — analyze() (§3.4.1 étape 2, qui
    // cherche ces délimiteurs littéralement) peut alors traiter à tort le contenu d'un bloc de
    // code comme la ligne de préfixe. `body` est dérivé par commentBodyText(el), comme le fait
    // réellement l'adaptateur — jamais tapé à la main avec des fences qui n'existeraient plus.
    const el = document.createElement('div');
    el.innerHTML = '<pre><code>issue: fake</code></pre><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('pre')?.textContent).toBe('issue: fake'); // le code affiché reste intact
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('ne masque jamais à l’intérieur d’une citation — le marqueur ">" non plus n’existe plus dans le texte RENDU (revue Reefact, PR #40)', () => {
    // Même mécanisme que pour un bloc de code : QUOTE_RE (§3.4.1 étape 2) écarte une ligne
    // commençant par ">" dans la source, mais GitHub rend "> issue: fake" en
    // <blockquote><p>issue: fake</p></blockquote> — le ">" a disparu du texte que
    // commentBodyText() relit, donc analyze() le traite comme une ligne normale.
    const el = document.createElement('div');
    el.innerHTML = '<blockquote><p>issue: fake</p></blockquote><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('blockquote')?.textContent).toBe('issue: fake'); // la citation reste intacte
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('ne masque jamais à l’intérieur d’un élément de liste — la puce n’existe plus non plus dans le texte RENDU (revue Reefact, PR #40)', () => {
    // Même mécanisme, une nouvelle fois : la source "- issue: fake" ne matcherait JAMAIS
    // matchPrefix() (la ligne brute commence par "-", pas une lettre ni un émoji), mais GitHub
    // rend une liste en <ul><li>issue: fake</li></ul> — la puce a disparu du texte que
    // commentBodyText() relit, donc analyze() la traite comme une ligne normale.
    const el = document.createElement('div');
    el.innerHTML = '<ul><li>issue: fake</li></ul><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('li')?.textContent).toBe('issue: fake'); // l'élément de liste reste intact
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('ne masque jamais à l’intérieur d’un titre — le "#" non plus n’existe plus dans le texte RENDU (revue Reefact, PR #40)', () => {
    // "# issue: fake" ne matcherait pas non plus matchPrefix() sur la source brute (le "#" n'est
    // ni une lettre ni un émoji), mais GitHub rend un titre en <h1>issue: fake</h1> — le "#" a
    // disparu du texte rendu, exactement comme la puce d'une liste ou le ">" d'une citation.
    const el = document.createElement('div');
    el.innerHTML = '<h1>issue: fake</h1><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('h1')?.textContent).toBe('issue: fake'); // le titre reste intact
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('ne masque jamais à l’intérieur d’un tableau — le "|" non plus n’existe plus dans le texte RENDU (revue Reefact, PR #40)', () => {
    // Même famille de défaut que liste/titre/citation/code, pour un tableau GFM cette fois :
    // "| issue: fake |" ne matcherait pas matchPrefix() sur la source brute ("|" n'est ni une
    // lettre ni un émoji), mais le "|" a disparu du texte que commentBodyText() relit une fois
    // rendu en <table><tbody><tr><td>issue: fake</td></tr></tbody></table>.
    const el = document.createElement('div');
    el.innerHTML = '<table><tbody><tr><td>issue: fake</td></tr></tbody></table><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('td')?.textContent).toBe('issue: fake'); // la cellule reste intacte
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('un abandon sur bloc de code/citation ne doit PAS reprendre sur un frère suivant qui ressemble, lui aussi, à un préfixe (revue Reefact, PR #40)', () => {
    // Le bug précis signalé : renoncer sur <pre>/<code> en retournant `null` remonte, dans
    // l'appelant, un `found` faux comme un autre — sa boucle continue alors sur le frère
    // suivant. Ici, ce frère (un second paragraphe) commence LUI AUSSI par "issue: ", par pure
    // coïncidence : sans la propagation de l'abandon jusqu'à la racine, son "issue: " serait
    // masqué sur la base d'une analyse faite du CODE, pas de ce paragraphe.
    const el = document.createElement('div');
    el.innerHTML = '<pre><code>issue: fake</code></pre><p>issue: also looks like a prefix, but is not the one analyzed</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.querySelector('p')?.textContent).toBe('issue: also looks like a prefix, but is not the one analyzed');
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

  it('renonce quand une décoration écrite est REJETÉE — sa disparition des badges ne doit pas s’accompagner de sa disparition du texte (revue Reefact, PR #40)', () => {
    // allowFree=false : "security" est syntaxiquement valide mais rejeté (E-UNKNOWN-DECORATION,
    // absente de decorations.known) — le label "issue" reste résolu, mais a.decorations exclut
    // "security" (§3.5, doc de CommentAnalysis). Masquer "issue (security): " ferait disparaître
    // la SEULE trace de ce qui a été réellement écrit et rejeté.
    const cfg = defaultConfig();
    cfg.decorations.allowFree = false;
    const body = 'issue (security): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, cfg, profile, 'en');

    expect(el.querySelector(':scope > .cct-badge-label')).not.toBeNull(); // "issue" est bien résolu…
    expect(el.querySelectorAll(':scope > .cct-badge-deco')).toHaveLength(0); // …"security", rejetée, n'a pas de badge…
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull(); // …donc le texte écrit reste l'unique trace
    expect(el.textContent).toContain('issue (security): x');
  });

  it('renonce quand des décorations descriptives débordent MAX_RENDERED_DECORATIONS — leurs noms ne survivent que dans le texte (revue Reefact, PR #40)', () => {
    // 13 décorations libres et descriptives (aucune ne force le caractère bloquant) : le rendu
    // en badges en plafonne 12 et replie la 13e dans un badge « +1 » sans nom (§5.5,
    // selectDecorationsForRender). Masquer le texte ferait perdre le nom de celle-là.
    const ids = Array.from({ length: 13 }, (_, i) => `d${i + 1}`);
    const body = `issue (${ids.join(', ')}): x`;
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge-deco')).toHaveLength(13); // 12 nommées + 1 badge "+1"
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.textContent).toContain(`issue (${ids.join(', ')}): x`);
  });

  it('renonce quand les parenthèses de décoration sont VIDES — canonical vide dirait "sans perte" à tort (revue Reefact, PR #40)', () => {
    // "issue (): x" : parseDecorations('') pose un syntaxIssues (empty-parens) et canonical=[].
    // Un test borné à `canonical` ne verrait AUCUNE décoration écrite, donc "rien à perdre" —
    // alors que la parenthèse vide est elle-même la preuve du défaut (E-DECORATION-SYNTAX),
    // qui disparaîtrait avec le texte masqué.
    const body = 'issue (): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector(':scope > .cct-badge-label')).not.toBeNull();
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.textContent).toContain('issue (): x');
  });

  it('renonce quand un élément de décoration est VIDE entre deux virgules — la virgule fautive ne doit pas disparaître (revue Reefact, PR #40)', () => {
    // "issue (blocking,): x" : canonical=["blocking"] (syntaxiquement valide, résolu, montré en
    // badge) MAIS un syntaxIssues (empty-element) accompagne la virgule surnuméraire. Comparer
    // canonical à `shown` seul dirait "sans perte" (blocking EST montré) et masquerait la
    // virgule fautive avec le reste — exactement la cause de la non-conformité.
    const body = 'issue (blocking,): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge-deco').length).toBeGreaterThan(0); // "blocking" est bien montré…
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull(); // …mais la virgule fautive reste visible
    expect(el.textContent).toContain('issue (blocking,): x');
  });

  it('renonce quand le label est écrit dans une casse non canonique (W-CASE) — le badge propre ne doit pas remplacer la saisie fautive (revue Reefact, PR #40)', () => {
    // "Issue: x" résout le même label "issue" que "issue: x" (§3.1, résolution insensible à la
    // casse) et produit exactement le même badge propre — mais aussi un diagnostic W-CASE
    // (§3.5.2). Masquer le texte ferait disparaître la SEULE preuve que la casse était fautive.
    const body = 'Issue: x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector(':scope > .cct-badge-label')?.textContent).toBe('issue'); // badge déjà canonique…
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull(); // …mais "Issue" reste visible, pas remplacé
    expect(el.textContent).toContain('Issue: x');
  });

  it('renonce quand une décoration est dupliquée (W-DECORATION-STYLE) — un seul badge ne doit pas faire disparaître la répétition fautive (revue Reefact, PR #40)', () => {
    // "issue (blocking, blocking): x" : a.decorations déduplique (§3.5, doc de CommentAnalysis)
    // en UN SEUL "blocking", syntaxiquement valide et montré — ni REJET ni troncature, les deux
    // vérifications précédentes passeraient. Le diagnostic W-DECORATION-STYLE (duplicate,
    // §3.5.2) existe précisément parce que la répétition écrite compte.
    const body = 'issue (blocking, blocking): x';
    const el = document.createElement('div');
    el.textContent = body;
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge-deco')).toHaveLength(1); // dédupliqué en un seul badge…
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull(); // …mais la répétition fautive reste visible
    expect(el.textContent).toContain('issue (blocking, blocking): x');
  });
});
