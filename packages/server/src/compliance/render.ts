// Sortie humaine du §6.3.1 — partagée entre l'adaptateur GitHub (corps du check run) et
// la page servie derrière la targetUrl (§6.3.1 : elle porte « la même sortie »). Chaque
// cause est identifiable en un clic (CA-25).

import type { ComplianceResult } from '@cct/core';

export function renderHumanOutput(result: ComplianceResult): string {
  const lines: string[] = [result.headline, ''];
  if (result.unresolvedBlockingThreads.length > 0) {
    lines.push('## Fils bloquants non résolus');
    for (const t of result.unresolvedBlockingThreads) {
      lines.push(`- [${firstLine(t.root.body)}](${t.root.permalink}) — @${t.root.author.login}`);
    }
    lines.push('');
  }
  if (result.formatDiagnostics.length > 0) {
    lines.push('## Diagnostics de format');
    for (const d of result.formatDiagnostics) {
      const fix = d.fix ? ` — correction : \`${d.fix.replacement}\`` : '';
      lines.push(`- [\`${d.code}\`](${d.comment.permalink}) (${d.severity}) ${d.message}${fix}`);
    }
    lines.push('');
  }
  if (result.notices.length > 0) {
    lines.push('## Faits signalés');
    for (const n of result.notices) {
      const actor = n.actor ? ` — @${n.actor.login}` : '';
      const at = n.at ? ` — ${n.at}` : '';
      lines.push(`- \`${n.kind}\` ${n.message}${actor}${at}`);
    }
    lines.push('');
  }
  lines.push(`[Documentation de la convention](${result.docUrl})`);
  return lines.join('\n');
}

function firstLine(body: string): string {
  return body.split(/\r?\n/).find((l) => l.trim() !== '')?.slice(0, 80) ?? '(vide)';
}
