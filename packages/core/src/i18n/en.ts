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
  'diag.W-NOT-BLOCKABLE':
    'This label is blocking, but this area cannot hold a resolvable thread — it will not block completion.',
  // Sortie du check (§6.3.1)
  'headline':
    '{threads} unresolved blocking thread(s), {comments} non-compliant comment(s), {warnings} warning(s).',
  'headline.out-of-scope.before-activation': 'PR created before activation ({activatedAt}) — not in scope.',
  'headline.out-of-scope.no-activation-date': 'Activation not dated — no PR is in scope.',
  'headline.draft': 'Draft PR — informative status only.',
  'headline.exempted': 'PR exempted by {by} on {at}.',
  'headline.grace-expired':
    'Evaluation impossible beyond the grace period — see the rollback procedure (§6.3.3 of the specification).',
  'headline.invalid-config': 'Invalid configuration: {detail}',
  'headline.config-vanished':
    'The configuration file has disappeared from an already-evaluated repository.',
  // Notices (§6.3.1)
  'notice.weakening-edit':
    'The root comment of blocking thread {ref} was edited to a non-blocking form{by}; the thread remains counted as blocking (§6.1).',
  'notice.weakening-edit.by': ' by {login}',
  'notice.root-deleted':
    'The root comment of blocking thread {ref} was deleted; the thread is no longer counted. Deletion is the only remaining way to extinguish a thread without resolving it.',
  'notice.resolution-refused':
    'Resolution of blocking thread {ref} refused: {cause}. Reopen the thread and have it resolved by the root author, or post a valid "decision" reply.',
  'notice.resolution-refused.not-author':
    'resolved by {login}, who is not the root comment author, and no valid "decision" reply is present',
  'notice.resolution-refused.decision-missing':
    'resolved by an authorized member but the thread contains no valid "decision" reply',
  'notice.resolution-unattributed':
    'Resolution of thread {ref} accepted without a known resolver: this platform does not expose who resolved a thread. The governance rule of §6.1 is not enforced here.',
  'notice.floor-override':
    'Repository configuration key "{ref}" ignored: it would relax the enterprise floor.',
  'notice.invalid-config': 'Invalid configuration: {detail}',
  'notice.config-warning': '{detail}',
  'notice.config-vanished':
    'The configuration file .conventional-comments.json has disappeared from an already-evaluated repository. This is treated as an incident, not a deactivation (§8.1.5).',
  'notice.exemption-reset':
    'PR exemption reset: a new blocking thread appeared. The label was removed and criterion 2 applies again.',
  'notice.exemption-refused':
    'Exemption label posted by {login}, who is not a member of resolverOverrideGroup: the exemption is refused and the label is left in place.',
  'notice.exemption-label-restored':
    'The exemption label had disappeared while a confirmed exemption is active: it was restored. Removing the label does not revoke on this platform — use the administration entry point.',
  'notice.grace-expired':
    'Unable to evaluate for longer than the grace period: neutral status published (§6.4).',
  'notice.unsupported-version': '{detail}',
  // Divers
  'and': 'and',
};
