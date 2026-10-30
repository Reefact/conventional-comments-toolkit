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
  'label.praise': 'Saluer un point remarquable du code.',
  'label.nitpick': 'Signaler une préférence mineure, sans enjeu.',
  'label.suggestion': 'Proposer une amélioration et dire pourquoi.',
  'label.issue': 'Signaler un problème à corriger, idéalement avec une piste.',
  'label.todo': 'Demander un petit changement nécessaire.',
  'label.question': 'Demander une précision avant de conclure.',
  'label.thought': 'Partager une idée, sans rien demander.',
  'label.chore': 'Demander une tâche annexe avant la fusion (job, doc, config…).',
  'label.note': 'Porter une information à la connaissance de tous.',
  'label.decision': 'Acter qu’un point ne sera pas traité, motif à l’appui.',
  'label.typo': 'Signaler une faute de frappe.',
  'label.polish': 'Proposer une finition, sans changer le sens.',
  'label.quibble': 'Signaler un détail discutable.',
  // Labels ajoutés (§3.2) — les labels de réponse et `reviewed`, extension propre à cette
  // boîte à outils, absente de Conventional Comments (§3.1). `ack` est du jargon : son badge l'ENSEIGNE (§10).
  'label.thanks': 'Remercier, sans prendre position.',
  'label.ack': 'Accepter un point sans changer le code à ce stade.',
  'label.done': 'Indiquer que la correction est poussée, avec son commit.',
  'label.disagree': 'Décliner une remarque en disant pourquoi.',
  'label.reviewed': 'Clore votre revue quand tous vos points sont traités. N’approuve rien.',
  // Badge d'un commentaire publié (§5.5) : ce que le commentaire VEUT DIRE, pour qui le lit —
  // positif, sans exemple, et sans rien promettre que le label ne garantit pas. Le bouton
  // (`label.*`, ci-dessus) dit, lui, QUAND employer le label, à qui l'écrit.
  'badge.label.praise': 'Le relecteur salue quelque chose de réussi dans ce code.',
  'badge.label.nitpick': 'Un petit détail de préférence : libre à vous de le suivre ou non.',
  'badge.label.suggestion': 'Une piste d’amélioration proposée par le relecteur.',
  'badge.label.issue': 'Un problème repéré dans ce code ; le commentaire explique lequel.',
  'badge.label.todo': 'Un petit changement demandé par le relecteur.',
  'badge.label.question': 'Le relecteur aimerait mieux comprendre ce point.',
  'badge.label.thought': 'Une idée partagée en passant, sans rien attendre de vous.',
  'badge.label.chore': 'Une tâche annexe à faire avant la fusion : relancer un job, mettre à jour une doc ou une config…',
  'badge.label.note': 'Une information utile à garder en tête.',
  'badge.label.decision': 'Un choix d’équipe assumé : ce point ne sera pas traité ici, et voici pourquoi.',
  'badge.label.typo': 'Une coquille à corriger, rien de plus.',
  'badge.label.polish': 'Une touche de finition proposée, sans changer le sens.',
  'badge.label.quibble': 'Un petit détail discutable relevé par le relecteur.',
  'badge.label.thanks': 'Un merci, tout simplement.',
  'badge.label.ack': 'Bien reçu (« ack », pour acknowledged) : le point est accepté, sans changement de code pour l’instant.',
  'badge.label.done': 'Le code a été modifié suite à la remarque : le changement est à vérifier.',
  'badge.label.disagree': 'Un avis différent, argumenté : la discussion reste ouverte.',
  'badge.label.reviewed': 'Le relecteur a terminé sa revue : il n’a plus rien à ajouter.',
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
  // Un accusé de réception PUR, jamais un refus poli : « juste, mais je laisse tel quel »
  // relève de `disagree`, et enseignerait la mauvaise frontière dès la première infobulle (§3.2).
  'example.thanks': 'thanks: merci pour la relecture attentive',
  'example.ack': 'ack: bien noté, je garde ça pour le module suivant',
  'example.done': 'done: jeton propre à la plateforme retiré',
  'example.disagree': 'disagree: la correspondance est volontairement indépendante de la plateforme',
  'example.reviewed': 'reviewed: corrections vérifiées, rien à ajouter',
  'filter.aria': 'Filtrer les fils par label',
  'filter.all': 'tous',
  'badge.decoration.overflow': '{count} décoration(s) supplémentaire(s), non affichée(s)',

  // --- Page d'options (§10). Découpage : `options.<zone>.<rôle>`. Les phrases qui portent
  // un `<code>` dans la page sont coupées en segments (`.1`, `.2`) parce que le catalogue
  // ne transporte que du texte — voir `options/i18n.ts`.
  'options.title': 'Conventional Comments Toolkit',
  'options.subtitle': 'Réglages de l’extension.',
  'options.version.title': 'Version de l’extension',
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
  'options.order.label': 'Ordre des boutons',
  'options.order.hint':
    'Labels séparés par des virgules, espaces ignorés. Ceux que vous listez passent en tête de leur groupe, remarques ou réponses ; les autres suivent dans l’ordre par défaut.',
  'options.order.save': 'Enregistrer',
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
  'options.order.saved': 'Enregistré. Pris en compte à la prochaine zone de commentaire ouverte.',
  'options.order.unknown': 'Non livrés par l’extension, placés s’ils existent sur le dépôt : {unknown}.',
  'options.order.rejected': 'Ignorés, ce ne sont pas des noms de label : {rejected}.',
  'options.responses.heading': "Labels ajoutés",
  'options.responses.sub':
    "Cinq labels propres à cette extension, absents de Conventional Comments : thanks, done, ack et disagree pour répondre à une remarque, reviewed pour clore sa revue. Ils sont activés par défaut. Ils se désactivent dans le fichier .conventional-comments.json du dépôt, partagé par l'équipe et utilisé par le vérificateur, et non depuis cette page. Le bloc ci-dessous les désactive : sans fichier existant, il peut servir de fichier complet ; sinon, ajoutez ses cinq entrées au tableau labels existant, ou créez cette propriété, sans remplacer les autres clés.",
  'options.responses.snippet': "Configuration qui désactive les labels ajoutés",
  'options.responses.copy': 'Copier la configuration',
  'options.responses.copied':
    "Copié. Sans configuration existante, ce bloc peut servir de fichier .conventional-comments.json complet ; sinon, ajoutez ses cinq entrées au tableau labels existant.",
  'options.responses.manual': 'Le presse-papiers a refusé la copie : le bloc est sélectionné, copiez-le avec Ctrl+C (⌘C sur Mac).',
  'options.status.degraded': 'Configuration non lue ({reason}) : l’extension assiste sans bloquer.',
  'options.status.ok': 'Configuration lue normalement.',
  'options.status.selectors.none': 'Aucune dégradation de sélecteur enregistrée.',
  'options.status.selectors.some': '{count} dégradation(s) de sélecteur enregistrée(s).',
  'options.status.selectors.clear': 'Effacer le journal',
  'options.status.selectors.legend':
    'Même marque = même page. Un clic ouvre l’adresse relevée dans un nouvel onglet.',
  'options.status.selectors.page.unknown': 'Page non enregistrée.',
  'options.status.selectors.copy': 'Copier',
  'options.status.selectors.copy.aria': 'Copier le détail de « {chain} » pour le débogage',
  'options.status.selectors.copyAll': 'Copier tout le journal (débogage)',
  'options.status.selectors.copied': 'Copié dans le presse-papiers.',
  'options.status.selectors.copy.manual':
    'Copie automatique impossible : le texte est sélectionné ci-dessous, Ctrl+C pour le copier.',
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
  'tour.responses.title': "Labels ajoutés",
  'tour.responses.body':
    "Thanks, done, ack, disagree et reviewed sont actifs par défaut. Pour s'en tenir à Conventional Comments, désactivez-les dans le fichier .conventional-comments.json du dépôt : le bouton copie le bloc à y mettre.",
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
  'label.praise': 'Point out something remarkable in the code.',
  'label.nitpick': 'Flag a minor preference, with nothing at stake.',
  'label.suggestion': 'Propose an improvement and say why.',
  'label.issue': 'Flag a problem to fix, ideally with a lead.',
  'label.todo': 'Ask for a small but necessary change.',
  'label.question': 'Ask for clarification before concluding.',
  'label.thought': 'Share an idea, asking for nothing.',
  'label.chore': 'Ask for a side task before merging (job, doc, config…).',
  'label.note': 'Share information everyone should know.',
  'label.decision': 'Record that a point will not be addressed, with the reason.',
  'label.typo': 'Flag a typo.',
  'label.polish': 'Propose a finishing touch, without changing the meaning.',
  'label.quibble': 'Flag a debatable detail.',
  'label.thanks': 'Say thank you, without taking a position.',
  'label.ack': 'Accept a point without changing the code at this stage.',
  'label.done': 'Say the fix is pushed, citing its commit.',
  'label.disagree': 'Decline a remark and say why.',
  'label.reviewed': 'Close your review once all your points are dealt with. Approves nothing.',
  'badge.label.praise': 'The reviewer is pointing out something done well in this code.',
  'badge.label.nitpick': 'A small matter of preference: up to you whether to follow it.',
  'badge.label.suggestion': 'An improvement idea from the reviewer.',
  'badge.label.issue': 'A problem spotted in this code; the comment explains which one.',
  'badge.label.todo': 'A small change requested by the reviewer.',
  'badge.label.question': 'The reviewer would like to understand this point better.',
  'badge.label.thought': 'An idea shared in passing, with nothing expected from you.',
  'badge.label.chore': 'A side task to do before merging: rerun a job, update a doc or a config…',
  'badge.label.note': 'A piece of information worth keeping in mind.',
  'badge.label.decision': 'A deliberate team choice: this point will not be addressed here, and the comment says why.',
  'badge.label.typo': 'A typo to fix, nothing more.',
  'badge.label.polish': 'A finishing touch, without changing the meaning.',
  'badge.label.quibble': 'A small debatable detail raised by the reviewer.',
  'badge.label.thanks': 'Simply a thank-you.',
  'badge.label.ack': 'Acknowledged (“ack”): the point is accepted, with no code change for now.',
  'badge.label.done': 'The code was changed in response to the remark; the change is there to check.',
  'badge.label.disagree': 'A different, reasoned view: the discussion stays open.',
  'badge.label.reviewed': 'The reviewer has finished their review: nothing more to add.',
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
  'example.thanks': 'thanks: thanks for the careful review',
  'example.ack': "ack: understood, I'll keep it in mind for the next module",
  'example.done': 'done: removed the platform-specific token',
  'example.disagree': 'disagree: the mapping is intentionally platform-independent',
  'example.reviewed': 'reviewed: fixes checked, nothing to add',
  'filter.aria': 'Filter threads by label',
  'filter.all': 'all',
  'badge.decoration.overflow': '{count} more decoration(s), not shown',

  // --- Options page (§10). See the French catalogue for why sentences carrying a `<code>`
  // are split into numbered segments.
  'options.title': 'Conventional Comments Toolkit',
  'options.subtitle': 'Extension settings.',
  'options.version.title': 'Extension version',
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
  'options.order.label': 'Button order',
  'options.order.hint':
    'Labels separated by commas, spaces ignored. The ones you list come first in their group, remarks or replies; the others follow in the default order.',
  'options.order.save': 'Save',
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
  'options.order.saved': 'Saved. Applies to the next comment box that opens.',
  'options.order.unknown': 'Not shipped with the extension, placed if the repository defines them: {unknown}.',
  'options.order.rejected': 'Ignored, not label names: {rejected}.',
  'options.responses.heading': "Added labels",
  'options.responses.sub':
    "Five labels of this extension's own, not part of Conventional Comments: thanks, done, ack and disagree for replying to a review comment, reviewed for closing your review. They are enabled by default. They are disabled in the repository's .conventional-comments.json file, shared by the team and used by the verifier, not from this page. The block below disables them: with no existing file, it can serve as the whole file; otherwise, add its five entries to the existing labels array, or create that property, without replacing the other keys.",
  'options.responses.snippet': "Configuration that disables the added labels",
  'options.responses.copy': 'Copy the configuration',
  'options.responses.copied':
    "Copied. With no existing configuration, this block can serve as the whole .conventional-comments.json file; otherwise, add its five entries to the existing labels array.",
  'options.responses.manual': 'The clipboard refused the copy: the block is selected, copy it with Ctrl+C (⌘C on Mac).',
  'options.status.degraded': 'Configuration not read ({reason}): the extension assists without blocking.',
  'options.status.ok': 'Configuration read normally.',
  'options.status.selectors.none': 'No selector degradation recorded.',
  'options.status.selectors.some': '{count} selector degradation(s) recorded.',
  'options.status.selectors.clear': 'Clear the log',
  'options.status.selectors.legend':
    'Same mark = same page. Click one to open the recorded address in a new tab.',
  'options.status.selectors.page.unknown': 'Page not recorded.',
  'options.status.selectors.copy': 'Copy',
  'options.status.selectors.copy.aria': 'Copy the details of “{chain}” for debugging',
  'options.status.selectors.copyAll': 'Copy the whole log (debug)',
  'options.status.selectors.copied': 'Copied to the clipboard.',
  'options.status.selectors.copy.manual':
    'Automatic copy failed: the text is selected below, press Ctrl+C to copy it.',
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
  'tour.responses.title': "Added labels",
  'tour.responses.body':
    "Thanks, done, ack, disagree and reviewed are enabled by default. To stick to Conventional Comments, disable them in the repository's .conventional-comments.json file: the button copies the block to put there.",
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

/** Infobulle d'un label (§5.1, §5.5). Les deux surfaces ne répondent pas à la même question :
 *
 * - le BOUTON, à qui écrit — « quand l'employer ? » : la consigne d'emploi, puis l'exemple ;
 * - le BADGE, à qui lit — « que me dit ce commentaire ? » : la signification, sans exemple, puisque
 *   le commentaire est sous ses yeux.
 *
 * Ce que la configuration écrit (§8.2) l'emporte, exemple compris, et vide (`""`) retire
 * l'infobulle : c'est ce que l'équipe a décidé. Le badge lit `description` ; le bouton lit `usage`,
 * puis `description` à défaut — le comportement de 1.0.0-beta.14, où une seule clé servait aux deux.
 *
 * `null` pour un label qu'aucune source ne décrit (un label créé par une organisation ou un dépôt,
 * sans texte) : sans ce garde, `ui()` rendait la CLÉ elle-même, et l'infobulle d'un label `risk`
 * affichait « label.risk ». */
export function labelTooltip(
  lang: string,
  label: { id: string; description?: string; usage?: string },
  surface: 'button' | 'badge'
): string | null {
  const written = surface === 'button' ? (label.usage ?? label.description) : label.description;
  if (written !== undefined) return written === '' ? null : written;
  const key = surface === 'button' ? `label.${label.id}` : `badge.label.${label.id}`;
  const text = ui(lang, key);
  if (text === key) return null;
  if (surface === 'badge') return text;
  const exampleKey = `example.${label.id}`;
  const example = ui(lang, exampleKey);
  return example !== exampleKey ? `${text}\n${ui(lang, 'label.example', { example })}` : text;
}

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
