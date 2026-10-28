// Résolution de la configuration effective (§8.1.2, §8.1.3 r.1, §8.1.5).
// `resolveConfig()` porte la règle — précédence, fusion, bornes, mélange épinglé — mais
// aucune entrée-sortie : l'épinglage est lu et écrit par le composant B (§9.2.2).

import type { ConfigRead, EffectiveConfig, Floor, LabelConfig, Notice } from '../types.js';
import { defaultConfig } from './defaults.js';
import { parseConfigDocument } from './schema.js';
import { mergeLevel } from './merge.js';
import { applyFloor, maxMode, vetFloor, vettedConfigUrl } from './floor.js';
import { mixPinnedWithLive } from './pinning.js';

export interface ResolvedConfig {
  config: EffectiveConfig;
  notices: Notice[];
}

export function resolveConfig(
  floor: Floor | null,
  org: ConfigRead,
  repo: ConfigRead,
  pinned: EffectiveConfig | null,
  previouslyEvaluated: boolean
): ResolvedConfig {
  const notices: Notice[] = [];
  const vetted = vetFloor(floor);
  notices.push(...vetted.notices);

  const written = new Set<string>();
  let config = defaultConfig();
  let unsupportedDocument = false;

  // Niveau 2 — configuration d'organisation (§8.1.2).
  if (org.status === 'found') {
    const parsed = parseConfigDocument(org.text, { level: 'org' });
    notices.push(...parsed.notices);
    if (parsed.unsupported) {
      unsupportedDocument = true; // repli §8.1.5 : le document n'est pas appliqué
    } else if (!parsed.invalid && parsed.values) {
      config = mergeLevel(config, parsed.values);
      recordWrites(parsed.values, written);
    }
    // invalide → repli sur le dernier niveau valide : les défauts (§8.1.5)
  }

  // Niveau 1 — fichier de dépôt (§8.1.2).
  if (repo.status === 'found') {
    const parsed = parseConfigDocument(repo.text, { level: 'repo' });
    notices.push(...parsed.notices);
    if (parsed.unsupported) {
      unsupportedDocument = true;
    } else if (!parsed.invalid && parsed.values) {
      config = mergeLevel(config, parsed.values);
      recordWrites(parsed.values, written);
    }
    // invalide → repli sur le dernier niveau valide : organisation, puis défauts (§8.1.5)
  } else if (repo.status === 'absent' && previouslyEvaluated) {
    // Incident, pas une désactivation (§8.1.5) : `git rm` ne doit ni éteindre ni bloquer.
    notices.push({
      kind: 'config-vanished',
      message:
        'the .conventional-comments.json file has disappeared from an already-evaluated repository: incident, not a deactivation (§8.1.5)',
    });
  }

  // Activation vivante : min(plancher, niveau inférieur) — une date plus ancienne durcit
  // (§8.1.1). Calculée à part parce que son durcissement par le plancher est épinglé.
  const floorAt = vetted.unsupported ? undefined : vetted.floor.activation?.activatedAt;
  const lowerAt = config.activation.activatedAt;
  let liveActivation: string | null;
  if (floorAt === undefined) liveActivation = lowerAt;
  else if (lowerAt === null) liveActivation = floorAt;
  else liveActivation = Date.parse(floorAt) < Date.parse(lowerAt) ? floorAt : lowerAt;

  // Mélange épinglé (§8.1.3, règle 1) — avant les bornes, qui s'appliquent en direct
  // dans les deux sens (sauf l'activation, traitée par le mélange lui-même).
  if (pinned !== null) {
    const live = structuredClone(config);
    live.activation = { activatedAt: liveActivation };
    config = mixPinnedWithLive(pinned, live);
  } else {
    config.activation = { activatedAt: liveActivation };
  }

  // Bornes d'entreprise (§8.1.1) — en direct, y compris sur une configuration épinglée.
  if (!vetted.unsupported) {
    const floored = applyFloor(config, vetted.floor, written, { skipActivation: true });
    config = floored.config;
    notices.push(...floored.notices);
  }

  // Aucun ombrage entre labels et alias (§8.2) — sur la liste résolue, plancher compris :
  // c'est l'état des labels ACTIFS qui décide des conflits, et le plancher en active.
  config.labels = withoutShadowing(config.labels, notices);

  // Replis de version (§8.1.5, dernière ligne ; §8.1.1 pour le plancher).
  if (vetted.unsupported) {
    // Plancher illisible : repli en mode assist — le plancher précédemment connu, s'il est
    // plus strict, est substitué par l'appelant avant l'appel (§8.1.1).
    config.mode = 'assist';
  } else if (unsupportedDocument) {
    // Document qu'on sait lire mais qu'on ne sait pas appliquer entièrement : mode assist,
    // ou le plancher en vigueur s'il est plus strict — identique pour A et B (§8.1.5).
    config.mode = maxMode('assist', vetted.floor.minimumMode ?? 'off');
  }

  // configUrl provient exclusivement du canal de plancher (§8.1.2).
  config.configUrl = vettedConfigUrl(vetted);

  // Limite basse de sévérité (§8.2), appliquée quel que soit le chemin — y compris quand
  // le plancher n'a pas pu être appliqué : un code E- ne descend jamais sous warn.
  for (const [code, sev] of Object.entries(config.severities)) {
    if (code.startsWith('E-') && sev === 'off') {
      config.severities[code] = 'warn';
      if (!notices.some((n) => n.kind === 'config-warning' && n.ref === `severities.${code}`)) {
        notices.push({
          kind: 'config-warning',
          message: `severity of "${code}" cannot go below "warn" (§8.2): value "off" raised to "warn"`,
          ref: `severities.${code}`,
        });
      }
    }
  }

  return { config, notices };
}

/**
 * Aucun ombrage entre labels et alias (§8.2). La résolution compare, label par label DANS
 * L'ORDRE, l'`id` puis les alias : deux labels actifs partageant un nom laissent donc l'ordre
 * de la liste décider du verdict. La règle retire le nom en trop et le signale.
 *
 * Elle ne regarde jamais l'ordre, et ne retire jamais un label entier pour un alias :
 *  - un IDENTIFIANT l'emporte sur un alias : l'alias qui reprend l'`id` d'un autre label actif
 *    est retiré de son porteur. L'identité d'un label est son `id` ; un alias n'est qu'une
 *    orthographe admise en plus. C'est ce qui ferme le contournement du plancher sans règle à
 *    part : sous `{"minimum": ["issue"]}`, un label non bloquant portant `issue` en alias perd
 *    cet alias, et `issue:` reste le `issue` planché, bloquant (revue Codex, PR #88). Une équipe
 *    qui veut changer le sens de `note:` redéclare `note`, par son `id` — la fusion est faite
 *    pour ça (§8.1.4) ;
 *  - un alias porté par DEUX labels n'appartient à aucun : il est retiré des deux. Ni l'un ni
 *    l'autre n'a de titre à le garder, et en laisser un l'attribuerait selon l'ordre ;
 *  - deux `id` qui ne diffèrent que par la casse — la fusion compare au caractère près, la
 *    résolution sans égard à la casse — ne peuvent pas se départager ainsi : le second dans la
 *    liste est écarté. C'est le seul cas où l'ordre décide, il est signalé, et il suppose une
 *    configuration qui écrit deux fois le même label.
 *
 * Seuls les labels ACTIFS entrent en conflit : un label désactivé est écarté par la résolution
 * avant ses alias, il ne décide d'aucun verdict. Compter les labels inertes ferait qu'une
 * entrée éteinte retire un alias à un label actif, ou signale tout dépôt possédant son propre
 * label `fixed` alors que le `done` livré, qui porte cet alias, est désactivé.
 *
 * Le nom retiré quitte la configuration effective, donc le domaine de `fingerprint()` : les
 * deux composants voient la même liste, quel que soit celui qui applique la règle.
 */
function withoutShadowing(labels: LabelConfig[], notices: Notice[]): LabelConfig[] {
  const lower = (n: string) => n.toLowerCase();
  const warn = (ref: string, message: string) =>
    notices.push({ kind: 'config-warning', message: `${message} (§8.2)`, ref });

  // Deux `id` égaux à la casse près : le second cède.
  const out: LabelConfig[] = [];
  const seenIds = new Map<string, string>();
  for (const l of labels) {
    const prior = l.enabled ? seenIds.get(lower(l.id)) : undefined;
    if (prior !== undefined) {
      warn(`labels.${l.id}`, `label "${l.id}" ignored: its id differs from label "${prior}" only by case`);
      continue;
    }
    if (l.enabled) seenIds.set(lower(l.id), l.id);
    out.push({ ...l, aliases: [...l.aliases] });
  }

  const active = out.filter((l) => l.enabled);
  const ids = new Map(active.map((l) => [lower(l.id), l.id]));
  const carriers = new Map<string, LabelConfig[]>();
  for (const l of active) {
    for (const a of new Set(l.aliases.map(lower))) carriers.set(a, [...(carriers.get(a) ?? []), l]);
  }
  for (const [alias, owners] of carriers) {
    const asId = ids.get(alias);
    // Un alias qui reprend son PROPRE `id` ne masque rien.
    const losers = asId !== undefined ? owners.filter((o) => lower(o.id) !== alias) : owners.length > 1 ? owners : [];
    for (const o of losers) {
      o.aliases = o.aliases.filter((a) => lower(a) !== alias);
      warn(
        `labels.${o.id}.aliases`,
        asId !== undefined
          ? `alias "${alias}" removed from label "${o.id}": it is the id of label "${asId}"`
          : `alias "${alias}" removed from label "${o.id}": it is also an alias of ${owners
              .filter((x) => x !== o)
              .map((x) => `"${x.id}"`)
              .join(', ')}`
      );
    }
  }
  return out;
}

function recordWrites(values: Record<string, unknown>, written: Set<string>): void {
  for (const [key, value] of Object.entries(values)) {
    written.add(key);
    if (key === 'severities') {
      for (const code of Object.keys(value as Record<string, unknown>)) written.add(`severities.${code}`);
    } else if (key === 'labels') {
      for (const entry of value as {
        id: string;
        enabled?: boolean;
        blockingByDefault?: boolean;
        alwaysNonBlocking?: boolean;
      }[]) {
        if (entry.enabled === false) written.add(`labels.${entry.id}.enabled`);
        if (entry.blockingByDefault === false) written.add(`labels.${entry.id}.blockingByDefault`);
        // §8.1.1 : `alwaysNonBlocking` est plancher-able à son tour — l'écrire à `true` sous
        // un plancher qui l'interdit est un assouplissement à signaler.
        if (entry.alwaysNonBlocking === true) written.add(`labels.${entry.id}.alwaysNonBlocking`);
      }
    } else if (key === 'rules') {
      for (const k of Object.keys(value as Record<string, unknown>)) written.add(`rules.${k}`);
    }
  }
}
