// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { SelectorLog, queryChain } from '@cct/adapter-shared';
import { GithubClientAdapter } from '@cct/adapter-github';
import { AzdoClientAdapter } from '@cct/adapter-azdo';

describe('§9.4 / CA-11 — dégradation silencieuse des sélecteurs', () => {
  it('un échec de détection est tracé localement, sans dialogue ni exception', () => {
    const log = new SelectorLog();
    // Page sans aucun bouton de complétion : getCompletionControl doit renvoyer null,
    // tracer l'échec, et ne jamais lever.
    document.body.innerHTML = '<div id="empty"></div>';
    Object.defineProperty(document, 'location', {
      value: new URL('https://github.com/acme/demo/pull/42'),
      configurable: true,
    });
    const adapter = new GithubClientAdapter({ documentRef: document, log });
    expect(() => adapter.getCompletionControl()).not.toThrow();
    expect(adapter.getCompletionControl()).toBeNull();
    expect(log.failures.some((f) => f.chain === 'merge-button')).toBe(true);
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
