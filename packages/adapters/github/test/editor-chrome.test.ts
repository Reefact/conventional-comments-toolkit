// @vitest-environment happy-dom
// Le CHÂSSIS du composeur GitHub (§5.1, §5.3, §9.2.3 `getEditorChrome`).
//
// Ces cas vivaient dans packages/extension/test/editor-controller.test.ts — le fichier de test
// du contrôleur PARTAGÉ —, où ils exerçaient deux littéraux GitHub écrits en dur dans ce même
// contrôleur. Le §9.4 veut les sélecteurs DOM « centralisés dans un fichier unique par
// adaptateur » ; le code est parti dans github/src/selectors.ts, et ses tests l'ont suivi.
// C'est la moitié qu'on oublie : un test qui connaît la forme du DOM d'une plateforme
// appartient à cette plateforme, exactement comme le sélecteur qu'il exerce.

import { beforeEach, describe, expect, it } from 'vitest';
import type { EditorHandle } from '@cct/adapter-shared';
import type { PrRef } from '@cct/core';
import { GithubClientAdapter } from '../src/index.js';

const pr: PrRef = {
  platform: 'github',
  createdAt: '2026-10-01T00:00:00Z',
  host: 'github.com',
  scope: ['acme', 'demo'],
  number: 42,
};

/** Un `EditorHandle` sur un champ donné. `getEditorChrome()` ne lit que `element` : le
 * contexte est rempli pour respecter le type, pas pour être exercé. */
function handleFor(element: Element): EditorHandle {
  return {
    id: 'e1',
    element,
    context: { zone: 'thread-root', action: 'compose', pr, canCarryBlockingState: true, inScope: true },
  };
}

function adapter(): GithubClientAdapter {
  return new GithubClientAdapter({ documentRef: document });
}

describe('§9.2.3 — getEditorChrome, adaptateur GitHub', () => {
  it('nomme le composeur reconnu par data-testid, et non le parent direct du champ', () => {
    // Le candidat `div[data-testid*="comment-composer"] textarea` de la chaîne `editors` est un
    // sélecteur DESCENDANT : le champ peut être niché sous un wrapper intermédiaire. C'est le
    // composeur qu'il faut parer — en-tête et onglets natifs sont à SON niveau, pas à celui du
    // wrapper.
    const composer = document.createElement('div');
    composer.setAttribute('data-testid', 'comment-composer-foo');
    const wrapper = document.createElement('div');
    const textarea = document.createElement('textarea');
    wrapper.appendChild(textarea);
    composer.appendChild(wrapper);
    document.body.appendChild(composer);

    expect(adapter().getEditorChrome(handleFor(textarea)).framedContainer).toBe(composer);
  });

  it('à défaut de composeur nommé, prend le parent direct d’un champ marqué CommentBox', () => {
    // Génération React sans `data-testid` : la marque est portée par la zone de saisie
    // elle-même (cf. le candidat `textarea[aria-label*="omment"][class*="CommentBox"]`), et son
    // châssis est alors son parent direct — jamais un ancêtre plus haut.
    const host = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.className = 'CommentBox-input';
    host.appendChild(textarea);
    document.body.appendChild(host);

    expect(adapter().getEditorChrome(handleFor(textarea)).framedContainer).toBe(host);
  });

  it('ne confond pas un ANCÊTRE portant la marque avec le champ qui la porte', () => {
    // `matchesChain` et non `closestChain`, et c'est la raison d'être de ce helper :
    // `Element.closest()` commence par l'élément puis REMONTE, si bien qu'un ancêtre marqué
    // ferait répondre « oui » à la question « ce champ-ci est-il marqué ? » — et le châssis
    // rendu serait le parent du champ, alors que rien ne le désigne.
    const marked = document.createElement('div');
    marked.className = 'CommentBox-container';
    const host = document.createElement('div');
    const textarea = document.createElement('textarea');
    host.appendChild(textarea);
    marked.appendChild(host);
    document.body.appendChild(marked);

    expect(adapter().getEditorChrome(handleFor(textarea)).framedContainer).toBeNull();
  });

  it('ne se prononce pas sur le DOM hérité — la géométrie du code partagé y suffit', () => {
    // La boîte de commentaire héritée dessine son propre cadre, que `framedAncestor()` retrouve
    // sans qu'on ait à le nommer. Un nom de moins est un nom qui ne pourrira pas (§9.4).
    const host = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.name = 'comment[body]';
    host.appendChild(textarea);
    document.body.appendChild(host);

    expect(adapter().getEditorChrome(handleFor(textarea)).framedContainer).toBeNull();
  });

  it('ne se prononce sur AUCUN DOM étranger à GitHub', () => {
    // La contre-épreuve qui manquait au dépôt : aucun test ne vérifiait qu'un chemin GitHub
    // reste inerte ailleurs. Un DOM de la forme d'Azure DevOps (chaîne `repos-` de son propre
    // fichier de sélecteurs) ne doit rien déclencher ici — sans quoi l'adaptateur GitHub
    // parlerait d'une page qui n'est pas la sienne.
    const host = document.createElement('div');
    host.className = 'repos-pr-comment-box';
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-label', 'Write a comment');
    host.appendChild(textarea);
    document.body.appendChild(host);

    expect(adapter().getEditorChrome(handleFor(textarea)).framedContainer).toBeNull();
  });
});

describe('§9.4, CA-11 — un châssis NOMMÉ qui ne matche plus se journalise', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/42'),
      configurable: true,
    });
    document.body.innerHTML = '';
  });

  /** Observe la page, puis rend le châssis méconnaissable et redemande. C'est le REMONTAGE que
   * la génération React fait pour de vrai : la poignée survit, le sous-arbre change. */
  function chromeAfterRemount(html: string, breakIt: (doc: Document) => void) {
    document.body.innerHTML = html;
    const gh = new GithubClientAdapter({ documentRef: document });
    const editors: EditorHandle[] = [];
    gh.observeEditors((e) => editors.push(e)).dispose();
    expect(editors).toHaveLength(1);
    breakIt(document);
    return { chrome: gh.getEditorChrome(editors[0]!), chains: gh.log.failures.map((f) => f.chain) };
  }

  it('journalise quand la surface qui a ramené le champ nommait un châssis disparu', () => {
    // La surface `react-comment-box` NOMME son châssis (`composer-frame`). Quand ce nom cesse
    // de désigner quoi que ce soit, le composeur perd son retrait intérieur — et jusqu'ici il
    // le perdait EN SILENCE, indistinguable d'une surface qui, elle, ne se prononce pas
    // (revue Reefact, PR #65). Le §9.4 veut cet échec tracé.
    const { chrome, chains } = chromeAfterRemount(
      '<div data-testid="comment-composer"><div><textarea id="react"></textarea></div></div>',
      (doc) => doc.querySelector('[data-testid]')?.removeAttribute('data-testid')
    );
    expect(chrome.framedContainer).toBeNull();
    expect(chains).toContain('composer-frame');
  });

  it('ne journalise RIEN pour une surface qui ne nomme aucun châssis', () => {
    // La contre-épreuve, sans laquelle le test précédent ne prouve rien : la génération héritée
    // rend `framedContainer: null` comme cas NOMINAL — la géométrie du code partagé y retrouve
    // le cadre. Journaliser ici noierait `CA-11` sous des non-événements, exactement le défaut
    // déjà corrigé sur `merge-button`.
    const { chrome, chains } = chromeAfterRemount(
      '<div class="timeline-comment"><textarea id="legacy" name="comment[body]"></textarea></div>',
      () => {}
    );
    expect(chrome.framedContainer).toBeNull();
    expect(chains).not.toContain('composer-frame');
    expect(chains).not.toContain('composer-frame-on-field');
  });

  it('ne journalise rien pour un champ dont la provenance est inconnue', () => {
    // Une poignée fabriquée — ce que font les cas ci-dessus et quatre-vingt-dix autres tests —
    // n'est passée par aucune surface. Ne pas SAVOIR d'où vient un champ n'est pas constater
    // qu'un sélecteur a pourri : affirmer une dégradation ici serait inventer la mesure.
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const gh = adapter();
    expect(gh.getEditorChrome(handleFor(textarea)).framedContainer).toBeNull();
    expect(gh.log.failures).toHaveLength(0);
  });
});
