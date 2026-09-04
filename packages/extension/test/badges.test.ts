// @vitest-environment happy-dom
// Masquage du préfixe structuré à l'affichage (§5.5) : `decorateComment()` retire de la vue
// le "label (décorations): " en tête d'un commentaire déjà publié, dont l'information est
// désormais portée par les badges — jamais le corps STOCKÉ côté serveur, qu'aucune de ces
// écritures n'atteint (badges.ts, applyPrefixVisibility). Couvre le cas sûr (préfixe entier
// dans le premier nœud de texte) et les replis défensifs (§9.4) quand il ne l'est pas.

import { afterEach, describe, expect, it } from 'vitest';
import { commentBodyText } from '@cct/adapter-shared';
import { defaultConfig } from '@cct/core';
import { clearCommentDecorations, decorateComment } from '../src/ui/badges.js';

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

  it('ne masque jamais à l’intérieur d’un résumé repliable — les balises <details>/<summary> non plus n’existent pas dans le texte RENDU (revue Reefact, PR #40)', () => {
    // <details>/<summary> est du HTML BRUT, pas un construct Markdown, mais GitHub le
    // documente comme syntaxe de commentaire valide et le même défaut s'applique : la VRAIE
    // première ligne de la source ("<details>") ne matche jamais matchPrefix() (elle commence
    // par "<"), mais ses balises disparaissent du texte RENDU, laissant "issue: fake" (le
    // contenu de <summary>) sembler être la première ligne.
    const el = document.createElement('div');
    el.innerHTML = '<details><summary>issue: fake</summary><p>real subject, not a prefix</p></details>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('summary')?.textContent).toBe('issue: fake'); // le résumé reste intact
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('ne masque jamais à l’intérieur d’un <div> — du HTML brut de premier niveau, jamais un préfixe dans la source (revue Reefact, PR #40)', () => {
    // "<div>issue: fake</div>" écrit tel quel dans un commentaire : la source commence par "<",
    // jamais une lettre ni un émoji, donc jamais un préfixe. GitHub sanitise mais conserve <div>
    // dans le rendu — contrairement à LI/H1/TABLE/DETAILS, DIV ne correspond à AUCUN construct
    // Markdown ni à aucune syntaxe de tête perdue : c'est littéralement ce que l'auteur a écrit,
    // au premier niveau, sans qu'aucune deny-list n'ait jamais pu l'anticiper. Seule une
    // allow-list du premier niveau (uniquement <p>, seul conteneur mesuré comme fidèle à une
    // ligne Markdown ordinaire) le refuse structurellement, sans avoir besoin de connaître DIV.
    const el = document.createElement('div');
    el.innerHTML = '<div>issue: fake</div><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector(':scope > div')?.textContent).toBe('issue: fake'); // le <div> reste intact
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('masque normalement quand une ligne Markdown SANS AUCUNE TRACE DOM précède le vrai préfixe (revue Reefact, PR #40)', () => {
    // Cas structurellement différent de LI/H1/TABLE/DETAILS ci-dessus, délibérément traité
    // autrement : une définition de référence de lien ("[ref]: /url") ou un commentaire HTML
    // ("<!-- ... -->") en tête de source ne produit AUCUN nœud dans le document rendu — mesuré
    // en direct sur github.com (PR #40, issuecomment-5530393268 et -5530394303) : le DOM final
    // est BYTE POUR BYTE celui d'un commentaire qui aurait commencé directement par "issue:
    // real subject", sans le moindre nœud vide ou marqueur résiduel pour la ligne invisible.
    // Aucun tag ne peut donc jamais signaler ce cas : contrairement à LI/H1/TABLE/DETAILS, où
    // le TAG DU CONTENEUR est justement l'indice observable qu'une syntaxe de tête a pu
    // disparaître, une ligne invisible ne laisse RIEN à intercepter, dans AUCUN cas — y
    // compris le cas nominal, en tout point identique dans le DOM. « Renoncer quand la
    // correspondance ne peut pas être établie » (revue Reefact, PR #40) équivaudrait donc ici à
    // renoncer TOUJOURS, y compris sur un commentaire "issue: real subject" parfaitement normal.
    //
    // Le badge "issue" apparaît ici que le masquage ait lieu ou non : `analyze()` le résout à
    // partir du même `bodyText` dérivé du DOM, qu'aucune loi n'oblige à s'accorder avec le
    // verdict qu'un serveur tirerait de la source brute complète (où la ligne invisible, non
    // écartée par `splitBody()`, resterait la première ligne et ferait échouer matchPrefix()).
    // C'est un désaccord de VERDICT entre l'analyse sur texte rendu et la validation sur source
    // brute — la même famille d'angle mort, déjà noté hors périmètre pour un bloc de code sans
    // fences (plus haut) que pour une ligne invisible : il précède et dépasse le masquage,
    // affecte le calcul du BADGE identiquement, et existe que ce fichier existe ou non. Le
    // masquer ou pas ne change rien à ce défaut ; le texte réellement affiché, lui, reste
    // cohérent avec lui-même dans les deux cas.
    const el = document.createElement('div');
    el.innerHTML = '<p>issue: real subject</p>'; // DOM indiscernable, avec ou sans ligne invisible en amont
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-hidden-prefix')?.textContent).toBe('issue: ');
    expect(el.querySelector('.cct-hidden-prefix')?.nextSibling?.textContent).toBe('real subject');
  });

  it('ne masque jamais à l’intérieur d’un gras/lien — l’astérisque et le crochet n’existent pas non plus dans le texte RENDU (revue Reefact, PR #40)', () => {
    // "**issue: fake**" ne matcherait pas non plus matchPrefix() sur la source brute (elle
    // commence par "*", ni une lettre ni un émoji), mais GitHub la rend en
    // <p><strong>issue: fake</strong></p> : les "**" ont disparu du texte RENDU, laissant le
    // texte en gras "issue: fake" sembler être la première ligne. Même mécanisme désormais que
    // pour liste/titre/tableau/résumé ci-dessus — une allow-list, pas une deny-list : le texte
    // doit être un enfant DIRECT du <p>, jamais niché un niveau plus loin, quel que soit le tag
    // de ce niveau supplémentaire (STRONG ici, mais EM/A/DEL/n'importe quel autre tag inline
    // échoueraient de la même façon, sans avoir besoin d'être nommés un par un).
    const el = document.createElement('div');
    el.innerHTML = '<p><strong>issue: fake</strong></p><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('strong')?.textContent).toBe('issue: fake'); // le gras reste intact
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
  });

  it('ne masque jamais à l’intérieur d’un lien complet — le "[" et le "](url)" non plus n’existent pas dans le texte RENDU (revue Reefact, PR #40)', () => {
    // Même défaut, pour un lien Markdown qui couvre TOUT le préfixe cette fois :
    // "[issue: fake](url)" ne matcherait pas matchPrefix() sur la source brute ("[" n'est ni
    // une lettre ni un émoji), mais GitHub le rend en <p><a href="url">issue: fake</a></p>.
    const el = document.createElement('div');
    el.innerHTML = '<p><a href="/url">issue: fake</a></p><p>real subject, not a prefix</p>';
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('a')?.textContent).toBe('issue: fake'); // le lien reste intact
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
    // Le sujet mis en avant couvre la ligne ENTIÈRE, mise en forme inline comprise — la borner
    // au premier nœud de texte laisserait « Foo » hors du gras, au milieu d'une même phrase.
    expect(hidden?.nextSibling?.textContent).toBe('use Foo');
    expect(el.querySelector('.cct-subject')?.textContent).toBe('use Foo');
    expect(el.querySelector('code')?.textContent).toBe('Foo'); // la mise en forme inline reste intacte
    expect(el.querySelector('code')?.parentElement?.className).toBe('cct-subject'); // déplacée, pas recréée
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

    expect(el.querySelector(':scope > .cct-badge-label')?.textContent).toBe('🔨 issue'); // badge déjà canonique…
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

describe('decorateComment() — le sujet sur la ligne des badges, en gras (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** DOM d'un commentaire GitHub rendu, tel que mesuré sur une vraie PR (voir le test du <td>
   * plus haut) : un `<td>` de corps, une indentation, un `<p>` par paragraphe, un `<br>` pour
   * chaque simple fin de ligne à l'intérieur d'un paragraphe. C'est le seul agencement où la
   * différence entre « badges au-dessus » et « badges sur la ligne du sujet » est observable —
   * un corps réduit à un nœud de texte n'a pas de paragraphe où les poser. */
  function githubComment(html: string): Element {
    const el = document.createElement('td');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  it('pose les badges DANS le paragraphe du sujet — c’est ce qui les met sur sa ligne', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    // Le fond de l'affaire : tant que les badges sont FRÈRES du <p>, ce dernier est un bloc et
    // son texte repart à la ligne sous eux, quoi qu'en dise la feuille de style. Dans le <p>,
    // ils sont en flux inline avec le sujet, donc sur sa ligne.
    const p = el.querySelector('p')!;
    expect([...p.querySelectorAll(':scope > .cct-badge')].map((b) => b.textContent)).toEqual([
      '🔍 nitpick',
      'test',
    ]);
    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(0); // plus aucun au-dessus du texte

    // …et dans cet ordre : badges, puis le sujet, à leur droite.
    const order = [...p.childNodes].map((n) => (n.nodeType === 1 ? (n as Element).className : '#text'));
    expect(order.slice(0, 4)).toEqual([
      'cct-badge cct-badge-label cct-badge-pill',
      'cct-badge cct-badge-deco cct-badge-deco-custom cct-badge-pill',
      'cct-hidden-prefix',
      'cct-subject',
    ]);
  });

  it('met le sujet en gras dans un <span>, jamais un <strong> — la mise en avant est cosmétique (§10)', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    const subject = el.querySelector('.cct-subject')!;
    expect(subject.tagName).toBe('SPAN'); // <strong> annoncerait une emphase que l'auteur n'a pas écrite
    expect(subject.textContent).toBe('subject');
  });

  it('le sujet s’arrête au premier <br> : la suite du paragraphe ne passe pas en gras avec lui', () => {
    // Défaut visé, et la raison d'être de la frontière : une simple fin de ligne dans un
    // commentaire GitHub devient un <br> DANS le même paragraphe — sans cette borne, tout le
    // paragraphe se retrouverait en gras, « discussion » compris (capture Reefact).
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')?.textContent).toBe('subject');
    expect(el.querySelector('.cct-subject')?.nextSibling?.nodeName).toBe('BR');
    expect(el.querySelector('p')?.textContent).toContain('discussion'); // toujours là, hors du gras
  });

  it('le sujet s’arrête aussi à une fin de ligne À L’INTÉRIEUR d’un nœud de texte', () => {
    // Deuxième frontière, pour un corps rendu d'un seul tenant — ce que produit toute plateforme
    // qui ne réécrit pas les sauts de ligne en <br>, et ce que produisent les DOM de test.
    const body = 'praise: nice work\nand a second line';
    const el = document.createElement('div');
    el.textContent = body;
    document.body.appendChild(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')?.textContent).toBe('nice work');
    expect(el.textContent).toContain('and a second line'); // la suite reste, hors du gras
    expect(commentBodyText(el)).toBe(body); // et rien n'a bougé pour la relecture au tour suivant
  });

  it('ne modifie pas le texte relu, badges posés DANS le paragraphe compris', () => {
    // `commentBodyText()` (adapter-shared) exclut les badges des DEUX emplacements possibles.
    // Sans cette exclusion, le corps relu commencerait par « 🔍 nitpick test », analyze() ne
    // reconnaîtrait plus le préfixe au tour suivant, et les badges seraient retirés puis reposés
    // à chaque passage de rendu.
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(commentBodyText(el)).toBe(before);
    expect(el.querySelector('.cct-badge')).not.toBeNull(); // les badges sont bien là, mais exclus
  });

  it('badges au-dessus du texte, sujet non mis en avant, quand le masquage est refusé (§9.4)', () => {
    // Sans frontière de préfixe fiable — ici une décoration REJETÉE, dont le texte reste l'unique
    // trace —, il n'y a pas non plus de sujet à border : le rendu retombe intégralement sur
    // l'agencement d'avant, badges en tête du corps.
    const cfg = defaultConfig();
    cfg.decorations.allowFree = false;
    const el = githubComment('<p dir="auto">issue (security): x</p>');
    decorateComment(el, commentBodyText(el), cfg, profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(1); // au-dessus du <p>
    expect(el.querySelector('p')?.querySelector('.cct-badge')).toBeNull();
    expect(el.querySelector('.cct-subject')).toBeNull();
  });

  it('déplace les badges quand le masquage APPARAÎT sous une signature de badges inchangée', () => {
    // Le chemin rapide ne peut pas se fier au seul couple signature/compte : « issue (blocking,):
    // x » et « issue (blocking): x » produisent EXACTEMENT les mêmes badges (même label, même
    // décoration résolue, même caractère bloquant), mais seule la seconde autorise le masquage —
    // donc seule la seconde met les badges sur la ligne du sujet. Sans le contrôle du parent, les
    // badges resteraient au-dessus d'un sujet passé en gras : deux moitiés d'agencements.
    const el = githubComment('<p dir="auto">issue (blocking,): x</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');
    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(2); // virgule fautive : pas de masquage
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();

    // Édition du commentaire : la plateforme réécrit le TEXTE du paragraphe, les badges (qui n'y
    // sont pas encore) survivent intacts au-dessus de lui.
    (el.querySelector('p')!.firstChild as Text).data = 'issue (blocking): x';
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(0); // aucun résidu au-dessus
    expect(el.querySelector('p')?.querySelectorAll(':scope > .cct-badge')).toHaveLength(2);
    expect(el.querySelector('.cct-subject')?.textContent).toBe('x');
  });

  it('idempotent : un second rendu ne double pas le sujet ni ne redéplace les badges', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');
    const first = el.querySelector('.cct-subject');
    const label = el.querySelector('.cct-badge-label');

    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll('.cct-subject')).toHaveLength(1);
    expect(el.querySelector('.cct-subject')).toBe(first); // même nœud, pas reconstruit
    expect(el.querySelector('.cct-badge-label')).toBe(label);
  });

  it('rend le texte intact quand la résolution est perdue en direct — gras et masquage partent ensemble (§8.1.1)', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');
    expect(el.querySelector('.cct-subject')).not.toBeNull();

    const disabled = defaultConfig();
    disabled.labels.find((l) => l.id === 'nitpick')!.enabled = false;
    decorateComment(el, commentBodyText(el), disabled, profile, 'en');

    expect(el.querySelector('.cct-subject')).toBeNull();
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.querySelector('.cct-badge')).toBeNull();
    expect(el.textContent).toBe(before); // texte reconstitué à l'identique, rien perdu
    // Nœuds de texte recollés, pas seulement leur concaténation : deux frères adjacents feraient
    // échouer le prochain masquage, qui calcule sa frontière sur UN nœud (hiddenPrefixSpan).
    expect(el.querySelector('p')?.childNodes).toHaveLength(3); // texte, <br>, texte
  });

  it('réentretient le sujet quand une réhydratation l’a défait sans toucher au préfixe masqué', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const subject = el.querySelector('.cct-subject')!;
    subject.replaceWith(document.createTextNode(subject.textContent ?? ''));
    expect(el.querySelector('.cct-subject')).toBeNull();

    decorateComment(el, body, defaultConfig(), profile, 'en'); // chemin rapide : badges inchangés

    expect(el.querySelector('.cct-subject')?.textContent).toBe('subject');
  });

  it('n’emballe jamais le sujet deux fois quand le préfixe masqué, lui, a disparu', () => {
    // Le wrapper de sujet resté seul n'est ni un `<br>` ni une fin de ligne : le passage suivant
    // le prendrait pour une partie du sujet et l'emballerait dans un NOUVEAU wrapper, une couche
    // de plus à chaque rendu. Il est défait avant, pas contourné.
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    const hidden = el.querySelector('.cct-hidden-prefix')!;
    hidden.replaceWith(document.createTextNode(hidden.textContent ?? ''));

    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll('.cct-subject')).toHaveLength(1);
    expect(el.querySelector('.cct-subject')?.querySelector('.cct-subject')).toBeNull(); // jamais imbriqué
    expect(el.querySelector('.cct-subject')?.textContent).toBe('subject');
    expect(commentBodyText(el)).toBe(body);
  });

  it('aucun wrapper de sujet quand il n’y a pas de sujet — « issue: » seul', () => {
    // Le masquage y renonce déjà (il ne reste rien de visible) ; le gras n'a pas davantage de
    // matière. Un span vide serait un nœud posé pour rien dans le DOM de chaque lecteur.
    const body = 'issue:';
    const el = document.createElement('div');
    el.textContent = body;
    document.body.appendChild(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')).toBeNull();
    expect(el.textContent).toContain('issue:');
  });
});

describe('decorateComment() — la respiration sous la ligne du sujet (§5.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function githubComment(html: string): Element {
    const el = document.createElement('td');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  it('pose un espaceur quand le corps reprend sur la ligne suivante du MÊME paragraphe', () => {
    // C’est le cas de la capture d’origine : « subject » et « discussion » séparés par une
    // simple fin de ligne, que GitHub rend en `<br>` DANS le paragraphe — sans espaceur, le
    // corps se lit collé sous les badges.
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    const spacer = el.querySelector('.cct-subject-break');
    expect(spacer).not.toBeNull();
    expect(spacer?.previousSibling?.nodeName).toBe('BR'); // juste après le saut, avant le corps
    expect(spacer?.textContent).toBe(''); // décoratif : n’ajoute aucun texte au corps relu
  });

  it('n’en pose AUCUN quand le corps reprend au paragraphe suivant — la plateforme espace déjà', () => {
    // « s’il y en a déjà un, pas besoin d’en rajouter un autre » : une ligne vide dans la source
    // produit un second `<p>`, dont la marge de bloc sépare déjà les deux. En ajouter un ici
    // doublerait un écart qui existe.
    const el = githubComment('<p dir="auto">nitpick (test): subject</p><p dir="auto">discussion</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')?.textContent).toBe('subject');
    expect(el.querySelector('.cct-subject-break')).toBeNull();
  });

  it('ne modifie pas le corps relu — l’espaceur est sans texte', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject-break')).not.toBeNull();
    expect(commentBodyText(el)).toBe(before);
  });

  it('idempotent : un second rendu ne double pas l’espaceur', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const body = commentBodyText(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');
    const first = el.querySelector('.cct-subject-break');

    decorateComment(el, body, defaultConfig(), profile, 'en');

    expect(el.querySelectorAll('.cct-subject-break')).toHaveLength(1);
    expect(el.querySelector('.cct-subject-break')).toBe(first);
  });

  it('retire l’espaceur quand le saut de ligne qui le justifiait disparaît', () => {
    // Édition du commentaire : la ligne vide remplace la simple fin de ligne, le `<br>` s’en va.
    // Un espaceur qui lui survivrait ajouterait un blanc que plus rien ne justifie.
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');
    expect(el.querySelector('.cct-subject-break')).not.toBeNull();

    el.querySelector('br')!.remove();
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject-break')).toBeNull();
  });

  it('part avec le reste quand la résolution est perdue en direct (§8.1.1)', () => {
    const el = githubComment('<p dir="auto">nitpick (test): subject<br>discussion</p>');
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    const disabled = defaultConfig();
    disabled.labels.find((l) => l.id === 'nitpick')!.enabled = false;
    decorateComment(el, commentBodyText(el), disabled, profile, 'en');

    expect(el.querySelector('.cct-subject-break')).toBeNull();
    expect(el.textContent).toBe(before);
  });
});

describe('clearCommentDecorations() — l’extension inactive ne laisse RIEN derrière elle (§7)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('rend le texte entier : badges, espaceur, sujet et préfixe masqué défaits', () => {
    // Le défaut corrigé : `clearBadges()` ne retirait que les `.cct-badge`. Le préfixe
    // structuré restait `display: none` — une partie du texte de l’auteur rendue invisible par
    // une extension qui se déclare inactive (§7), jusqu’au rechargement de la page.
    const el = document.createElement('td');
    el.innerHTML = '<p dir="auto">nitpick (test): subject<br>discussion</p>';
    document.body.appendChild(el);
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');
    expect(el.querySelector('.cct-hidden-prefix')).not.toBeNull();

    clearCommentDecorations(document);

    expect(el.querySelector('.cct-badge')).toBeNull();
    expect(el.querySelector('.cct-subject-break')).toBeNull();
    expect(el.querySelector('.cct-subject')).toBeNull();
    expect(el.querySelector('.cct-hidden-prefix')).toBeNull();
    expect(el.textContent).toBe(before); // texte reconstitué à l’identique
  });

  it('recolle les nœuds de texte, pour qu’un rendu ULTÉRIEUR sache encore border le préfixe', () => {
    // `hiddenPrefixSpan()` calcule sa frontière sur UN nœud de texte : deux frères adjacents
    // laissés derrière feraient renoncer le masquage suivant (retour au mode assist, §7).
    const body = 'praise: nice work';
    const el = document.createElement('div');
    el.textContent = body;
    document.body.appendChild(el);
    decorateComment(el, body, defaultConfig(), profile, 'en');

    clearCommentDecorations(document);
    expect(el.childNodes).toHaveLength(1); // un seul nœud, pas trois morceaux

    decorateComment(el, body, defaultConfig(), profile, 'en'); // l’extension redevient active
    expect(el.querySelector('.cct-hidden-prefix')?.textContent).toBe('praise: ');
    expect(el.querySelector('.cct-subject')?.textContent).toBe('nice work');
  });

  it('ne touche pas un commentaire que l’extension n’avait pas décoré', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>un commentaire ordinaire, sans préfixe</p>';
    document.body.appendChild(el);
    const before = el.innerHTML;

    clearCommentDecorations(document);

    expect(el.innerHTML).toBe(before);
  });
});

describe('decorateComment() — une borne de ligne INTERNE à la mise en forme (revue Reefact, PR #45)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function githubComment(html: string): Element {
    const el = document.createElement('td');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  it('renonce quand le saut de ligne vit DANS une emphase, plutôt que de mettre le corps en gras', () => {
    // GFM autorise un saut de ligne dur à l’intérieur d’une emphase : « issue: **sujet  \ncorps** »
    // rend un `<strong>` unique dont le `<br>` est INTERNE. La boucle ne voyant que ses frères
    // directs, elle embarquait le `<strong>` entier — « corps » passait en gras avec le sujet, et
    // aucune respiration n’était posée puisque plus aucun `<br>` ne suivait le wrapper.
    const el = githubComment('<p dir="auto">issue: <strong>subject<br>body</strong></p>');
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')).toBeNull(); // rien n’est mis en avant…
    expect(el.querySelector('.cct-subject-break')).toBeNull();
    expect(el.querySelector('strong')?.textContent).toBe('subjectbody'); // …et l’emphase reste intacte
    expect(el.querySelector('strong')?.parentElement?.tagName).toBe('P'); // jamais déplacée dans un wrapper
    expect(commentBodyText(el)).toBe(before);
  });

  it('les badges restent AU-DESSUS du texte quand le sujet n’a pas pu être borné', () => {
    // Sinon : badges en flux inline devant un sujet qui n’est pas en gras — la moitié d’un
    // agencement. Les badges suivent le sujet, pas le préfixe masqué.
    const el = githubComment('<p dir="auto">issue: <strong>subject<br>body</strong></p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelectorAll(':scope > .cct-badge')).toHaveLength(1);
    expect(el.querySelector('p')?.querySelector('.cct-badge')).toBeNull();
  });

  it('renonce aussi quand le saut de ligne vit dans un LIEN — le scinder en ferait deux', () => {
    // Même borne interne, sur l’élément où la scission serait le plus coûteuse : cloner un `<a>`
    // pour répartir son contenu de part et d’autre du saut donnerait deux liens là où l’auteur
    // en a écrit un.
    const el = githubComment('<p dir="auto">issue: <a href="/x">subject<br>body</a></p>');
    const before = el.textContent;
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')).toBeNull();
    expect(el.querySelectorAll('a')).toHaveLength(1); // un seul lien, celui de l’auteur
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/x');
    expect(commentBodyText(el)).toBe(before);
  });

  it('borne toujours normalement quand la mise en forme ne porte AUCUN saut de ligne', () => {
    // Le cas courant ne doit rien perdre au passage : « issue: use `Foo` » garde son sujet en
    // gras, mise en forme inline comprise, et les badges sur sa ligne.
    const el = githubComment('<p dir="auto">issue: use <code>Foo</code><br>discussion</p>');
    decorateComment(el, commentBodyText(el), defaultConfig(), profile, 'en');

    expect(el.querySelector('.cct-subject')?.textContent).toBe('use Foo');
    expect(el.querySelector('.cct-subject-break')).not.toBeNull();
    expect(el.querySelector('p')?.querySelectorAll(':scope > .cct-badge')).toHaveLength(1);
  });
});
