// L'état que le besoin 4 du §6.4.1 exige, porté par le check run publié plutôt que par un
// stockage appartenant à l'outil (§A.8.1).
//
// Trois objets, et trois seulement : la configuration épinglée (§8.1.3), les verdicts de
// première observation et l'ensemble des fils bloquants observés (§6.1). Les dix autres
// objets de la liste « Stockage » du §6.4 n'existent que pour un service hébergé ; ce
// support les retrouve en relisant le statut qu'il a lui-même écrit.

import { createHash } from 'node:crypto';
import type { ComplianceResult, EffectiveConfig } from '@cct/core';

export const STATE_MARKER = 'cct-state';
export const STATE_VERSION = 1;

export interface CarriedState {
  /** Marqueur de récence de l'exécution qui a écrit ce statut (besoin 3, §6.4.1). */
  run: string;
  /** Empreinte du résultat publié — c'est elle qui décide de republier ou non (§6.4). */
  digest: string;
  /** §8.1.3 — posée à la première évaluation de la PR, jamais réécrite ensuite. */
  pinned?: EffectiveConfig;
  /** §6.1 — `[bloquant, portait un E-CONFLICT]`, écrit une fois par racine. */
  first: Record<string, [0 | 1, 0 | 1]>;
  /** §6.1 — déjà observés ∪ blockingThreadIds − correctedThreadIds. */
  known: string[];
}

/** Budget d'écriture du bloc d'état. GitHub ne documente **pas** de limite de taille pour
 * `output.text` : ce budget est donc une précaution, pas la transcription d'une règle de
 * la plateforme — il est délibérément bas devant tout plafond plausible. Le dépasser ne
 * doit jamais faire échouer une évaluation, seulement lui faire perdre de la mémoire. */
export const STATE_BUDGET = 48000;

/** Le bloc est un commentaire HTML : Markdown le traverse sans le rendre, et il voyage
 * donc dans `output.text` sans rien afficher au lecteur du check. */
export function encodeState(state: CarriedState): string {
  let payload = state;
  let text = wrap(payload);
  if (text.length <= STATE_BUDGET) return text;

  // ————— Dégradation, dans l'ordre, et toujours vers le PLUS STRICT —————
  // 1. Sans `first`, l'exception de correction du §6.1 n'est plus décidable : une édition
  //    qui lève un E-CONFLICT compte alors comme affaiblissante, donc le fil reste
  //    bloquant. On perd une indulgence, jamais une garde.
  payload = { ...payload, first: {} };
  text = wrap(payload);
  if (text.length <= STATE_BUDGET) return text;

  // 2. Sans configuration épinglée, la PR est jugée sur la configuration COURANTE : un
  //    durcissement postérieur s'y applique au lieu d'être différé (§8.1.3). Là encore,
  //    la perte va dans le sens strict.
  const { pinned: _dropped, ...withoutPinned } = payload;
  return wrap(withoutPinned as CarriedState);
}

function wrap(state: CarriedState): string {
  return `<!-- ${STATE_MARKER}:${STATE_VERSION} ${JSON.stringify(state)} -->`;
}

/** Relit le bloc. Toute anomalie — marqueur absent, version inconnue, JSON illisible,
 * forme inattendue — rend `null` : une évaluation sans mémoire est correcte et stricte,
 * là où une mémoire à moitié comprise ne l'est pas. */
export function decodeState(text: string): CarriedState | null {
  const m = new RegExp(`<!--\\s*${STATE_MARKER}:(\\d+)\\s+([\\s\\S]*?)\\s*-->`).exec(text);
  if (!m || Number(m[1]) !== STATE_VERSION) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[2]!);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.run !== 'string' || typeof o.digest !== 'string') return null;
  if (!Array.isArray(o.known) || o.known.some((k) => typeof k !== 'string')) return null;
  const first: CarriedState['first'] = {};
  if (o.first !== undefined) {
    if (o.first === null || typeof o.first !== 'object') return null;
    for (const [id, v] of Object.entries(o.first as Record<string, unknown>)) {
      if (!Array.isArray(v) || v.length !== 2) return null;
      if (v.some((n) => n !== 0 && n !== 1)) return null;
      first[id] = [v[0] as 0 | 1, v[1] as 0 | 1];
    }
  }
  return {
    run: o.run,
    digest: o.digest,
    ...(o.pinned !== undefined && o.pinned !== null ? { pinned: o.pinned as EffectiveConfig } : {}),
    first,
    known: o.known as string[],
  };
}

/** Forme que `EvaluationContext.firstVerdicts` attend (§9.2.1). */
export function toFirstVerdicts(
  first: CarriedState['first']
): Record<string, { blocking: boolean; hadConflict: boolean }> {
  const out: Record<string, { blocking: boolean; hadConflict: boolean }> = {};
  for (const [id, [b, c]] of Object.entries(first)) {
    out[id] = { blocking: b === 1, hadConflict: c === 1 };
  }
  return out;
}

export function fromFirstVerdicts(
  verdicts: Record<string, { blocking: boolean; hadConflict: boolean }>
): CarriedState['first'] {
  const out: CarriedState['first'] = {};
  for (const [id, v] of Object.entries(verdicts)) {
    out[id] = [v.blocking ? 1 : 0, v.hadConflict ? 1 : 0];
  }
  return out;
}

/** Empreinte d'un résultat au sens du §6.4 : « deux résultats sont identiques lorsque
 * `headSha`, `state`, les trois compteurs, `configFingerprint`, l'ensemble des `kind` de
 * `notices` et les identifiants des fils et commentaires listés coïncident ». Les
 * horodatages en sont exclus — un `notice` réémis à chaque tour rendrait sinon la règle
 * inopérante. */
export function digestResult(result: ComplianceResult): string {
  const parts = [
    result.headSha ?? '',
    result.state,
    String(result.counts.unresolvedThreads),
    String(result.counts.nonCompliantComments),
    String(result.counts.warnings),
    result.configFingerprint,
    [...new Set(result.notices.map((n) => n.kind))].sort().join(','),
    result.unresolvedBlockingThreads
      .map((t) => t.id)
      .sort()
      .join(','),
    result.formatDiagnostics
      .map((d) => `${d.comment.id}:${d.code}`)
      .sort()
      .join(','),
  ];
  return createHash('sha256').update(parts.join(' ')).digest('hex').slice(0, 16);
}
