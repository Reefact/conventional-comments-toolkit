export const en: Record<string, string> = {
  // Diagnostics — préfixe (§3.5.1)
  'diag.E-NO-LABEL':
    'This comment does not start with a Conventional Comments prefix. Expected format: "label: subject" — e.g. "issue: this name is ambiguous".',
  'diag.E-MALFORMED-PREFIX.unclosed-paren':
    'Malformed prefix: the opening parenthesis is never closed. Close the decoration list, e.g. "{fix}".',
  'diag.E-MALFORMED-PREFIX.unopened-paren':
    'Malformed prefix: a closing parenthesis appears without an opening one. Open the decoration list, e.g. "{fix}".',
  'diag.E-MALFORMED-PREFIX.missing-colon':
    'Malformed prefix: the colon after the label is missing. Write "{fix}".',
  'diag.E-MALFORMED-PREFIX.space-before-colon':
    'Malformed prefix: no space is allowed before the colon. Write "{fix}".',
  'diag.E-MALFORMED-PREFIX.missing-space-after-colon':
    'Malformed prefix: the colon must be followed by at least one space. Write "{fix}".',
  'diag.E-MALFORMED-PREFIX.unexpected-character':
    'Malformed prefix: unexpected character between the label and the colon. Expected format: "label: subject" or "label (decoration): subject".',
  'diag.E-UNKNOWN-LABEL':
    'Unknown label "{label}". Available labels: {labels}.{suggestion}',
  'diag.E-UNKNOWN-LABEL.suggestion': ' Did you mean "{candidate}:"?',
  'diag.W-CASE': 'Label written as "{label}" — the canonical form is "{canonical}".',
  // Diagnostics — décorations (§3.3)
  'diag.E-DECORATION-SYNTAX': 'Malformed decoration(s): {details}.',
  'diag.E-DECORATION-SYNTAX.empty-parens': 'empty parentheses',
  'diag.E-DECORATION-SYNTAX.empty-element': 'empty element',
  'diag.E-DECORATION-SYNTAX.invalid-chars': '"{element}" contains characters outside [A-Za-z][A-Za-z0-9-]*',
  'diag.E-DECORATION-SYNTAX.internal-space': '"{element}" contains an internal space',
  'diag.E-UNKNOWN-DECORATION':
    'Unknown decoration(s): {elements}. Known decorations: {known}. Free decorations are disabled by configuration.',
  'diag.E-CONFLICT.label':
    'The label "{label}" is always non-blocking and cannot carry the "(blocking)" decoration.',
  'diag.E-CONFLICT.decorations':
    'Contradictory decorations: {elements}. Keep only one of them.',
  'diag.W-DECORATION-STYLE': 'Decoration style: {details}. Canonical form: "{fix}".',
  'diag.W-DECORATION-STYLE.case': 'non-canonical case on {elements}',
  'diag.W-DECORATION-STYLE.border-spaces': 'superfluous spaces inside the parentheses',
  'diag.W-DECORATION-STYLE.missing-space-before-paren': 'missing space before the opening parenthesis',
  'diag.W-DECORATION-STYLE.duplicate': 'duplicate decoration {elements}',
  // Diagnostics — sujet
  'diag.E-EMPTY-SUBJECT': 'No subject after the colon. Add a one-line summary.',
  'diag.E-DECISION-SUBJECT':
    'A "decision" reply must state its rationale in at least {min} characters (currently {len}).',
  'diag.W-SUBJECT-TOO-SHORT': 'Subject shorter than {min} characters.',
  'diag.W-SUBJECT-TOO-LONG': 'Subject longer than {max} characters.',
  // Diagnostics — discussion et contexte
  'diag.W-NO-DISCUSSION':
    'This comment is blocking but has no discussion: explain why the point must be addressed.',
  'diag.W-MISSING-DECORATION':
    'A "{label}" without a carrying decoration is ambiguous: add "(blocking)", "(non-blocking)" or "(if-minor)".',
  // Diagnostic — métadonnée (§3.6)
  'diag.W-SESSION-MULTIPLE':
    'This comment carries {count} session markers: none is shown. Keep a single "[session:…]" line.',
  'diag.W-NOT-BLOCKABLE':
    'This label is blocking, but this area cannot hold a resolvable thread — it will not be counted among blocking threads.',
  // Avis de configuration (§5.3, §9.2.1)
  'notice.level.floor':
    'enterprise floor',
  'notice.level.org':
    'organization configuration',
  'notice.level.repo':
    'repository file',
  'notice.level.merged':
    'merged configuration',
  'notice.floor-override':
    'Enterprise floor ({where}): key "{key}" ignored: it would relax the enterprise floor (§8.1.1).',
  'notice.invalid.json':
    'Invalid configuration ({where}): unparseable JSON (line {line}).',
  'notice.invalid.json-no-line':
    'Invalid configuration ({where}): unparseable JSON.',
  'notice.invalid.not-object':
    'Invalid configuration ({where}): the configuration document must be a JSON object.',
  'notice.invalid.positive-integer':
    'Invalid configuration ({where}): key "{key}" must be a positive integer.',
  'notice.invalid.non-negative-integer':
    'Invalid configuration ({where}): key "{key}" must be a non-negative integer.',
  'notice.invalid.one-of':
    'Invalid configuration ({where}): key "{key}" must be one of {values}.',
  'notice.invalid.array':
    'Invalid configuration ({where}): key "{key}" must be an array.',
  'notice.invalid.object':
    'Invalid configuration ({where}): key "{key}" must be an object.',
  'notice.invalid.string-array':
    'Invalid configuration ({where}): key "{key}" must be an array of strings.',
  'notice.invalid.non-empty-string':
    'Invalid configuration ({where}): key "{key}" must be a non-empty string.',
  'notice.invalid.string-or-null':
    'Invalid configuration ({where}): key "{key}" must be a string or null.',
  'notice.invalid.semver':
    'Invalid configuration ({where}): key "{key}" must be a semver string.',
  'notice.invalid.label-entry':
    'Invalid configuration ({where}): key "{key}": each entry must be an object with a string "id".',
  'notice.invalid.label-boolean':
    'Invalid configuration ({where}): key "{key}": "{prop}" of label "{label}" must be a boolean.',
  'notice.invalid.label-string':
    'Invalid configuration ({where}): key "{key}": "{prop}" of label "{label}" must be a string.',
  'notice.invalid.label-kind':
    'Invalid configuration ({where}): key "{key}": "kind" of label "{label}" must be "remark" or "reply".',
  'notice.invalid.label-aliases':
    'Invalid configuration ({where}): key "{key}": "aliases" of label "{label}" must be an array of strings.',
  'notice.invalid.prop-boolean':
    'Invalid configuration ({where}): key "{key}": "{prop}" must be a boolean.',
  'notice.invalid.prop-array':
    'Invalid configuration ({where}): key "{key}": "{prop}" must be an array.',
  'notice.invalid.prop-non-negative-integer':
    'Invalid configuration ({where}): key "{key}": "{prop}" must be a non-negative integer.',
  'notice.invalid.prop-string-or-null':
    'Invalid configuration ({where}): key "{key}": "{prop}" must be a string or null.',
  'notice.invalid.decoration-entry':
    'Invalid configuration ({where}): key "{key}": each known decoration must be an object with a string "id".',
  'notice.invalid.decoration-forces':
    'Invalid configuration ({where}): key "{key}": "forces" of decoration "{decoration}" must be "blocking", "non-blocking" or null.',
  'notice.invalid.severity':
    'Invalid configuration ({where}): key "{key}": severity of "{code}" must be one of {values}.',
  'notice.invalid.abbreviations':
    'Invalid configuration ({where}): key "{key}": "abbreviations" must be an object mapping abbreviation to inserted text.',
  'notice.config.unknown-key':
    'Configuration warning ({where}): unknown key "{key}" ignored.',
  'notice.config.deprecated-warn':
    'Configuration warning ({where}): obsolete value "warn" for "{key}": read as "assist" — replace it with "assist" (§7).',
  'notice.config.repo-config-url':
    'Configuration warning ({where}): "configUrl" is ignored here: the organization configuration URL comes exclusively from the floor channel (§8.1.2).',
  'notice.config.tool-command-invalid':
    'Configuration warning ({where}): toolCommands entry "{entry}" ignored: it must be "/*" or an exact "@handle".',
  'notice.config.allowlist-too-many':
    'Configuration warning ({where}): allowlist pattern #{index} "{pattern}" ignored: more than {max} patterns.',
  'notice.config.allowlist-too-long':
    'Configuration warning ({where}): allowlist pattern #{index} "{pattern}" ignored: longer than {max} characters.',
  'notice.config.allowlist-nested':
    'Configuration warning ({where}): allowlist pattern #{index} "{pattern}" ignored: nested quantifiers are not allowed.',
  'notice.config.allowlist-invalid':
    'Configuration warning ({where}): allowlist pattern #{index} "{pattern}" ignored: invalid regular expression.',
  'notice.config.severity-raised':
    'Configuration warning ({where}): severity of "{code}" cannot go below "warn" (§8.2): value "off" raised to "warn".',
  'notice.config.session-severity-capped':
    'Configuration warning ({where}): severity of "{code}" cannot go above "warn" (§3.6): value "error" lowered to "warn".',
  'notice.config.label-case-duplicate':
    'Configuration warning ({where}): label "{label}" ignored: its id differs from label "{prior}" only by case (§8.2).',
  'notice.config.alias-is-id':
    'Configuration warning ({where}): alias "{alias}" removed from label "{label}": it is the id of label "{other}" (§8.2).',
  'notice.config.alias-shared':
    'Configuration warning ({where}): alias "{alias}" removed from label "{label}": it is also an alias of {others} (§8.2).',
  'notice.floor.string-array':
    'Configuration warning ({where}): key "{key}" ignored: expected an array of strings.',
  'notice.floor.non-string-entry':
    'Configuration warning ({where}): key "{key}": {count} non-string entry ignored.',
  'notice.floor.non-string-entries':
    'Configuration warning ({where}): key "{key}": {count} non-string entries ignored.',
  'notice.floor.closed-not-boolean':
    'Configuration warning ({where}): rule "{key}" is not a boolean: the list is kept closed.',
  'notice.floor.non-negative-integer':
    'Configuration warning ({where}): key "{key}" ignored: it must be a non-negative integer.',
  'notice.floor.one-of':
    'Configuration warning ({where}): key "{key}" ignored: it must be one of {values}.',
  'notice.floor.object':
    'Configuration warning ({where}): key "{key}" ignored: it must be an object.',
  'notice.floor.string-or-null':
    'Configuration warning ({where}): key "{key}" ignored: it must be a string or null.',
  'notice.floor.severity':
    'Configuration warning ({where}): severity of "{code}" ignored: it must be one of {values}.',
  'notice.unsupported.schema-version':
    'Unsupported version ({where}): configuration schema version {version} exceeds supported version {supported}: falling back to assist mode (or the floor if stricter).',
  'notice.unsupported.core-version':
    'Unsupported version ({where}): coreMinVersion {required} requires core/ major {major}, this component runs {current}: falling back to assist mode (or the floor if stricter).',
  'notice.unsupported.floor-version':
    'Unsupported version ({where}): floor version {version} exceeds supported version {supported}: the floor is not applied and the component falls back to assist mode (§8.1.1).',
  // Divers
  'and': 'and',
};
