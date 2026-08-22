export const fr: Record<string, string> = {
  // Diagnostics — préfixe (§3.5.1)
  'diag.E-NO-LABEL':
    'Ce commentaire ne commence pas par un préfixe Conventional Comments. Format attendu : « label: sujet » — par exemple « issue: le nom est ambigu ».',
  'diag.E-MALFORMED-PREFIX.unclosed-paren':
    'Préfixe mal formé : la parenthèse ouvrante n’est jamais refermée. Refermez la liste de décorations, par exemple « {fix} ».',
  'diag.E-MALFORMED-PREFIX.unopened-paren':
    'Préfixe mal formé : une parenthèse fermante apparaît sans parenthèse ouvrante. Ouvrez la liste de décorations, par exemple « {fix} ».',
  'diag.E-MALFORMED-PREFIX.missing-colon':
    'Préfixe mal formé : le deux-points après le label est manquant. Écrivez « {fix} ».',
  'diag.E-MALFORMED-PREFIX.space-before-colon':
    'Préfixe mal formé : aucune espace n’est admise avant le deux-points. Écrivez « {fix} ».',
  'diag.E-MALFORMED-PREFIX.missing-space-after-colon':
    'Préfixe mal formé : le deux-points doit être suivi d’au moins une espace. Écrivez « {fix} ».',
  'diag.E-MALFORMED-PREFIX.unexpected-character':
    'Préfixe mal formé : caractère inattendu entre le label et le deux-points. Format attendu : « label: sujet » ou « label (décoration): sujet ».',
  'diag.E-UNKNOWN-LABEL':
    'Label inconnu « {label} ». Labels disponibles : {labels}.{suggestion}',
  'diag.E-UNKNOWN-LABEL.suggestion': ' Vouliez-vous écrire « {candidate}: » ?',
  'diag.W-CASE': 'Label saisi « {label} » — la forme canonique est « {canonical} ».',
  // Diagnostics — décorations (§3.3)
  'diag.E-DECORATION-SYNTAX': 'Décoration(s) mal formée(s) : {details}.',
  'diag.E-DECORATION-SYNTAX.empty-parens': 'parenthèses vides',
  'diag.E-DECORATION-SYNTAX.empty-element': 'élément vide',
  'diag.E-DECORATION-SYNTAX.invalid-chars':
    '« {element} » contient des caractères hors de [A-Za-z][A-Za-z0-9-]*',
  'diag.E-DECORATION-SYNTAX.internal-space': '« {element} » contient une espace interne',
  'diag.E-UNKNOWN-DECORATION':
    'Décoration(s) inconnue(s) : {elements}. Décorations connues : {known}. Les décorations libres sont désactivées par la configuration.',
  'diag.E-CONFLICT.label':
    'Le label « {label} » est toujours non bloquant et ne peut pas porter la décoration « (blocking) ».',
  'diag.E-CONFLICT.decorations':
    'Décorations contradictoires : {elements}. N’en gardez qu’une.',
  'diag.W-DECORATION-STYLE': 'Style de décoration : {details}. Forme canonique : « {fix} ».',
  'diag.W-DECORATION-STYLE.case': 'casse non canonique sur {elements}',
  'diag.W-DECORATION-STYLE.border-spaces': 'espaces superflues à l’intérieur des parenthèses',
  'diag.W-DECORATION-STYLE.missing-space-before-paren':
    'espace manquante avant la parenthèse ouvrante',
  'diag.W-DECORATION-STYLE.duplicate': 'décoration en doublon {elements}',
  // Diagnostics — sujet
  'diag.E-EMPTY-SUBJECT': 'Aucun sujet après le deux-points. Ajoutez un résumé sur une ligne.',
  'diag.E-DECISION-SUBJECT':
    'Une réponse « decision » doit énoncer son motif en au moins {min} caractères (actuellement {len}).',
  'diag.W-SUBJECT-TOO-SHORT': 'Sujet plus court que {min} caractères.',
  'diag.W-SUBJECT-TOO-LONG': 'Sujet plus long que {max} caractères.',
  // Diagnostics — discussion et contexte
  'diag.W-NO-DISCUSSION':
    'Ce commentaire est bloquant mais ne comporte aucune discussion : expliquez pourquoi le point doit être traité.',
  'diag.W-MISSING-DECORATION':
    'Un « {label} » sans décoration porteuse est ambigu : ajoutez « (blocking) », « (non-blocking) » ou « (if-minor) ».',
  'diag.W-NOT-BLOCKABLE':
    'Ce label est bloquant, mais cette zone ne permet pas de résoudre un fil — il ne bloquera pas la complétion.',
  // Sortie du check (§6.3.1)
  'headline':
    '{threads} fil(s) bloquant(s) non résolu(s), {comments} commentaire(s) non conforme(s), {warnings} avertissement(s).',
  'headline.out-of-scope.before-activation':
    'PR antérieure à l’activation ({activatedAt}) — hors périmètre.',
  'headline.out-of-scope.no-activation-date':
    'Activation non datée — aucune PR n’est dans le périmètre.',
  'headline.draft': 'PR en brouillon — statut informatif uniquement.',
  'headline.exempted': 'PR exemptée par {by} le {at}.',
  'headline.grace-expired':
    'Évaluation impossible au-delà du délai de grâce — voir la procédure de retour arrière (§6.3.3 de la spécification).',
  'headline.invalid-config': 'Configuration invalide : {detail}',
  'headline.config-vanished':
    'Le fichier de configuration a disparu d’un dépôt déjà évalué.',
  // Notices (§6.3.1)
  'notice.weakening-edit':
    'Le commentaire racine du fil bloquant {ref} a été édité vers une forme non bloquante{by} ; le fil reste compté comme bloquant (§6.1).',
  'notice.weakening-edit.by': ' par {login}',
  'notice.root-deleted':
    'Le commentaire racine du fil bloquant {ref} a été supprimé ; le fil n’est plus compté. La suppression est le seul chemin restant pour éteindre un fil sans le résoudre.',
  'notice.resolution-refused':
    'Résolution du fil bloquant {ref} refusée : {cause}. Rouvrez le fil et faites-le résoudre par l’auteur du commentaire racine, ou postez-y une réponse « decision » valide.',
  'notice.resolution-refused.not-author':
    'résolu par {login}, qui n’est pas l’auteur du commentaire racine, et aucune réponse « decision » valide n’est présente',
  'notice.resolution-refused.decision-missing':
    'résolu par un membre habilité mais le fil ne contient aucune réponse « decision » valide',
  'notice.resolution-unattributed':
    'Résolution du fil {ref} acceptée sans résolveur connu : cette plateforme n’expose pas qui a résolu un fil. La règle de gouvernance du §6.1 n’y est pas appliquée.',
  'notice.floor-override':
    'Clé de configuration de dépôt « {ref} » ignorée : elle assouplirait le plancher d’entreprise.',
  'notice.invalid-config': 'Configuration invalide : {detail}',
  'notice.config-warning': '{detail}',
  'notice.config-vanished':
    'Le fichier de configuration .conventional-comments.json a disparu d’un dépôt déjà évalué. C’est un incident, pas une désactivation (§8.1.5).',
  'notice.exemption-reset':
    'Exemption de PR remise à zéro : un nouveau fil bloquant est apparu. L’étiquette a été retirée et le critère 2 s’applique de nouveau.',
  'notice.exemption-refused':
    'Étiquette d’exemption posée par {login}, non membre de resolverOverrideGroup : l’exemption est refusée et l’étiquette est laissée en place.',
  'notice.exemption-label-restored':
    'L’étiquette d’exemption avait disparu alors qu’une exemption confirmée est active : elle a été restaurée. Sur cette plateforme, retirer l’étiquette ne révoque pas — passez par le point d’entrée d’administration.',
  'notice.grace-expired':
    'Incapacité à évaluer au-delà du délai de grâce : statut neutre publié (§6.4).',
  'notice.unsupported-version': '{detail}',
  // Divers
  'and': 'et',
};
