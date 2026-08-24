// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig, type PublishedSummary, type ThreadInfo } from '@cct/core';
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

const published = (count: number): PublishedSummary => ({
  state: count > 0 ? 'failure' : 'success',
  isDraft: false,
  exempted: false,
  mode: 'enforce',
  coreVersion: '1.0.0',
  configFingerprint: 'aaaa1111',
  activatedAt: '2026-09-01T00:00:00Z',
  unresolvedBlockingCount: count,
  nonCompliantCommentCount: 0,
  warningCount: 0,
});

describe('§5.5 / CA-03 — bandeau des fils bloquants', () => {
  it('décompte publié en titre, jamais le nombre d’ancres (CA-03)', () => {
    const threads = [thread('issue: a\n\nd', 'unresolved', 't1')];
    // Le serveur compte 3 (édition affaiblissante, résolution refusée, épinglage — §5.5),
    // l'extension n'apparie qu'une ancre.
    const model = buildBannerModel(published(3), threads, defaultConfig(), 'github', 'suggestion');
    expect(model.count).toBe(3);
    expect(model.anchors).toHaveLength(1);
    expect(model.partial).toBe(true); // « 1 sur 3 localisés »
    expect(model.fromPublished).toBe(true);
  });

  it('issue (non-blocking) n’est jamais compté localement (CA-03)', () => {
    const threads = [thread('issue (non-blocking): a\n\nd', 'unresolved', 't1')];
    expect(localBlockingUnresolved(threads, defaultConfig(), 'github', 'suggestion')).toHaveLength(0);
  });

  it('sans résumé publié : vue locale, unknown compté non résolu (§5.5, §B.5)', () => {
    const threads = [
      thread('issue: a\n\nd', 'unknown', 't1'),
      thread('issue: b\n\nd', 'resolved', 't2'),
      thread('todo: c\n\nd', 'unresolved', 't3'),
    ];
    const model = buildBannerModel(null, threads, defaultConfig(), 'github', 'suggestion');
    expect(model.fromPublished).toBe(false);
    expect(model.count).toBe(2); // t1 (unknown → non résolu) et t3 ; t2 résolu exclu
  });

  it('départage E-CONFLICT : une racine issue (blocking, non-blocking) reste comptée', () => {
    const threads = [thread('issue (blocking, non-blocking): a\n\nd', 'unresolved', 't1')];
    expect(localBlockingUnresolved(threads, defaultConfig(), 'github', 'suggestion')).toHaveLength(1);
  });
});

/** Modèle prêt à rendre, pour les cas d'affichage ci-dessous. */
function model(pub: PublishedSummary | null, threads: ThreadInfo[]) {
  return buildBannerModel(pub, threads, defaultConfig(), 'github', 'suggestion');
}

describe('§5.5 — le bandeau nomme les fils, il ne les numérote pas', () => {
  const backoff = 'issue: le retry ne borne pas le backoff\n\nAu bout de six tentatives on attend une minute.';

  it('chaque ancre porte label, sujet et auteur, pas seulement un identifiant', () => {
    const m = model(null, [thread(backoff, 'unresolved', 'dom-thread-7', 'alice')]);
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
    const pub = publishedSummary(1);
    const el = renderBanner(model(pub, [thread(backoff, 'unresolved', 'dom-thread-7', 'alice')]), pub, 'fr');
    expect(el.textContent).toContain('le retry ne borne pas le backoff');
    expect(el.textContent).toContain('@alice');
    expect(el.textContent).not.toContain('dom-thread-7');
    // Il reste porté en ATTRIBUT — le filtre et la reprise en ont besoin, l'utilisateur non.
    expect(el.querySelector('li[data-thread-id]')?.getAttribute('data-thread-id')).toBe('dom-thread-7');
  });

  it('sans sujet, le dit — jamais de repli sur l’identifiant technique', () => {
    const pub = publishedSummary(1);
    const m = model(pub, [thread('issue:\n\ndiscussion', 'unresolved', 'dom-thread-3')]);
    expect(m.anchors[0]!.subject).toBe(''); // E-EMPTY-SUBJECT (§3.5.2), le fil reste bloquant
    const el = renderBanner(m, pub, 'fr');
    expect(el.textContent).toContain('sans sujet');
    expect(el.textContent).not.toContain('dom-thread-3');
  });
});

describe('§5.5 / CA-03 — l’écart au décompte publié est une ligne, pas une soustraction', () => {
  it('une entrée déclare les fils comptés que la page ne porte pas, sans identifiant de fil', () => {
    const pub = publishedSummary(3);
    const el = renderBanner(model(pub, [thread('issue: a\n\nd', 'unresolved', 't1')]), pub, 'fr');
    expect(el.querySelectorAll('li[data-thread-id]')).toHaveLength(1); // la seule ancre appariée
    const unlocated = el.querySelector('.cct-banner-unlocated');
    expect(unlocated?.textContent).toContain('2'); // 3 comptés − 1 apparié
    expect(unlocated?.hasAttribute('data-thread-id')).toBe(false); // ne désigne aucun fil d'ici
  });

  it('décompte nul : rien à afficher, pas même une barre vide', () => {
    // Le serveur ne compte aucun fil bloquant : des ancres locales ne peuvent pas contredire
    // l'autorité (CA-03), et une PR saine ne se décore pas.
    const withLocalAnchor = model(publishedSummary(0), [thread('issue: a\n\nd', 'unresolved', 't1')]);
    expect(withLocalAnchor.anchors).toHaveLength(1);
    expect(bannerHasContent(withLocalAnchor)).toBe(false);
    expect(bannerHasContent(model(null, []))).toBe(false);
  });
});

describe('§5.5 / §10 — le bandeau accompagne le check, il ne le rejoue pas', () => {
  const threads = [thread('issue: a\n\nd', 'unresolved', 't1')];

  it('vue publiée bloquante : dépliée ; vue locale : repliée, marquée, ses liens conservés', () => {
    const pub = publishedSummary(1);
    const published = renderBanner(model(pub, threads), pub, 'fr') as HTMLDetailsElement;
    expect(published.tagName).toBe('DETAILS');
    expect(published.open).toBe(true);
    expect(published.dataset['view']).toBe('published');

    const local = renderBanner(model(null, threads), null, 'fr') as HTMLDetailsElement;
    expect(local.open).toBe(false);
    expect(local.dataset['view']).toBe('local');
    expect(local.textContent).toContain('vue locale');
    // Repliée n'est pas amputée : le §5.5 exige un lien d'ancrage vers chaque fil.
    expect(local.querySelectorAll('li[data-thread-id]')).toHaveLength(1);
  });

  it('l’en-tête est une région live : un décompte arrivé après coup est annoncé (§10)', () => {
    // Le bandeau s'insère APRÈS le chargement — un résumé publié qui arrive de façon
    // asynchrone change le décompte sans rien signaler à un lecteur d'écran. Sur l'en-tête et
    // non sur la racine : le contenu d'un `<details>` replié n'est pas dans l'arbre
    // d'accessibilité, et une région live sur la racine ferait relire toute la liste à
    // chaque dépliage. `aria-live` est une propriété : `<summary>` reste un bouton de pliage,
    // là où `role="status"` écraserait ce rôle (revue Codex, PR #26).
    const pub = publishedSummary(1);
    const head = renderBanner(model(pub, threads), pub, 'fr').querySelector('.cct-banner-head')!;
    expect(head.tagName).toBe('SUMMARY');
    expect(head.getAttribute('aria-live')).toBe('polite');
    expect(head.getAttribute('aria-atomic')).toBe('true');
    expect(head.hasAttribute('role')).toBe(false); // jamais de rôle qui écraserait le pliage
  });

  it('une icône accompagne le texte, l’information ne repose pas sur la couleur seule (§10)', () => {
    const pub = publishedSummary(1);
    const el = renderBanner(model(pub, threads), pub, 'fr');
    const glyph = el.querySelector('.cct-banner-glyph');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true'); // décor : le texte porte le sens
    expect(el.querySelector('.cct-banner-count')?.textContent).toContain('1');
  });

  it('aucune règle du bandeau n’emprunte la couleur « danger » : le verdict appartient au check', () => {
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

describe('§6.2.2 / §6.2.4 — un résumé publié n’est pas toujours un préalable au merge (revue Codex, PR #26)', () => {
  const threads = [thread('issue: a\n\nd', 'unresolved', 't1')];

  it('mode warn (jamais en échec) : les fils sont réels, mais informatifs — pas « à résoudre avant de fusionner »', () => {
    // §6.2.2 : « warn » publie un statut jamais en échec, décompte informatif.
    const pub = publishedSummary(2, { mode: 'warn', state: 'success' });
    const el = renderBanner(model(pub, threads), pub, 'fr');
    expect(el.textContent).not.toContain('à résoudre avant de fusionner');
    expect(el.textContent).toContain('à titre informatif');
    expect((el as HTMLDetailsElement).open).toBe(false); // rien n'y presse
  });

  it('PR en brouillon (toujours informatif, §6.2.4) : même verdict que warn, quel que soit le mode configuré', () => {
    const pub = publishedSummary(3, { mode: 'enforce', state: 'success', isDraft: true });
    const el = renderBanner(model(pub, threads), pub, 'fr');
    expect(el.textContent).not.toContain('à résoudre avant de fusionner');
    expect((el as HTMLDetailsElement).open).toBe(false);
  });

  it('enforce + échec réel : seul ce cas dit « à résoudre avant de fusionner » et se déplie', () => {
    const pub = publishedSummary(1, { mode: 'enforce', state: 'failure' });
    const el = renderBanner(model(pub, threads), pub, 'fr');
    expect(el.textContent).toContain('à résoudre avant de fusionner');
    expect((el as HTMLDetailsElement).open).toBe(true);
  });

  it('vue locale : n’affirme pas que la conformité est desactivée sur ce dépôt — l’absence peut être une évaluation en vol', () => {
    // `published === null` ne distingue pas « composant B non déployé » de « première
    // évaluation encore en cours, pas encore rendue dans le DOM » (§5.5) : le texte ne doit
    // trancher ni l'un ni l'autre.
    const el = renderBanner(model(null, threads), null, 'fr');
    expect(el.textContent).not.toMatch(/n.est pas vérifiée|désactivée|non vérifiée/);
    expect(el.textContent).toContain('vue locale');
    expect(el.textContent).toContain('aucun résultat publié');
  });
});

function publishedSummary(count: number, overrides: Partial<PublishedSummary> = {}): PublishedSummary {
  return { ...published(count), ...overrides };
}
