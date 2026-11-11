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
  // Diagnostic — métadonnée (§3.6)
  'diag.W-SESSION-MULTIPLE':
    'Ce commentaire porte {count} marqueurs de session : aucun n’est affiché. N’en gardez qu’une ligne « [session:…] ».',
  'diag.W-NOT-BLOCKABLE':
    'Ce label est bloquant, mais cette zone ne permet pas de résoudre un fil — il ne sera pas compté parmi les fils bloquants.',
  // Avis de configuration (§5.3, §9.2.1)
  'notice.level.floor':
    'plancher d’entreprise',
  'notice.level.org':
    'configuration d’organisation',
  'notice.level.repo':
    'fichier du dépôt',
  'notice.level.merged':
    'configuration fusionnée',
  'notice.floor-override':
    'Plancher d’entreprise ({where}) : clé « {key} » ignorée : elle assouplirait le plancher d’entreprise (§8.1.1).',
  'notice.invalid.json':
    'Configuration invalide ({where}) : JSON illisible (ligne {line}).',
  'notice.invalid.json-no-line':
    'Configuration invalide ({where}) : JSON illisible.',
  'notice.invalid.not-object':
    'Configuration invalide ({where}) : le document de configuration doit être un objet JSON.',
  'notice.invalid.positive-integer':
    'Configuration invalide ({where}) : la clé « {key} » doit être un entier positif.',
  'notice.invalid.non-negative-integer':
    'Configuration invalide ({where}) : la clé « {key} » doit être un entier positif ou nul.',
  'notice.invalid.one-of':
    'Configuration invalide ({where}) : la clé « {key} » doit valoir l’une de ces valeurs : {values}.',
  'notice.invalid.array':
    'Configuration invalide ({where}) : la clé « {key} » doit être un tableau.',
  'notice.invalid.object':
    'Configuration invalide ({where}) : la clé « {key} » doit être un objet.',
  'notice.invalid.string-array':
    'Configuration invalide ({where}) : la clé « {key} » doit être un tableau de chaînes.',
  'notice.invalid.non-empty-string':
    'Configuration invalide ({where}) : la clé « {key} » doit être une chaîne non vide.',
  'notice.invalid.string-or-null':
    'Configuration invalide ({where}) : la clé « {key} » doit être une chaîne ou null.',
  'notice.invalid.semver':
    'Configuration invalide ({where}) : la clé « {key} » doit être une version semver.',
  'notice.invalid.label-entry':
    'Configuration invalide ({where}) : clé « {key} » : chaque entrée doit être un objet portant un « id » textuel.',
  'notice.invalid.label-boolean':
    'Configuration invalide ({where}) : clé « {key} » : « {prop} » du label « {label} » doit être un booléen.',
  'notice.invalid.label-string':
    'Configuration invalide ({where}) : clé « {key} » : « {prop} » du label « {label} » doit être une chaîne.',
  'notice.invalid.label-kind':
    'Configuration invalide ({where}) : clé « {key} » : « kind » du label « {label} » doit valoir « remark » ou « reply ».',
  'notice.invalid.label-aliases':
    'Configuration invalide ({where}) : clé « {key} » : « aliases » du label « {label} » doit être un tableau de chaînes.',
  'notice.invalid.prop-boolean':
    'Configuration invalide ({where}) : clé « {key} » : « {prop} » doit être un booléen.',
  'notice.invalid.prop-array':
    'Configuration invalide ({where}) : clé « {key} » : « {prop} » doit être un tableau.',
  'notice.invalid.prop-non-negative-integer':
    'Configuration invalide ({where}) : clé « {key} » : « {prop} » doit être un entier positif ou nul.',
  'notice.invalid.prop-string-or-null':
    'Configuration invalide ({where}) : clé « {key} » : « {prop} » doit être une chaîne ou null.',
  'notice.invalid.decoration-entry':
    'Configuration invalide ({where}) : clé « {key} » : chaque décoration connue doit être un objet portant un « id » textuel.',
  'notice.invalid.decoration-forces':
    'Configuration invalide ({where}) : clé « {key} » : « forces » de la décoration « {decoration} » doit valoir « blocking », « non-blocking » ou null.',
  'notice.invalid.severity':
    'Configuration invalide ({where}) : clé « {key} » : la sévérité de « {code} » doit valoir l’une de ces valeurs : {values}.',
  'notice.invalid.abbreviations':
    'Configuration invalide ({where}) : clé « {key} » : « abbreviations » doit être un objet qui associe une abréviation au texte inséré.',
  'notice.config.unknown-key':
    'Avertissement de configuration ({where}) : clé inconnue « {key} » ignorée.',
  'notice.config.deprecated-warn':
    'Avertissement de configuration ({where}) : valeur obsolète « warn » pour « {key} », lue comme « assist » — remplacez-la par « assist » (§7).',
  'notice.config.repo-config-url':
    'Avertissement de configuration ({where}) : « configUrl » est ignorée ici : l’URL de la configuration d’organisation vient exclusivement du canal de plancher (§8.1.2).',
  'notice.config.tool-command-invalid':
    'Avertissement de configuration ({where}) : entrée « {entry} » de toolCommands ignorée : elle doit être « /* » ou un « @handle » exact.',
  'notice.config.allowlist-too-many':
    'Avertissement de configuration ({where}) : motif d’allowlist n° {index} « {pattern} » ignoré : plus de {max} motifs.',
  'notice.config.allowlist-too-long':
    'Avertissement de configuration ({where}) : motif d’allowlist n° {index} « {pattern} » ignoré : plus de {max} caractères.',
  'notice.config.allowlist-nested':
    'Avertissement de configuration ({where}) : motif d’allowlist n° {index} « {pattern} » ignoré : les quantificateurs imbriqués sont interdits.',
  'notice.config.allowlist-invalid':
    'Avertissement de configuration ({where}) : motif d’allowlist n° {index} « {pattern} » ignoré : expression régulière invalide.',
  'notice.config.severity-raised':
    'Avertissement de configuration ({where}) : la sévérité de « {code} » ne peut pas descendre sous « warn » (§8.2) : la valeur « off » est relevée à « warn ».',
  'notice.config.session-severity-capped':
    'Avertissement de configuration ({where}) : la sévérité de « {code} » ne peut pas dépasser « warn » (§3.6) : la valeur « error » est ramenée à « warn ».',
  'notice.config.label-case-duplicate':
    'Avertissement de configuration ({where}) : label « {label} » ignoré : son identifiant ne diffère de celui du label « {prior} » que par la casse (§8.2).',
  'notice.config.alias-is-id':
    'Avertissement de configuration ({where}) : alias « {alias} » retiré du label « {label} » : c’est l’identifiant du label « {other} » (§8.2).',
  'notice.config.alias-shared':
    'Avertissement de configuration ({where}) : alias « {alias} » retiré du label « {label} » : c’est aussi un alias de {others} (§8.2).',
  'notice.floor.string-array':
    'Avertissement de configuration ({where}) : clé « {key} » ignorée : un tableau de chaînes est attendu.',
  'notice.floor.non-string-entry':
    'Avertissement de configuration ({where}) : clé « {key} » : {count} entrée non textuelle ignorée.',
  'notice.floor.non-string-entries':
    'Avertissement de configuration ({where}) : clé « {key} » : {count} entrées non textuelles ignorées.',
  'notice.floor.closed-not-boolean':
    'Avertissement de configuration ({where}) : la règle « {key} » n’est pas un booléen : la liste reste fermée.',
  'notice.floor.non-negative-integer':
    'Avertissement de configuration ({where}) : clé « {key} » ignorée : elle doit être un entier positif ou nul.',
  'notice.floor.one-of':
    'Avertissement de configuration ({where}) : clé « {key} » ignorée : elle doit valoir l’une de ces valeurs : {values}.',
  'notice.floor.object':
    'Avertissement de configuration ({where}) : clé « {key} » ignorée : elle doit être un objet.',
  'notice.floor.string-or-null':
    'Avertissement de configuration ({where}) : clé « {key} » ignorée : elle doit être une chaîne ou null.',
  'notice.floor.severity':
    'Avertissement de configuration ({where}) : sévérité de « {code} » ignorée : elle doit valoir l’une de ces valeurs : {values}.',
  'notice.unsupported.schema-version':
    'Version non prise en charge ({where}) : la version de schéma {version} dépasse la version prise en charge, {supported} : repli en mode assist (ou sur le plancher s’il est plus strict).',
  'notice.unsupported.core-version':
    'Version non prise en charge ({where}) : coreMinVersion {required} exige la version majeure {major} de core/, ce composant exécute la {current} : repli en mode assist (ou sur le plancher s’il est plus strict).',
  'notice.unsupported.floor-version':
    'Version non prise en charge ({where}) : la version de plancher {version} dépasse la version prise en charge, {supported} : le plancher n’est pas appliqué et le composant se replie en mode assist (§8.1.1).',
  // Divers
  'and': 'et',
};
