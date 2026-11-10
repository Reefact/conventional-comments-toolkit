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
  'notice.floor-override':
    'Clé de configuration de dépôt « {ref} » ignorée : elle assouplirait le plancher d’entreprise.',
  'notice.invalid-config': 'Configuration invalide : {detail}',
  'notice.config-warning': '{detail}',
  'notice.unsupported-version': '{detail}',
  // Divers
  'and': 'et',
};
