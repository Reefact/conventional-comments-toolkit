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
  'banner.count': '{count} fil(s) bloquant(s)',
  'banner.hint': 'à résoudre avant de fusionner',
  'banner.hint.informative': 'signalé à titre informatif, ne bloque pas la fusion',
  'banner.count.local': '{count} fil(s) bloquant(s) ouvert(s) sur cette page',
  'banner.hint.local': 'vue locale — aucun résultat publié pour cette PR',
  'banner.unlocated':
    '{missing} fil(s) compté(s) par la vérification, absent(s) de cette page — voir le détail du check',
  'banner.untitled': '(sans sujet)',
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
  'filter.aria': 'Filtrer les fils par label',
  'filter.all': 'tous',
  'badge.decoration.overflow': '{count} décoration(s) supplémentaire(s), non affichée(s)',

  // --- Page d'options (§10). Découpage : `options.<zone>.<rôle>`. Les phrases qui portent
  // un `<code>` dans la page sont coupées en segments (`.1`, `.2`) parce que le catalogue
  // ne transporte que du texte — voir `options/i18n.ts`.
  'options.title': 'Conventional Comments Toolkit',
  'options.subtitle': 'Réglages de l’extension.',
  'options.hosts.heading': 'Domaines autorisés',
  'options.hosts.sub': 'Accès de l’extension aux plateformes de revue de code.',
  'options.known.heading': 'Domaines connus',
  'options.known.sub': 'Adresse et plateforme déjà connues : un clic autorise l’accès.',
  'options.known.empty': 'Tous les domaines connus sont déjà autorisés.',
  'options.other.heading': 'Autres domaines',
  'options.other.sub.1':
    'Pour GitHub Enterprise Server, Azure DevOps Server, une organisation historique',
  'options.other.sub.2':
    'ou tout autre hôte propre à votre organisation : choisissez la plateforme avant d’autoriser l’accès.',
  'options.other.host.aria': 'Domaine à autoriser',
  'options.other.platform.aria': 'Plateforme servie par ce domaine',
  'options.other.platform.none': '— choisir la plateforme —',
  'options.other.submit': 'Autoriser',
  'options.configured.heading': 'Domaines configurés',
  'options.configured.sub': 'L’extension est active sur ces domaines, et sur eux seulement.',
  'options.configured.empty': 'Aucun domaine autorisé pour l’instant.',
  'options.unconfigured.heading': 'Domaines non configurés',
  'options.unconfigured.lead':
    'L’extension n’est pas active sur ces domaines tant qu’aucune plateforme ne leur est associée.',
  'options.unconfigured.sub.1': 'L’accès a été accordé directement depuis',
  'options.unconfigured.sub.2':
    '→ « Accès au site ». Choisissez une plateforme pour activer l’extension sur le domaine, ou retirez l’accès.',
  'options.prefs.heading': 'Préférences locales',
  'options.prefs.sub':
    'Le mode de validation et la liste des labels suivent toujours la configuration de l’organisation — rien de tout ça ne se règle ici.',
  'options.language.label': 'Langue de l’interface',
  'options.language.auto': 'Suivre la configuration, puis la plateforme',
  'options.shortcuts.label': 'Raccourcis directs',
  'options.shortcuts.hint.1': 'Une ligne par raccourci. Une ligne sans label (',
  'options.shortcuts.hint.2': ') désactive le raccourci par défaut.',
  'options.shortcuts.save': 'Enregistrer',
  'options.telemetry.heading': 'Télémétrie',
  'options.telemetry.sub':
    'Désactivée par défaut. N’émet que des compteurs agrégés — label utilisé, code d’erreur, mode, dépôt — jamais le texte d’un commentaire, d’un code ou d’un diff, ni l’adresse de la page. Elle ne s’active que si la politique d’entreprise de votre organisation déclare un point de collecte et que vous cochez cette case. Un dépôt ne peut ni l’activer, ni choisir la destination.',
  'options.telemetry.optin': 'Autoriser l’envoi de compteurs agrégés à mon organisation',
  'options.status.heading': 'État',
  'options.status.sub':
    'Lecture de la configuration et sélecteurs n’ayant pas trouvé les éléments attendus.',
  // Chaînes posées par le code, pas par la page.
  'options.host.remove': 'Retirer',
  'options.host.activate': 'Activer',
  'options.host.platform.aria': 'Plateforme servie par {host}',
  'options.host.managed': 'politique d’entreprise',
  'options.host.managed.title': 'Imposé par la politique d’entreprise',
  'options.host.remove.refused': 'Le navigateur a refusé de retirer l’accès à {host}.',
  'options.add.invalid': 'Domaine invalide.',
  'options.add.no-platform': 'Choisissez la plateforme servie par ce domaine.',
  'options.add.refused': 'Permission refusée.',
  'options.shortcuts.saved': 'Enregistré.',
  'options.shortcuts.saved.partial': 'Enregistré — lignes ignorées : {rejected}',
  'options.status.degraded': 'Configuration non lue ({reason}) : l’extension assiste sans bloquer.',
  'options.status.ok': 'Configuration lue normalement.',
  'options.status.selectors.none': 'Aucune dégradation de sélecteur enregistrée.',
  'options.status.selectors.some': '{count} dégradation(s) de sélecteur enregistrée(s).',
  'options.status.selectors.clear': 'Effacer le journal',
  'options.status.selectors.legend':
    'Même marque = même page. Un clic ouvre l’adresse relevée dans un nouvel onglet.',
  'options.status.selectors.page.unknown': 'Page non enregistrée.',
  'options.platform.github': 'GitHub Enterprise Server / GHE Cloud',
  'options.platform.azdo': 'Azure DevOps Server ou organisation visualstudio.com',
  'options.platform.config': 'Hôte de configuration uniquement',
  'options.platform.github.option': 'GitHub Enterprise Server / GHE Cloud (résidence)',
  'options.platform.config.option': 'Autre (hôte de configuration d’organisation uniquement)',
  // --- Visite guidée.
  'tour.counter': 'Étape {index} sur {total}',
  'tour.skip': 'Passer',
  'tour.back': 'Précédent',
  'tour.next': 'Suivant',
  'tour.done': 'Terminer',
  'tour.hosts.title': 'Domaines autorisés',
  'tour.hosts.body':
    'C’est ici que vous choisissez les domaines sur lesquels l’extension fonctionnera. Tant qu’aucun n’est autorisé, elle reste inactive partout — c’est ce qui garantit qu’elle ne voit que les sites que vous lui avez désignés.',
  'tour.configured.title': 'Domaines configurés',
  'tour.configured.body':
    'La liste de ce que vous avez autorisé. L’extension est active sur ces domaines, et sur eux seulement. Un accès s’y retire à tout moment.',
  'tour.unconfigured.title': 'Domaines non configurés',
  'tour.unconfigured.body':
    'Ces domaines ont reçu un accès en dehors de cet écran, sans qu’une plateforme leur soit associée — l’extension n’y fait donc rien. Associez-leur une plateforme pour l’activer, ou retirez l’accès.',
  'tour.language.title': 'Langue de l’interface',
  'tour.language.body':
    'Par défaut, l’extension suit la configuration de votre organisation, puis la langue de la plateforme. Ce réglage passe devant, pour vous seul.',
  'tour.shortcuts.title': 'Raccourcis directs',
  'tour.shortcuts.body':
    'Une combinaison de touches insère directement un label dans le commentaire en cours de rédaction. Une ligne par raccourci ; une ligne sans label désactive celui d’origine.',
  'tour.telemetry.title': 'Télémétrie',
  'tour.telemetry.body':
    'Désactivée par défaut, et sans effet tant que votre organisation n’a pas déclaré de point de collecte. Elle n’émet que des compteurs — jamais le texte d’un commentaire, d’un code ou d’un diff, ni l’adresse de la page.',
  'tour.status.title': 'État',
  'tour.status.body':
    'Dit si l’extension a pu lire la configuration de votre organisation, et signale les sélecteurs qui n’ont pas trouvé les éléments attendus. C’est ici qu’on regarde quand quelque chose ne se comporte pas comme prévu.',
  'tour.end.title': 'C’est tout',
  'tour.end.body':
    'Vous connaissez l’écran. Il ne reste qu’à autoriser votre plateforme, en haut de la page : le navigateur vous demandera confirmation, et l’extension se mettra au travail.',
  'options.telemetry.endpoint.revoked-only':
    'Votre organisation ne déclare plus de point de collecte, mais votre accord pour {consented} reste enregistré. Décochez pour le retirer.',
  'options.telemetry.endpoint.none':
    'La politique de votre organisation ne déclare aucun point de collecte : il n’y a rien à autoriser.',
  'options.telemetry.endpoint.moved':
    'Point de collecte : {endpoint} — votre accord précédent portait sur {consented}, il ne s’y applique pas. Cochez pour autoriser cette destination.',
  'options.telemetry.endpoint.declared':
    'Point de collecte déclaré par la politique d’entreprise de votre organisation : {endpoint}',
  'options.tour.replay': 'Visite guidée',
  'options.tour.replay.title': 'Revoir la visite guidée',
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
  'banner.count': '{count} blocking thread(s)',
  'banner.hint': 'to resolve before merging',
  'banner.hint.informative': 'shown for information, does not block merging',
  'banner.count.local': '{count} blocking thread(s) open on this page',
  'banner.hint.local': 'local view — no published result for this PR',
  'banner.unlocated':
    '{missing} thread(s) counted by the check, not found on this page — see the check for details',
  'banner.untitled': '(no subject)',
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
  'filter.aria': 'Filter threads by label',
  'filter.all': 'all',
  'badge.decoration.overflow': '{count} more decoration(s), not shown',

  // --- Options page (§10). See the French catalogue for why sentences carrying a `<code>`
  // are split into numbered segments.
  'options.title': 'Conventional Comments Toolkit',
  'options.subtitle': 'Extension settings.',
  'options.hosts.heading': 'Allowed domains',
  'options.hosts.sub': 'The extension’s access to code review platforms.',
  'options.known.heading': 'Known domains',
  'options.known.sub': 'Address and platform already known: one click grants access.',
  'options.known.empty': 'Every known domain is already allowed.',
  'options.other.heading': 'Other domains',
  'options.other.sub.1':
    'For GitHub Enterprise Server, Azure DevOps Server, a legacy organisation',
  'options.other.sub.2':
    'or any other host of your own: choose the platform before granting access.',
  'options.other.host.aria': 'Domain to allow',
  'options.other.platform.aria': 'Platform serving this domain',
  'options.other.platform.none': '— choose the platform —',
  'options.other.submit': 'Allow',
  'options.configured.heading': 'Configured domains',
  'options.configured.sub': 'The extension is active on these domains, and only on these.',
  'options.configured.empty': 'No domain allowed yet.',
  'options.unconfigured.heading': 'Unconfigured domains',
  'options.unconfigured.lead':
    'The extension is not active on these domains until a platform is associated with them.',
  'options.unconfigured.sub.1': 'Access was granted directly from',
  'options.unconfigured.sub.2':
    '→ “Site access”. Choose a platform to activate the extension on the domain, or withdraw the access.',
  'options.prefs.heading': 'Local preferences',
  'options.prefs.sub':
    'The validation mode and the label list always follow your organisation’s configuration — none of that is set here.',
  'options.language.label': 'Interface language',
  'options.language.auto': 'Follow the configuration, then the platform',
  'options.shortcuts.label': 'Direct shortcuts',
  'options.shortcuts.hint.1': 'One shortcut per line. A line with no label (',
  'options.shortcuts.hint.2': ') disables the default shortcut.',
  'options.shortcuts.save': 'Save',
  'options.telemetry.heading': 'Telemetry',
  'options.telemetry.sub':
    'Off by default. It only emits aggregate counters — label used, error code, mode, repository — never the text of a comment, of code or of a diff, nor the page address. It turns on only if your organisation’s enterprise policy declares a collection endpoint and you tick this box. A repository can neither enable it nor choose the destination.',
  'options.telemetry.optin': 'Allow sending aggregate counters to my organisation',
  'options.status.heading': 'Status',
  'options.status.sub':
    'Whether the configuration was read, and the selectors that could not find the expected page elements.',
  // Strings set by the code rather than by the page.
  'options.host.remove': 'Withdraw',
  'options.host.activate': 'Activate',
  'options.host.platform.aria': 'Platform serving {host}',
  'options.host.managed': 'enterprise policy',
  'options.host.managed.title': 'Enforced by enterprise policy',
  'options.host.remove.refused': 'The browser refused to withdraw access to {host}.',
  'options.add.invalid': 'Invalid domain.',
  'options.add.no-platform': 'Choose the platform serving this domain.',
  'options.add.refused': 'Permission denied.',
  'options.shortcuts.saved': 'Saved.',
  'options.shortcuts.saved.partial': 'Saved — lines ignored: {rejected}',
  'options.status.degraded': 'Configuration not read ({reason}): the extension assists without blocking.',
  'options.status.ok': 'Configuration read normally.',
  'options.status.selectors.none': 'No selector degradation recorded.',
  'options.status.selectors.some': '{count} selector degradation(s) recorded.',
  'options.status.selectors.clear': 'Clear the log',
  'options.status.selectors.legend':
    'Same mark = same page. Click one to open the recorded address in a new tab.',
  'options.status.selectors.page.unknown': 'Page not recorded.',
  'options.platform.github': 'GitHub Enterprise Server / GHE Cloud',
  'options.platform.azdo': 'Azure DevOps Server or visualstudio.com organisation',
  'options.platform.config': 'Configuration host only',
  'options.platform.github.option': 'GitHub Enterprise Server / GHE Cloud (residency)',
  'options.platform.config.option': 'Other (organisation configuration host only)',
  // --- Guided tour.
  'tour.counter': 'Step {index} of {total}',
  'tour.skip': 'Skip',
  'tour.back': 'Back',
  'tour.next': 'Next',
  'tour.done': 'Finish',
  'tour.hosts.title': 'Allowed domains',
  'tour.hosts.body':
    'This is where you choose the domains the extension will work on. Until one is allowed it stays inactive everywhere — which is what guarantees it only ever sees the sites you pointed it at.',
  'tour.configured.title': 'Configured domains',
  'tour.configured.body':
    'The list of what you have allowed. The extension is active on these domains, and only on these. An access can be withdrawn here at any time.',
  'tour.unconfigured.title': 'Unconfigured domains',
  'tour.unconfigured.body':
    'These domains were granted access outside this screen, with no platform associated — so the extension does nothing on them. Associate a platform to activate it, or withdraw the access.',
  'tour.language.title': 'Interface language',
  'tour.language.body':
    'By default the extension follows your organisation’s configuration, then the platform’s language. This setting comes first, for you alone.',
  'tour.shortcuts.title': 'Direct shortcuts',
  'tour.shortcuts.body':
    'A key combination inserts a label straight into the comment being written. One shortcut per line; a line with no label disables the original one.',
  'tour.telemetry.title': 'Telemetry',
  'tour.telemetry.body':
    'Off by default, and inert until your organisation declares a collection endpoint. It only emits counters — never the text of a comment, of code or of a diff, nor the page address.',
  'tour.status.title': 'Status',
  'tour.status.body':
    'Says whether the extension could read your organisation’s configuration, and reports selectors that could not find the expected page elements. This is where to look when something does not behave as expected.',
  'tour.end.title': 'That’s it',
  'tour.end.body':
    'You know the screen. All that is left is to allow your platform, at the top of the page: the browser will ask you to confirm, and the extension will get to work.',
  'options.telemetry.endpoint.revoked-only':
    'Your organisation no longer declares a collection endpoint, but your consent for {consented} is still recorded. Untick to withdraw it.',
  'options.telemetry.endpoint.none':
    'Your organisation’s policy declares no collection endpoint: there is nothing to allow.',
  'options.telemetry.endpoint.moved':
    'Collection endpoint: {endpoint} — your previous consent was for {consented} and does not carry over. Tick to allow this destination.',
  'options.telemetry.endpoint.declared':
    'Collection endpoint declared by your organisation’s enterprise policy: {endpoint}',
  'options.tour.replay': 'Guided tour',
  'options.tour.replay.title': 'Replay the guided tour',
};

/** Exporté pour le garde de parité (`test/i18n-strings.test.ts`) : une clé présente d'un
 * côté et absente de l'autre ne casse rien — `ui()` se rabat sur l'anglais —, elle se
 * contente de rendre une phrase anglaise au milieu de phrases françaises. */
export const catalogs: Record<string, Record<string, string>> = { fr, en };

export function ui(lang: string, key: string, params?: Record<string, string | number>): string {
  const base = lang.toLowerCase().split(/[-_]/)[0] ?? 'en';
  let template = catalogs[base]?.[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) template = template.split(`{${k}}`).join(String(v));
  }
  return template;
}
