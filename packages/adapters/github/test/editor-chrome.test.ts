// @vitest-environment happy-dom
// Le CHÂSSIS du composeur GitHub (§5.1, §5.3, §9.2.3 `getEditorChrome`).
//
// Ces cas vivaient dans packages/extension/test/editor-controller.test.ts — le fichier de test
// du contrôleur PARTAGÉ —, où ils exerçaient deux littéraux GitHub écrits en dur dans ce même
// contrôleur. Le §9.4 veut les sélecteurs DOM « centralisés dans un fichier unique par
// adaptateur » ; le code est parti dans github/src/selectors.ts, et ses tests l'ont suivi.
// C'est la moitié qu'on oublie : un test qui connaît la forme du DOM d'une plateforme
// appartient à cette plateforme, exactement comme le sélecteur qu'il exerce.

import { describe, expect, it } from 'vitest';
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
