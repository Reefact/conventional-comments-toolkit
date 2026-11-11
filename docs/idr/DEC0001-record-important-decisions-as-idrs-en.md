# DEC0001 | Record important decisions as IDRs

*Français : [DEC0001-record-important-decisions-as-idrs-fr.md](DEC0001-record-important-decisions-as-idrs-fr.md)*

## Status

| Date | Status | Note | Linked minutes |
| --- | --- | --- | --- |
| 2026-08-31 | Accepted | Decided on 2026-11-11; dated 2026-08-31 by the maintainer's choice, so that it precedes the decisions it records |  |

## Context

The repository recorded its decisions across its documents, as "owner's decision, date": some thirty mentions in about ten files — `CLAUDE.md`, `specifications-fr.md`, `docs/architecture-fr.md`, `docs/operations-fr.md`, the `README.md`, adapter notes and skills. No index gathered them, and a decision's *why* was often mixed into the rule it produced, which lengthened `CLAUDE.md`.

`specifications-fr.md` is the normative reference for behaviour: it states the *what*, and is never bent to match the implementation.

During the review of pull request #188, a reviewer asked to run Slugger's native binary before the installed .NET tool, without a justification; the debate that followed is recorded only in that pull request's threads, which an agent does not reread once the pull request is closed.

The owner keeps a guideline for writing Important Decision Records (IDR) in their `engineering-workbench` repository. The Slugger repository already applies it, in French. The just-dummies repository keeps an ADR register in another format, and checks every pull request against it through an advisory agent skill, with no automatic CI trigger.

The repository's language rule (DEC0002) has a repository document written in English first, with a French twin when possible.

## Decision

The repository's important decisions are recorded as bilingual IDRs in `docs/idr/`, following the owner's guideline, and every pull request is checked against this register.

## Rationale

An indexed register makes decisions findable where scattered mentions were not, and separates the *why* from the rule: the rule stays in the document that carries it, its history moves to the IDR, which lightens `CLAUDE.md`.

A register nothing consults falls out of use; the check on every pull request is what keeps it alive, and it is also what keeps a debate already settled, like the one on pull request #188, from being reopened for want of a record.

The owner's guideline is already Slugger's reference: taking it up gives the same rules from one repository to the next. Writing in English and French applies the repository's language rule.

The check stays advisory, as in just-dummies: recording a decision is an act the owner reviews, not an automatic control.

## Alternatives considered

### Alternative 1 — The status quo

Keep the "owner's decisions" across the documents. Rejected: some thirty mentions scattered in about ten files, no index, the *why* mixed into the rule.

### Alternative 2 — The rationale in pull requests

Leave the reasoning in descriptions and review threads, where the debate of pull request #188 lives. Rejected: nothing there is indexed, and an agent does not reread a closed pull request.

### Alternative 3 — A register with no check on every pull request

Keep the register and consult it when needed, as Slugger does. Rejected: a register nothing consults falls out of use.

### Alternative 4 — The just-dummies ADR format

Take up its files, statuses and dated header. Rejected: the owner's guideline is the reference, and Slugger already applies it.

### Alternative 5 — IDRs in French only

As in Slugger. Rejected: the repository's language rule has a repository document in English first (DEC0002).

### Alternative 6 — The rationale in the specification

Rejected: the specification is the normative reference for the *what*, in French only, and adding the *why* would swell it.

## Consequences

### Positive

- Decisions are indexed in one place, and their *why* no longer weighs on the rules.
- A settled decision has a record a reviewer can cite instead of reopening it.

### Negative

- Every important decision costs a document in two languages.
- This decision is dated before the decisions it records, by the maintainer's choice, although it was made after them.

### Risks

- An advisory check can be skipped; the register is only worth as much as the check is done.

### Follow-up actions

- Recover as IDRs the decisions already recorded in the repository, and leave only the rule and the IDR's identifier in their place.
- Write the agent skill that checks every pull request against the register.
