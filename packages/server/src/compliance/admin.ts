// Point d'entrée d'administration (§6.2.4) : rapport à blanc, pose d'`activatedAt`,
// octroi et révocation d'exemption sur le chemin de repli — avec l'invariant d'atomicité
// du §6.3.2 : l'octroi n'est effectif qu'une fois l'étiquette posée.

import {
  evaluate,
  resolveConfig,
  type ComplianceResult,
  type ConfigRead,
  type Floor,
  type PrRef,
  type UserInfo,
} from '@cct/core';
import type { ServerPlatformAdapter, PlatformOperationalFacts } from './adapter.js';
import type { Storage } from './storage.js';
import { prKey, repoKey } from './keys.js';

export interface DryRunReportEntry {
  pr: PrRef;
  headline: string;
  unresolvedBlockingThreads: { permalink: string; author: string; label: string }[];
  formatDiagnostics: { permalink: string; code: string; severity: string; fix?: string }[];
}

export interface AdminDeps {
  adapter: ServerPlatformAdapter;
  storage: Storage;
  floorProvider: () => Promise<Floor | null>;
  facts: PlatformOperationalFacts;
  now?: () => Date;
}

export class AdminEntryPoint {
  readonly deps: AdminDeps & { now: () => Date };

  constructor(deps: AdminDeps) {
    this.deps = { now: () => new Date(), ...deps };
  }

  /** Rapport à blanc (§6.2.4, CA-34) : restitue ce qui échouerait si l'outil était activé
   * à la date hypothétique donnée. Ne publie aucun statut, n'écrit rien sur les PR,
   * ne persiste rien. */
  async dryRun(
    repo: { platform: string; host: string; scope: string[] },
    hypotheticalActivatedAt: string
  ): Promise<DryRunReportEntry[]> {
    const { adapter, storage, floorProvider } = this.deps;
    const floor = await floorProvider();
    const prs = await adapter.listOpenPrs(repo);
    const report: DryRunReportEntry[] = [];
    for (const pr of prs) {
      const repoRead = await adapter.fetchConfigFile(pr);
      const orgRead: ConfigRead =
        floor?.configUrl != null ? await adapter.fetchOrgConfig(floor.configUrl) : { status: 'absent' };
      // Jamais d'épinglage dans un rapport à blanc : la question posée est « et si on
      // activait aujourd'hui ? », donc la configuration vivante.
      const { config, notices } = resolveConfig(floor, orgRead, repoRead, null, false);
      config.activation.activatedAt = hypotheticalActivatedAt;
      const [threads, loose, isDraft] = await Promise.all([
        adapter.fetchThreads(pr),
        adapter.fetchStandaloneComments(pr),
        adapter.isDraft(pr),
      ]);
      const result: ComplianceResult = evaluate({
        pr,
        platform: adapter.platformProfile(),
        threads,
        loose,
        config,
        configNotices: notices,
        ctx: {
          activatedAt: hypotheticalActivatedAt,
          isDraft,
          isOverrideMember: () => false,
          knownBlockingThreadIds: await storage.getKnownBlockingThreads(prKey(pr)),
          firstVerdicts: await storage.getFirstVerdicts(prKey(pr)),
        },
      });
      report.push({
        pr,
        headline: result.headline,
        unresolvedBlockingThreads: result.unresolvedBlockingThreads.map((t) => ({
          permalink: t.root.permalink,
          author: t.root.author.login,
          label: firstWord(t.root.body),
        })),
        formatDiagnostics: result.formatDiagnostics.map((d) => ({
          permalink: d.comment.permalink,
          code: d.code,
          severity: d.severity,
          ...(d.fix ? { fix: d.fix.replacement } : {}),
        })),
      });
    }
    return report;
  }

  /** Pose la date de bascule pour un dépôt dont le fichier ne la porte pas (§6.2.4, §6.4). */
  async setActivatedAt(
    repo: { platform: string; host: string; scope: string[] },
    activatedAt: string
  ): Promise<void> {
    if (Number.isNaN(Date.parse(activatedAt))) {
      throw new AdminError(400, 'activatedAt must be an ISO 8601 date');
    }
    await this.deps.storage.setStoredActivatedAt(repoKey(repo), activatedAt);
  }

  /** Octroi d'une exemption sur le chemin de repli (§6.2.4, §6.3.2, CA-39).
   * Ordre normatif : habilitation vérifiée → exemption persistée EN ATTENTE → étiquette
   * posée → exemption CONFIRMÉE. Si la pose échoue, l'enregistrement en attente est
   * supprimé et l'opération est refusée — le point d'entrée ne répond « accordée » que
   * lorsque les deux morceaux existent. */
  async grantExemption(pr: PrRef, requester: UserInfo, reason?: string): Promise<void> {
    const { adapter, storage, now } = this.deps;
    if (this.deps.facts.labelProvenanceExposed) {
      throw new AdminError(
        409,
        'this platform exposes label provenance: exemptions are granted by putting the label on the PR, not through this entry point (§6.3.2)'
      );
    }
    const key = prKey(pr);
    const config = await this.effectiveConfig(pr);

    // Atteindre le point d'entrée ne suffit pas : les deux habilitations sont distinctes
    // (§6.2.4). Le demandeur doit appartenir à chacun des groupes cités (§8.1.1).
    const groups = config.resolverOverrideGroup;
    let habilitated = groups.length > 0;
    for (const group of groups) {
      if (!(await adapter.isInGroup(requester, group).catch(() => false))) {
        habilitated = false;
        break;
      }
    }
    if (!habilitated) {
      await storage.appendExemptionLog({
        prKey: key,
        action: 'refused',
        by: { id: requester.id, login: requester.login },
        at: now().toISOString(),
        ...(reason ? { reason } : {}),
      });
      throw new AdminError(403, 'requester is not a member of resolverOverrideGroup');
    }

    const at = now().toISOString();
    await storage.setActiveExemption(key, { by: requester, at, state: 'pending' });
    try {
      await adapter.addLabel(pr, config.overrideLabel);
    } catch (e) {
      // Invariant d'atomicité : rien ne fuit — une exemption en attente n'est jamais
      // admise, et l'enregistrement est supprimé (§6.3.2, CA-39).
      await storage.deleteActiveExemption(key).catch(() => {});
      throw new AdminError(502, `label could not be applied, exemption refused: ${String(e)}`);
    }
    await storage.setActiveExemption(key, { by: requester, at, state: 'confirmed' });
    await storage.appendExemptionLog({
      prKey: key,
      action: 'granted',
      by: { id: requester.id, login: requester.login },
      at,
      ...(reason ? { reason } : {}),
    });
  }

  /** Révocation (§6.2.4) : supprime l'exemption active ET retire l'étiquette — sur ce
   * chemin, retirer l'étiquette à la main ne révoque rien (§6.3.2). */
  async revokeExemption(pr: PrRef, requester: UserInfo, reason?: string): Promise<void> {
    const { adapter, storage, now } = this.deps;
    const key = prKey(pr);
    const config = await this.effectiveConfig(pr);
    const groups = config.resolverOverrideGroup;
    let habilitated = groups.length > 0;
    for (const group of groups) {
      if (!(await adapter.isInGroup(requester, group).catch(() => false))) {
        habilitated = false;
        break;
      }
    }
    if (!habilitated) throw new AdminError(403, 'requester is not a member of resolverOverrideGroup');
    await storage.deleteActiveExemption(key);
    await adapter.removeLabel(pr, config.overrideLabel);
    await storage.appendExemptionLog({
      prKey: key,
      action: 'revoked',
      by: { id: requester.id, login: requester.login },
      at: now().toISOString(),
      ...(reason ? { reason } : {}),
    });
  }

  private async effectiveConfig(pr: PrRef) {
    const { adapter, storage, floorProvider } = this.deps;
    const floor = await floorProvider();
    const repoRead = await adapter.fetchConfigFile(pr);
    const orgRead: ConfigRead =
      floor?.configUrl != null ? await adapter.fetchOrgConfig(floor.configUrl) : { status: 'absent' };
    const flag = await storage.getRepoEvaluated(repoKey(pr));
    return resolveConfig(floor, orgRead, repoRead, null, flag.evaluated).config;
  }
}

export class AdminError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function firstWord(body: string): string {
  const m = /^[A-Za-z]+/.exec(body.trimStart());
  return m ? m[0] : '';
}
