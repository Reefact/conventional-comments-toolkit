// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, isBlocking, type ThreadInfo } from '@cct/core';
import { bannerHasContent, buildBannerModel, localBlockingUnresolved, renderBanner } from '../src/ui/banner.js';

function thread(body: string, resolution: ThreadInfo['resolution'], id: string, login = 'u'): ThreadInfo {
  return {
    id,
    pr: { platform: 'github', createdAt: '', host: 'github.com', scope: ['a', 'b'], number: 1 },
    root: {
      id: `${id}-r`,
      author: { id: `login:${login}`, login, isServiceAccount: false },
      body,
      createdAt: '',
      permalink: `#${id}`,
      isSystemGenerated: false,
      canCarryBlockingState: true,
    },
    replies: [],
    resolution,
    canCarryBlockingState: true,
  };
}

/** Modèle prêt à rendre : la seule source du bandeau est la liste des fils lus dans la page
 * (§5.5). */
function model(threads: ThreadInfo[]) {
  return buildBannerModel(threads, defaultConfig(), 'github', 'suggestion');
}

describe('§5.5 / CA-03 — bandeau des fils bloquants', () => {
  it('le décompte est celui des fils lus dans la page, et chacun a son ancre (CA-03)', () => {
    const threads = [thread('issue: a\n\nd', 'unresolved', 't1'), thread('todo: b\n\nd', 'unresolved', 't2')];
    const m = model(threads);
    expect(m.count).toBe(2);
    expect(m.anchors.map((a) => a.threadId)).toEqual(['t1', 't2']);
  });

  it('issue (non-blocking) n’est compté ni par isBlocking() ni par le bandeau — les deux concordent (CA-03)', () => {
    const threads = [
      thread('issue (non-blocking): a\n\nd', 'unresolved', 't1'),
      thread('issue: b\n\nd', 'unresolved', 't2'),
    ];
    // La même question posée à `core/` : le bandeau ne doit compter, en valeur comme en sens,
    // que ce qu'`isBlocking()` tient pour bloquant.
    const blockingIds = threads
      .filter((t) =>
        isBlocking(
          {
            body: t.root.body,
            platform: { id: 'github', suggestionInfoString: 'suggestion' },
            isSystemGenerated: false,
            zone: 'thread-root',
            canCarryBlockingState: true,
          },
          defaultConfig()
        )
      )
      .map((t) => t.id);
    expect(blockingIds).toEqual(['t2']);
    expect(localBlockingUnresolved(threads, defaultConfig(), 'github', 'suggestion').map((t) => t.id)).toEqual(
      blockingIds
    );
    expect(model(threads).count).toBe(blockingIds.length);
  });

  it('unknown compté non résolu, un fil résolu exclu (§5.5, §B.5)', () => {
    const threads = [
      thread('issue: a\n\nd', 'unknown', 't1'),
      thread('issue: b\n\nd', 'resolved', 't2'),
      thread('todo: c\n\nd', 'unresolved', 't3'),
    ];
    expect(model(threads).count).toBe(2); // t1 (unknown → non résolu) et t3 ; t2 résolu exclu
  });

  it('un fil qui ne peut pas porter d’état bloquant n’est jamais compté (CA-21)', () => {
    const unresolvable = { ...thread('issue: a\n\nd', 'unresolved', 't1'), canCarryBlockingState: false };
    expect(model([unresolvable]).count).toBe(0);
  });

  it('départage E-CONFLICT : une racine issue (blocking, non-blocking) reste comptée', () => {
    const threads = [thread('issue (blocking, non-blocking): a\n\nd', 'unresolved', 't1')];
    expect(localBlockingUnresolved(threads, defaultConfig(), 'github', 'suggestion')).toHaveLength(1);
  });

  it('décompte nul : rien à afficher, pas même une barre vide', () => {
    expect(bannerHasContent(model([thread('issue: a\n\nd', 'resolved', 't1')]))).toBe(false);
    expect(bannerHasContent(model([]))).toBe(false);
  });
});

describe('§5.5 — le bandeau nomme les fils, il ne les numérote pas', () => {
  const backoff = 'issue: le retry ne borne pas le backoff\n\nAu bout de six tentatives on attend une minute.';

  it('chaque ancre porte label, sujet et auteur, pas seulement un identifiant', () => {
    const m = model([thread(backoff, 'unresolved', 'dom-thread-7', 'alice')]);
    expect(m.anchors[0]).toMatchObject({
      threadId: 'dom-thread-7',
      label: 'issue',
      subject: 'le retry ne borne pas le backoff',
      author: 'alice',
    });
  });

  it('le texte rendu montre le sujet et l’auteur, jamais l’identifiant technique du fil', () => {
    // `dom-thread-7` est l'index du conteneur dans le DOM, dérivé faute d'`id` sur la page
    // (adaptateur GitHub) : utile pour apparier, illisible pour un humain.
    const el = renderBanner(model([thread(backoff, 'unresolved', 'dom-thread-7', 'alice')]), 'fr');
    expect(el.textContent).toContain('le retry ne borne pas le backoff');
    expect(el.textContent).toContain('@alice');
    expect(el.textContent).not.toContain('dom-thread-7');
    // Il reste porté en ATTRIBUT — le filtre et la reprise en ont besoin, l'utilisateur non.
    expect(el.querySelector('li[data-thread-id]')?.getAttribute('data-thread-id')).toBe('dom-thread-7');
  });

  it('sans sujet, le dit — jamais de repli sur l’identifiant technique', () => {
    const m = model([thread('issue:\n\ndiscussion', 'unresolved', 'dom-thread-3')]);
    expect(m.anchors[0]!.subject).toBe(''); // E-EMPTY-SUBJECT (§3.5.2), le fil reste bloquant
    const el = renderBanner(m, 'fr');
    expect(el.textContent).toContain('sans sujet');
    expect(el.textContent).not.toContain('dom-thread-3');
  });
});

describe('§5.5 / §10 — le bandeau signale, il n’empêche rien (O3)', () => {
  const threads = [thread('issue: a\n\nd', 'unresolved', 't1')];

  it('replié par défaut, ses liens conservés ; un choix de l’appelant l’emporte', () => {
    const el = renderBanner(model(threads), 'fr') as HTMLDetailsElement;
    expect(el.tagName).toBe('DETAILS');
    expect(el.open).toBe(false);
    // Replié n'est pas amputé : le §5.5 exige un lien d'ancrage vers chaque fil.
    expect(el.querySelectorAll('li[data-thread-id]')).toHaveLength(1);
    expect((renderBanner(model(threads), 'fr', { open: true }) as HTMLDetailsElement).open).toBe(true);
  });

  it('ne présente jamais ces fils comme un préalable à la fusion, dans aucune langue (O3, §2)', () => {
    // Le produit ne contrôle pas la complétion d'une PR (§2) : une rédaction antérieure
    // disait « à résoudre avant de fusionner », affirmation qu'aucun composant ne tient plus.
    const fr = renderBanner(model(threads), 'fr').textContent ?? '';
    const en = renderBanner(model(threads), 'en').textContent ?? '';
    expect(fr).not.toMatch(/fusion/i);
    expect(en).not.toMatch(/merg/i);
    expect(fr).toContain('1 fil(s) bloquant(s) non résolu(s)');
    expect(en).toContain('1 unresolved blocking thread(s)');
  });

  it('l’en-tête est une région live : un décompte arrivé après coup est annoncé (§10)', () => {
    // Le bandeau s'insère APRÈS le chargement — des fils chargés de façon asynchrone changent le
    // décompte sans rien signaler à un lecteur d'écran. Sur l'en-tête et non sur la racine : le
    // contenu d'un `<details>` replié n'est pas dans l'arbre d'accessibilité, et une région
    // live sur la racine ferait relire toute la liste à chaque dépliage. `aria-live` est une
    // propriété : `<summary>` reste un bouton de pliage, là où `role="status"` écraserait ce
    // rôle (revue Codex, PR #26).
    const head = renderBanner(model(threads), 'fr').querySelector('.cct-banner-head')!;
    expect(head.tagName).toBe('SUMMARY');
    expect(head.getAttribute('aria-live')).toBe('polite');
    expect(head.getAttribute('aria-atomic')).toBe('true');
    expect(head.hasAttribute('role')).toBe(false); // jamais de rôle qui écraserait le pliage
  });

  it('une icône accompagne le texte, l’information ne repose pas sur la couleur seule (§10)', () => {
    const el = renderBanner(model(threads), 'fr');
    const glyph = el.querySelector('.cct-banner-glyph');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true'); // décor : le texte porte le sens
    expect(el.querySelector('.cct-banner-count')?.textContent).toContain('1');
  });

  it('aucune règle du bandeau n’emprunte la couleur « danger » : le bandeau signale, il n’alerte pas', () => {
    // Commentaires retirés d'abord : celui qui explique POURQUOI le danger a disparu emploie
    // forcément le mot, et le ferait échouer sur sa propre justification.
    // Chemin depuis la racine du dépôt : sous happy-dom, `import.meta.url` est une URL http.
    const css = readFileSync(
      resolve(process.cwd(), 'packages/extension/src/styles.css'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const bannerRules = css.split('}').filter((rule) => rule.includes('.cct-banner') && rule.includes('{'));
    expect(bannerRules.length).toBeGreaterThan(0);
    for (const rule of bannerRules) expect(rule).not.toMatch(/danger/);
  });
});
