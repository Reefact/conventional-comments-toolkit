// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { SelectorLog, queryChain } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';

describe('§9.4 / CA-11 — dégradation silencieuse des sélecteurs', () => {
  it('un échec de détection est tracé localement, sans dialogue ni exception', async () => {
    const log = new SelectorLog();
    // Page vidée de tout ce que GitHub y rend : la lecture de la configuration du dépôt reçoit
    // un 404 et interroge la page pour savoir si le dépôt est public (adapters/github,
    // `getRepoConfig()`) — la sonde ne trouve rien, doit le tracer, et ne jamais lever. Un 404
    // reste lu comme « pas de fichier » : la dégradation ne coûte que le diagnostic.
    document.body.innerHTML = '<div id="empty"></div>';
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/42'),
      configurable: true,
    });
    const fetchImpl = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const adapter = new GithubClientAdapter({ documentRef: document, log, fetchImpl });
    const pr = adapter.currentPr()!;
    await expect(adapter.getRepoConfig(pr)).resolves.toEqual({ status: 'absent' });
    expect(log.failures.some((f) => f.chain === 'repository-public-meta')).toBe(true);
  });

  it('la télémétrie n’est notifiée que si elle est activée (opt-in, §10)', () => {
    const telemetry = vi.fn();
    const withTelemetry = new SelectorLog(telemetry);
    const withoutTelemetry = new SelectorLog(null); // défaut : désactivée
    const chain = { name: 'x', candidates: ['.absent'] };
    withoutTelemetry.degraded(chain);
    expect(telemetry).not.toHaveBeenCalled();
    withTelemetry.degraded(chain);
    expect(telemetry).toHaveBeenCalledWith({ kind: 'selector-degradation', chain: 'x' });
  });

  it('queryChain tente chaque candidat dans l’ordre et n’explose pas sur l’absence', () => {
    document.body.innerHTML = '<textarea class="legacy"></textarea>';
    const outcome = queryChain(document, { name: 'e', candidates: ['.react-only', 'textarea.legacy'] });
    expect(outcome.matched).toBe('textarea.legacy');
    const missing = queryChain(document, { name: 'e', candidates: ['.nope'] });
    expect(missing.element).toBeNull();
    expect(missing.matched).toBeNull();
  });

  it('un adaptateur Azure DevOps sur une page sans éditeur n’empêche pas l’usage de la page', () => {
    document.body.innerHTML = '<main>contenu normal</main>';
    Object.defineProperty(document, 'location', {
      value: new URL('https://dev.azure.com/org/proj/_git/repo/pullrequest/7'),
      configurable: true,
    });
    const adapter = new AzdoClientAdapter({ documentRef: document });
    let count = 0;
    const disposable = adapter.observeEditors(() => count++);
    expect(count).toBe(0); // aucun éditeur, aucun cb, aucune exception
    expect(document.querySelector('main')?.textContent).toBe('contenu normal'); // page intacte
    disposable.dispose();
  });
});
