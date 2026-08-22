// La ligne machine cc/1 (§6.3.1) — la seule couture entre les deux composants, écrite et
// testée une seule fois, dans core/ (§9.2.2). L'ordre des couples est normatif à
// l'écriture ; le décodeur lit par clé et tolère les espaces multiples.

import type { ComplianceResult, PublishedSummary } from './types.js';
import { SUMMARY_PREFIX } from './version.js';

const STATES = ['success', 'failure', 'neutral'] as const;
const MODES = ['off', 'assist', 'warn', 'enforce'] as const;

export function encodeSummary(result: ComplianceResult): string {
  const pairs: [string, string][] = [
    ['state', result.state],
    ['draft', result.isDraft ? '1' : '0'],
    ['exempt', result.exemption ? '1' : '0'],
    ['mode', result.mode],
    ['activated', result.activatedAt ?? '-'],
    ['core', result.coreVersion],
    ['cfg', result.configFingerprint],
    ['t', String(result.counts.unresolvedThreads)],
    ['c', String(result.counts.nonCompliantComments)],
    ['w', String(result.counts.warnings)],
  ];
  return `${SUMMARY_PREFIX} ${pairs.map(([k, v]) => `${k}=${v}`).join(' ')}`;
}

/** Décode une ligne cc/1. Rend null — l'extension se comporte alors comme si aucun
 * résultat n'était publié — sur : préfixe de version inconnu, champ obligatoire manquant,
 * champ en double, valeur hors domaine. Les clés inconnues sont tolérées, l'ordre des
 * couples aussi (§6.3.1). */
export function decodeSummary(line: string): PublishedSummary | null {
  const tokens = line.trim().split(/ +/); // espaces multiples tolérées
  if (tokens.length === 0 || tokens[0] !== SUMMARY_PREFIX) return null;

  const fields = new Map<string, string>();
  for (const token of tokens.slice(1)) {
    const eq = token.indexOf('=');
    if (eq <= 0) return null;
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1);
    if (fields.has(key)) return null; // champ en double
    fields.set(key, value);
  }

  const required = ['state', 'draft', 'exempt', 'mode', 'activated', 'core', 'cfg', 't', 'c', 'w'];
  for (const key of required) if (!fields.has(key)) return null;

  const state = fields.get('state')!;
  if (!(STATES as readonly string[]).includes(state)) return null;
  const draft = fields.get('draft')!;
  const exempt = fields.get('exempt')!;
  if (!/^[01]$/.test(draft) || !/^[01]$/.test(exempt)) return null; // 0 ou 1, jamais autrement
  const mode = fields.get('mode')!;
  if (!(MODES as readonly string[]).includes(mode)) return null;
  const activated = fields.get('activated')!;
  // Le domaine est l'ISO 8601, pas « ce que Date.parse accepte » : la parsabilité seule
  // dépend de l'implémentation — la classe de dérive de bibliothèque que le document
  // proscrit (§3.4.1, §6.3.1). Forme stricte, puis validité calendaire.
  if (activated !== '-') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(activated)) return null;
    if (Number.isNaN(Date.parse(activated))) return null;
  }
  const core = fields.get('core')!;
  if (!/^\d+\.\d+\.\d+$/.test(core)) return null;
  const cfg = fields.get('cfg')!;
  if (!/^[0-9a-f]+$/.test(cfg)) return null;
  const counters: number[] = [];
  for (const key of ['t', 'c', 'w']) {
    const raw = fields.get(key)!;
    if (!/^\d+$/.test(raw)) return null;
    counters.push(Number(raw));
  }

  return {
    state: state as PublishedSummary['state'],
    isDraft: draft === '1',
    exempted: exempt === '1',
    mode: mode as PublishedSummary['mode'],
    coreVersion: core,
    configFingerprint: cfg,
    activatedAt: activated === '-' ? null : activated,
    unresolvedBlockingCount: counters[0]!,
    nonCompliantCommentCount: counters[1]!,
    warningCount: counters[2]!,
  };
}
