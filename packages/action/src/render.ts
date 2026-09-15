// Sortie humaine du §6.3.1 — le corps Markdown du check run. Chaque cause y est
// identifiable en un clic (CA-25).
//
// La langue suit la règle de résolution du §8.1, d'où le paramètre `lang` : elle vient de
// `EffectiveConfig.language`, résolue en même temps que le reste. Une rédaction antérieure
// de ce rendu, côté serveur, codait les trois titres en français en dur — ce qui donnait
// une sortie française à un dépôt configuré en anglais, alors que les diagnostics qu'elle
// encadre, eux, étaient bien traduits.
//
// Elle parlait aussi d'« une page servie derrière la targetUrl » qui porterait la même
// sortie. Cette page n'existe plus : le §6.3.1 ne fait plus de la `targetUrl` le porteur de
// quoi que ce soit, et un vérificateur qui ne survit pas à sa propre exécution ne sert
// aucune page.

import { t, type ComplianceResult } from '@cct/core';

export function renderHumanOutput(result: ComplianceResult, lang: string | null): string {
  const lines: string[] = [result.headline, ''];
  if (result.unresolvedBlockingThreads.length > 0) {
    lines.push(`## ${t(lang, 'output.unresolved-blocking-threads')}`);
    for (const thread of result.unresolvedBlockingThreads) {
      lines.push(
        `- [${firstLine(thread.root.body, lang)}](${thread.root.permalink}) — @${thread.root.author.login}`
      );
    }
    lines.push('');
  }
  if (result.formatDiagnostics.length > 0) {
    lines.push(`## ${t(lang, 'output.format-diagnostics')}`);
    for (const diagnostic of result.formatDiagnostics) {
      const fix = diagnostic.fix
        ? ` — ${t(lang, 'output.fix')} : \`${diagnostic.fix.replacement}\``
        : '';
      lines.push(
        `- [\`${diagnostic.code}\`](${diagnostic.comment.permalink}) (${diagnostic.severity}) ${diagnostic.message}${fix}`
      );
    }
    lines.push('');
  }
  if (result.notices.length > 0) {
    lines.push(`## ${t(lang, 'output.notices')}`);
    for (const notice of result.notices) {
      const actor = notice.actor ? ` — @${notice.actor.login}` : '';
      const at = notice.at ? ` — ${notice.at}` : '';
      lines.push(`- \`${notice.kind}\` ${notice.message}${actor}${at}`);
    }
    lines.push('');
  }
  lines.push(`[${t(lang, 'output.doc-link')}](${result.docUrl})`);
  return lines.join('\n');
}

function firstLine(body: string, lang: string | null): string {
  return body.split(/\r?\n/).find((line) => line.trim() !== '')?.slice(0, 80)
    ?? t(lang, 'output.empty-body');
}
