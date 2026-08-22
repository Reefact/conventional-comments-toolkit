// Chaînes d'interface de l'extension (fr/en) — les identifiants de labels restent en
// anglais (§10, Internationalisation) ; seules descriptions et infobulles sont traduites.

const fr: Record<string, string> = {
  'toolbar.aria': 'Barre d’outils Conventional Comments',
  'toolbar.decoration.none': 'aucune',
  'toolbar.decoration.free': 'décoration libre…',
  'pastille.compliant': 'Conforme',
  'pastille.compliant-with-warnings': 'Conforme, avec avertissements',
  'pastille.non-compliant': 'Non conforme',
  'pastille.degraded':
    'Configuration non lue : l’extension assiste sans connaître les règles, et ne bloque pas l’envoi.',
  'pastille.fingerprint-mismatch':
    'Configuration décalée par rapport au serveur : l’envoi n’est plus bloqué tant que l’écart dure (§8.1.3).',
  'guard.blocked': 'Envoi bloqué : le commentaire n’est pas conforme. {details}',
  'fix.apply': 'Corriger',
  'alias.rewrite': 'Réécrire « {from} » en « {to} »',
  'banner.title': '{count} fil(s) bloquant(s) non résolu(s)',
  'banner.partial': '{located} sur {count} localisés — voir le statut pour le détail',
  'banner.local':
    'Vue locale (aucun résultat publié) : {count} fil(s) bloquant(s) non résolu(s) d’après la page',
  'banner.judged': 'jugée en {mode} par core/ {coreVersion}',
  'merge.blocked': 'Complétion bloquée par le statut de conformité — voir le check.',
  'label.praise': 'Souligne un point positif.',
  'label.nitpick': 'Préférence triviale, sans enjeu réel.',
  'label.suggestion': 'Proposition d’amélioration argumentée.',
  'label.issue': 'Problème identifié. Idéalement accompagné d’une suggestion.',
  'label.todo': 'Changement petit mais nécessaire.',
  'label.question': 'Demande de clarification sur un point incertain.',
  'label.thought': 'Idée surgie pendant la revue, sans demande d’action.',
  'label.chore': 'Tâche annexe à réaliser avant acceptation.',
  'label.note': 'Information à porter à connaissance.',
  'label.decision': 'Acte le choix de ne pas traiter un point soulevé, en énonçant pourquoi.',
  'label.typo': 'Faute de frappe.',
  'label.polish': 'Amélioration de finition.',
  'label.quibble': 'Point de détail discutable.',
  'label.example': 'Exemple : « {example} »',
  'example.praise': 'praise: gestion d’erreur très lisible',
  'example.nitpick': 'nitpick: virgule finale',
  'example.suggestion': 'suggestion (non-blocking): extraire une méthode',
  'example.issue': 'issue: fuite mémoire sur le handler',
  'example.todo': 'todo: renommer la variable',
  'example.question': 'question (non-blocking): pourquoi ce choix ?',
  'example.thought': 'thought: on pourrait factoriser plus tard',
  'example.chore': 'chore: relancer le job de couverture',
  'example.note': 'note: ce module part en refonte au T3',
  'example.decision': 'decision: hors périmètre, dette suivie en PROJ-142',
  'example.typo': 'typo: « recieve » → « receive »',
  'example.polish': 'polish: aligner les imports',
  'example.quibble': 'quibble: nom un peu long',
  'banner.filter': 'Filtrer par label',
  'banner.filter.all': 'tous',
};

const en: Record<string, string> = {
  'toolbar.aria': 'Conventional Comments toolbar',
  'toolbar.decoration.none': 'none',
  'toolbar.decoration.free': 'free decoration…',
  'pastille.compliant': 'Compliant',
  'pastille.compliant-with-warnings': 'Compliant, with warnings',
  'pastille.non-compliant': 'Non-compliant',
  'pastille.degraded':
    'Configuration unread: the extension assists without knowing the rules, and does not block sending.',
  'pastille.fingerprint-mismatch':
    'Configuration out of sync with the server: sending is no longer blocked while the gap lasts (§8.1.3).',
  'guard.blocked': 'Sending blocked: the comment is not compliant. {details}',
  'fix.apply': 'Fix',
  'alias.rewrite': 'Rewrite "{from}" as "{to}"',
  'banner.title': '{count} unresolved blocking thread(s)',
  'banner.partial': '{located} of {count} located — see the status for details',
  'banner.local': 'Local view (no published result): {count} unresolved blocking thread(s) from the page',
  'banner.judged': 'judged in {mode} by core/ {coreVersion}',
  'merge.blocked': 'Completion blocked by the compliance status — see the check.',
  'label.praise': 'Highlights something positive.',
  'label.nitpick': 'Trivial preference, no real stake.',
  'label.suggestion': 'Argued improvement proposal.',
  'label.issue': 'Identified problem. Ideally with a suggestion.',
  'label.todo': 'Small but necessary change.',
  'label.question': 'Clarification request on an uncertain point.',
  'label.thought': 'Idea that came up during review, no action requested.',
  'label.chore': 'Side task to complete before acceptance.',
  'label.note': 'Information worth knowing.',
  'label.decision': 'Records the choice NOT to address a raised point, stating why.',
  'label.typo': 'Typo.',
  'label.polish': 'Finishing touch.',
  'label.quibble': 'Debatable detail.',
  'label.example': 'Example: "{example}"',
  'example.praise': 'praise: very readable error handling',
  'example.nitpick': 'nitpick: trailing comma',
  'example.suggestion': 'suggestion (non-blocking): extract a method',
  'example.issue': 'issue: memory leak in the handler',
  'example.todo': 'todo: rename the variable',
  'example.question': 'question (non-blocking): why this choice?',
  'example.thought': 'thought: we could factor this out later',
  'example.chore': 'chore: re-run the coverage job',
  'example.note': 'note: this module is being reworked in Q3',
  'example.decision': 'decision: out of scope, debt tracked in PROJ-142',
  'example.typo': 'typo: "recieve" → "receive"',
  'example.polish': 'polish: align the imports',
  'example.quibble': 'quibble: slightly long name',
  'banner.filter': 'Filter by label',
  'banner.filter.all': 'all',
};

const catalogs: Record<string, Record<string, string>> = { fr, en };

export function ui(lang: string, key: string, params?: Record<string, string | number>): string {
  const base = lang.toLowerCase().split(/[-_]/)[0] ?? 'en';
  let template = catalogs[base]?.[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) template = template.split(`{${k}}`).join(String(v));
  }
  return template;
}
