// @vitest-environment happy-dom
// La réduction des pages capturées, hors navigateur : ce qu'elle garde, ce qu'elle retire, et le
// garde statique qui refuse un sélecteur cherchant ce qu'elle retire. Le côté Chromium —
// identité des éléments avant/après, point fixe — se mesure à chaque `reduce-captured-pages`.
import { describe, expect, it } from 'vitest';
import {
  reducePage,
  rulesFor,
  serializeReduced,
  unreachableAttributeReads,
  unreachableByReduction,
} from '../scripts/lib/captured-page-reducer.mjs';
import { findCapturedPageSecrets } from '../scripts/lib/captured-page-secrets.mjs';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const reduced = (html: string, id = 'github') => {
  const doc = parse(html);
  reducePage(doc, rulesFor(id));
  return doc;
};

describe('réduction des pages capturées — ce qui survit', () => {
  it('garde la structure, le texte et les attributs d’interface', () => {
    const doc = reduced(
      '<body><div id="c" class="comment" role="article" aria-label="Comment" data-testid="body">' +
        '<p>issue: ce nom ne dit pas ce qu’il contient</p><button type="submit" value="Comment">Comment</button></div></body>'
    );
    const div = doc.getElementById('c')!;
    expect(div.getAttribute('class')).toBe('comment');
    expect(div.getAttribute('aria-label')).toBe('Comment');
    expect(div.getAttribute('data-testid')).toBe('body');
    expect(div.querySelector('p')!.textContent).toBe('issue: ce nom ne dit pas ce qu’il contient');
    expect(div.querySelector('button')!.getAttribute('value')).toBe('Comment');
  });

  it('retire scripts, styles, liens de ressources, commentaires HTML et dessin des icônes', () => {
    const doc = reduced(
      '<head><link rel="icon" href="/a.ico"><style>p{}</style></head><body><!-- x -->' +
        '<script>var t = 1</script><svg class="octicon"><path d="M0 0"></path></svg><p>ok</p></body>'
    );
    const html = serializeReduced(doc);
    expect(html).not.toMatch(/<link|<style|<script|<!--|<path/);
    expect(doc.querySelector('svg.octicon')).not.toBeNull();
    expect(doc.querySelector('p')!.textContent).toBe('ok');
  });

  it('ne garde que les <meta> de la plateforme', () => {
    const doc = reduced('<head><meta name="release" content="abc"><meta name="request-id" content="r"></head>');
    expect(doc.querySelector('meta[name="release"]')!.getAttribute('content')).toBe('abc');
    expect(doc.querySelector('meta[name="request-id"]')).toBeNull();
    // Une plateforme sans liste n'en garde aucun.
    expect(reduced('<head><meta name="release" content="abc"></head>', 'azdo').querySelector('meta')).toBeNull();
  });

  it('ne garde du JSON embarqué que les clés listées — le jeton client disparaît', () => {
    const data = {
      payload: { pullRequestsLayoutRoute: { pullRequest: { number: 7, createdTime: 't', title: 'x' } } },
      clientToken: 'secret',
    };
    const doc = reduced(
      `<body><script type="application/json" data-target="react-app.embeddedData" nonce="n">${JSON.stringify(data)}</script></body>`
    );
    const script = doc.querySelector('script')!;
    expect(JSON.parse(script.textContent!)).toEqual({
      payload: { pullRequestsLayoutRoute: { pullRequest: { number: 7, createdTime: 't' } } },
    });
    expect(script.hasAttribute('nonce')).toBe(false);
  });

  it('réduit une URL à son chemin, requête retirée, ancre gardée', () => {
    const doc = reduced('<body><a href="https://x.test/o/r/pull/1?token=abc#issuecomment-2">l</a></body>');
    expect(doc.querySelector('a')!.getAttribute('href')).toBe('https://x.test/o/r/pull/1#issuecomment-2');
  });

  it('garde la FORME d’une référence relative — une ancre seule ne devient pas la racine du site', () => {
    // Revue Codex, PR #133 : `#issue-1` était réécrit `/#issue-1`, et l'adaptateur GitHub lit ce
    // `href` tel quel pour l'ancre d'un fil.
    const doc = reduced(
      '<body><a id="a" href="#issuecomment-6463117950">a</a><a id="b" href="files?w=1#diff-1">b</a>' +
        '<a id="c" href="#frag?pas-une-requete">c</a><a id="d" href="//cdn.test/x?sig=1">d</a></body>'
    );
    const href = (id: string) => doc.getElementById(id)!.getAttribute('href');
    expect(href('a')).toBe('#issuecomment-6463117950');
    expect(href('b')).toBe('files#diff-1');
    expect(href('c')).toBe('#frag?pas-une-requete');
    expect(href('d')).toBe('//cdn.test/x');
  });

  it('applique la liste blanche aux attributs de <html> lui-même', () => {
    // Revue Codex, PR #133 : `walk` ne traitait que les enfants de la racine.
    const doc = reduced('<html lang="en" data-auth-token="t" style="x" class="js"><body></body></html>');
    const root = doc.documentElement;
    expect(root.hasAttribute('data-auth-token')).toBe(false);
    expect(root.hasAttribute('style')).toBe(false);
    expect(root.getAttribute('lang')).toBe('en');
    expect(root.getAttribute('class')).toBe('js');
  });

  it('garde un data-* dont la valeur est un CHEMIN, même long — mesuré sur les fils repliés de GitHub', () => {
    // La première version le tenait pour opaque (40 caractères sans espace) : les fils repliés
    // n'étaient plus reconnus, et deux tests sur pages réelles échouaient.
    const doc = reduced(
      '<body><review-thread-collapsible data-deferred-content-url="/Reefact/just-dummies/pull/292/threads/2964265502?rendering_on_files_tab=false"></review-thread-collapsible></body>'
    );
    expect(doc.querySelector('[data-deferred-content-url]')!.getAttribute('data-deferred-content-url')).toBe(
      '/Reefact/just-dummies/pull/292/threads/2964265502'
    );
  });

  it('retire la valeur d’un champ saisi ou caché', () => {
    const doc = reduced('<body><input type="hidden" name="authenticity_token" value="t"><input name="title" value="texte"></body>');
    for (const input of doc.querySelectorAll('input')) expect(input.hasAttribute('value')).toBe(false);
  });

  it('retire un data-* dont le nom ou la valeur a la forme d’un secret', () => {
    const doc = reduced(
      `<body><div id="a" data-session-id="s" data-x="${'a'.repeat(48)}" data-ok="short"></div></body>`
    );
    const div = doc.getElementById('a')!;
    expect(div.hasAttribute('data-session-id')).toBe(false);
    expect(div.hasAttribute('data-x')).toBe(false);
    expect(div.getAttribute('data-ok')).toBe('short');
  });

  it('réduit aussi le contenu des <template>', () => {
    const doc = reduced('<body><template id="t"><form><input type="hidden" value="t"><script>x</script></form></template></body>');
    const content = (doc.getElementById('t') as HTMLTemplateElement).content;
    expect(content.querySelector('script')).toBeNull();
    expect(content.querySelector('input')!.hasAttribute('value')).toBe(false);
  });

  it('ne laisse aucun des secrets GitHub connus — chacune de leurs formes', () => {
    const doc = reduced(
      '<head><meta name="visitor-hmac" content="h"><meta name="request-id" content="r">' +
        '<link rel="shared-web-socket" href="wss://alive.github.com/_sockets/u/1/ws?session=S" data-session-id="S"></head>' +
        '<body><div nonce="n" data-channel="c" data-hydro-click-hmac="h"></div>' +
        '<input type="hidden" name="authenticity_token" value="t"><input type="hidden" data-csrf="true" value="t">' +
        '<script type="application/json" data-target="react-app.embeddedData">{"clientToken":"c"}</script></body>'
    );
    expect(findCapturedPageSecrets(serializeReduced(doc))).toEqual([]);
  });

  it('est un point fixe : réduire une page réduite la rend à l’identique', () => {
    const once = serializeReduced(
      reduced('<body><a href="/p?q=1">x</a><div data-u="/a/b?c=d" style="x"><svg><path/></svg></div>\n</body>')
    );
    expect(serializeReduced(reduced(once))).toBe(once);
  });
});

describe('garde statique — un sélecteur qui cherche ce que la réduction retire', () => {
  const github = rulesFor('github');

  it('refuse un attribut, un élément ou un <meta> retirés', () => {
    expect(unreachableByReduction('[nonce]', github)).toEqual(['attribut retiré : nonce']);
    expect(unreachableByReduction('link[rel="stylesheet"]', github)).toEqual(['attribut retiré : rel', 'élément retiré : link']);
    expect(unreachableByReduction('meta[name="request-id"]', github)).toEqual(['meta non gardé : request-id']);
    expect(unreachableByReduction('div[style*="x"]', github)).toEqual(['attribut retiré : style']);
  });

  it('accepte ce qui survit, et ne lit pas un mot entre guillemets comme un élément', () => {
    for (const ok of [
      'button[data-testid="script link"]',
      '.status-meta',
      'meta[name="release"]',
      'textarea[aria-label*="omment"]:not([disabled])',
      'review-thread-collapsible[data-deferred-content-url]',
      'script[type="application/json"][data-target="react-app.embeddedData"]',
    ]) {
      expect(unreachableByReduction(ok, github), ok).toEqual([]);
    }
  });

  it('le JSON embarqué n’est gardé que là où la plateforme le déclare', () => {
    const json = 'script[type="application/json"][data-target="react-app.embeddedData"]';
    expect(unreachableByReduction(json, rulesFor('azdo'))).toEqual(['élément retiré : script']);
  });

  it('relève une lecture d’attribut que la réduction retire, dans le code d’un adaptateur', () => {
    const source = "el.getAttribute('data-thread-id'); el.getAttribute('style'); el.hasAttribute('nonce');";
    expect(unreachableAttributeReads(source, github)).toEqual(['style', 'nonce']);
  });
});
