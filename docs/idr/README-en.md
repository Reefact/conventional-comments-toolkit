# Important Decision Records

*Français : [README-fr.md](README-fr.md)*

An **Important Decision Record (IDR)** keeps one important decision of this repository, so that months or years later anyone can understand why it was right when it was made. It is historical memory, not living documentation: it states what was true, known and decided at that date, and is not updated when that stops being true. The rules are those of the owner's guideline for IDRs (kept in a private repository); what follows is what a contributor needs from it.

`specifications-fr.md` stays the normative reference for the product's behaviour — the *what*. An IDR records the *why* of a choice; the rule it produced stays in the document that carries it, and cites the IDR.

## Rules

- **One decision, one IDR.** Only real choices are recorded: a decision a future maintainer would ask *"why did they do it this way?"* about. If the implementation changed but the decision stood, the IDR should not need editing.
- **An accepted IDR is never rewritten.** A decision that changes gets a new IDR, and the old one's status gains a line naming its replacement.
- **The status is append-only**: one row per change, `Date | Status | Note | Linked minutes`, no row ever edited or removed. Statuses: Proposed, Accepted, Rejected, Deprecated, Superseded by DECxxxx.
- **Context holds facts, Rationale holds arguments** drawn from those facts. **Decision is exactly one sentence**, with no justification in it.
- **Nothing is invented.** An alternative, a consequence or a risk enters an IDR only once the person carrying the decision has validated it; an alternative that was never documented is not reconstructed.
- **An agent drafts, the owner accepts.** An agent writes an IDR as Proposed and never changes a status unless the owner asks it to.

## Files

- `DECnnnn-<english-slug>-en.md` and `DECnnnn-<english-slug>-fr.md`, cross-linked: every IDR exists in English and French (DEC0002).
- The index below is kept in both READMEs.

## Checking a pull request

Every pull request is checked against this register (DEC0001), by the agent working on it, through the [`idr` skill](../../.claude/skills/idr/SKILL.md). The check is advisory and never blocks; most pull requests carry no decision.

## Where these decisions come from

DEC0002 to DEC0014 were recovered on 2026-11-11 from the "owner's decision" mentions across `CLAUDE.md`, the specification, the documentation and the git history; each is dated on the day it was decided, and its status note names its sources. DEC0001, the decision to keep this register, was taken on 2026-11-11 and dated 2026-08-31 by the maintainer's choice, so that it precedes the decisions it records.

## Index

| IDR | Title | Status | Date |
| --- | --- | --- | --- |
| [DEC0001](DEC0001-record-important-decisions-as-idrs-en.md) | Record important decisions as IDRs | Accepted | 2026-08-31 |
| [DEC0002](DEC0002-english-first-language-follows-the-reader-en.md) | English first, language follows the reader | Accepted | 2026-09-01 |
| [DEC0003](DEC0003-an-inert-prettier-configuration-en.md) | An inert Prettier configuration | Accepted | 2026-09-08 |
| [DEC0004](DEC0004-spec-amendments-ship-with-their-code-en.md) | Spec amendments ship with their code | Accepted | 2026-09-24 |
| [DEC0005](DEC0005-one-platform-per-pull-request-en.md) | One platform per pull request | Accepted | 2026-10-27 |
| [DEC0006](DEC0006-diagnostic-reports-as-issues-en.md) | Diagnostic reports as issues | Accepted | 2026-10-31 |
| [DEC0007](DEC0007-gitlab-in-scope-en.md) | GitLab in scope | Accepted | 2026-11-08 |
| [DEC0008](DEC0008-azure-devops-on-dev-azure-com-only-en.md) | Azure DevOps on dev.azure.com only | Accepted | 2026-11-09 |
| [DEC0009](DEC0009-no-email-address-in-captures-en.md) | No email address in captures | Accepted | 2026-11-09 |
| [DEC0010](DEC0010-the-extension-is-the-whole-product-en.md) | The extension is the whole product | Accepted | 2026-11-10 |
| [DEC0011](DEC0011-publishing-keystrokes-declared-per-platform-en.md) | Publishing keystrokes declared per platform | Accepted | 2026-11-10 |
| [DEC0012](DEC0012-re-read-the-configuration-before-blocking-en.md) | Re-read the configuration before blocking | Accepted | 2026-11-10 |
| [DEC0013](DEC0013-no-claude-code-footer-in-pull-requests-en.md) | No Claude Code footer in pull requests | Accepted | 2026-11-10 |
| [DEC0014](DEC0014-slugger-names-review-sessions-en.md) | Slugger names review sessions | Accepted | 2026-11-11 |
