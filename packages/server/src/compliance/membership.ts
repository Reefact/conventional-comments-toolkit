// Pré-résolution de l'habilitation (§9.2.2, étape 10 du §6.4) : membre de chacun des
// groupes cités (§8.1.1) ; liste vide → personne (§8.2). La décision reste dans core/ ;
// seule la lecture vit ici — et une lecture qui ÉCHOUE est une incapacité à évaluer
// (§6.4), jamais un « non habilité » : convertir une panne d'API en refus de résolution
// ferait passer un check au rouge sur une information qui n'a pas pu être lue.

import type { CommentInfo, EffectiveConfig, ThreadInfo, UserInfo, Zone } from '@cct/core';
import type { ServerPlatformAdapter } from './adapter.js';

export class MembershipUnreachableError extends Error {
  constructor(cause: unknown) {
    super(`isInGroup read failed: ${String(cause)}`);
  }
}

export async function resolveOverrideMembership(
  adapter: ServerPlatformAdapter,
  config: EffectiveConfig,
  threads: ThreadInfo[],
  loose: { comment: CommentInfo; zone: Zone }[],
  extraUsers: (UserInfo | undefined)[] = []
): Promise<(u: UserInfo) => boolean> {
  const groups = config.resolverOverrideGroup;
  if (groups.length === 0) return () => false; // repli terminal : n'habilite personne (§8.2)

  const users = new Map<string, UserInfo>();
  const add = (u?: UserInfo) => {
    if (u) users.set(u.id, u);
  };
  for (const t of threads) {
    add(t.root.author);
    add(t.root.lastEditedBy);
    add(t.resolvedBy);
    for (const r of t.replies) {
      add(r.author);
      add(r.lastEditedBy);
    }
  }
  for (const { comment } of loose) add(comment.author);
  for (const u of extraUsers) add(u); // l'auteur de l'exemption peut n'apparaître nulle part (§9.2.2)

  const memberById = new Map<string, boolean>();
  for (const user of users.values()) {
    let member = true;
    for (const group of groups) {
      let inGroup: boolean;
      try {
        inGroup = await adapter.isInGroup(user, group);
      } catch (e) {
        throw new MembershipUnreachableError(e);
      }
      if (!inGroup) {
        member = false;
        break;
      }
    }
    memberById.set(user.id, member);
  }
  return (u: UserInfo) => memberById.get(u.id) ?? false;
}
