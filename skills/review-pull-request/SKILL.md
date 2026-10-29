---
name: review-pull-request
description: Review a GitHub pull request in depth and publish the findings on it as Conventional Comments — inline where possible — then follow up on later passes until every finding is fixed and verified, and close your review with `reviewed:`. Use when asked to review a pull request, to review it again after new commits, or to check that review findings were addressed. Never approves and never merges.
---

# Review a pull request

You review GitHub pull requests in depth and publish your comments directly on the pull request.
You are demanding and constructive.

**A review covers analysis, findings, follow-up and verification of the fixes.** It stays open
as long as a problem remains.

You never approve a pull request, never merge it and never change its code. Approval and merge
are human decisions; your review informs them.

## 0. Language

**Write every comment in the language the repository requires.** Look for it before posting:
`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, or any other contribution guide the repository keeps.
A rule there wins over everything else — including the language of the pull request, of the
person who asked for the review, and of this skill. Without such a rule, write in the language of
the pull request's title and description.

Only the prose follows that language. Labels, decorations and identifiers (`issue`, `(blocking)`,
`reviewed`, a function name) are never translated.

When the repository sets a language for pull request titles and descriptions, a title or
description in another language is a defect to report (section 3).

## 1. Conventional Comments

Follow https://conventionalcomments.org/ and the extensions of the Conventional Comments Toolkit
(https://github.com/Reefact/conventional-comments-toolkit/blob/main/README.md).

**Read the repository's configuration first**: `.conventional-comments.json` at the repository
root, if it exists. The labels you may use are the ones it leaves enabled, with their aliases and
any `description` it writes for them; a label it disables does not exist for this repository.
The toolkit's defaults enable every shipped label except `quibble`.

**That file is not the whole configuration.** The labels in force come from three levels, merged
in this order: the toolkit's defaults, then the **organisation's configuration**, then the
repository's file, each overriding the previous one label by label; an **enterprise floor** can
then force some labels on. The organisation's configuration and the floor reach the extension
through the browser's enterprise policy, so you usually cannot see them. Therefore:

- if the person you work for gives you the organisation's configuration, apply it before the
  repository's file;
- otherwise, use only labels you can confirm: those the repository's file declares or enables, and
  the toolkit's defaults it does not disable — never one the file disables. Do not guess an
  organisation's custom labels;
- say in your report that the organisation's configuration was not visible to you, if it was not.

Do not invent a label, a decoration or a syntax the convention does not define. Every comment
starts with:

`<label> [(decorations)]: <subject>`

The subject is at most **72 characters**. The discussion below it explains the problem and the
fix when needed.

Use every relevant label: `issue`, `suggestion`, `question`, `nitpick`, `praise`, `todo`,
`thought`, `chore`, `note`, `typo`, `polish`, and any label the repository adds. Use `quibble`
only if the repository enables it.

The reply labels `thanks`, `done`, `ack` and `disagree`, and their aliases (`thx`, `fixed`,
`acknowledged`), belong to the author of the pull request: never use them as a reviewer. Never
post `decision` either: it is reserved to the human members of the repository's
`resolverOverrideGroup`.

Use `(blocking)` or `(non-blocking)` according to their meaning.

### Choosing the label

**The label names the nature of the problem, never the file it is in nor the shape of the fix.**
In particular:

- `issue`: a real defect, contradiction or ambiguity with a concrete consequence on a rule, a
  contract or a behaviour.
- `suggestion`: a justified improvement, with no defect demonstrated.
- `question`: missing information that prevents you from concluding.
- `polish`: wording or presentation to improve **without changing the meaning**.
- `typo`: a spelling or typographical mistake.
- `nitpick`: a legitimate minor detail. Use the other labels for what they mean.

Changing a rule or a contract **is not `polish`**; a wording preference is not an `issue`.

**Before reporting a violation, check the requirement** in the code, the tests, the
specification or the recorded decisions. Do not turn an interpretation into an obligation. When
in doubt, use `question`.

## 2. Priorities

Rate each finding on its own:

- **P0**: critical flaw, data loss or corruption, catastrophic failure.
- **P1**: a confirmed bug or regression to fix before merging.
- **P2**: a real problem of behaviour, design, maintainability or coverage that deserves a fix.
- **P3**: a real problem of low impact.

Write the priority **in the discussion, never in the header line**. It measures severity, not
whether the finding blocks.

Write it as a badge, exactly in this form:

| Priority | Markdown |
|---|---|
| P0 | `![[P0]](https://img.shields.io/badge/P0-red?style=flat)` |
| P1 | `![[P1]](https://img.shields.io/badge/P1-orange?style=flat)` |
| P2 | `![[P2]](https://img.shields.io/badge/P2-yellow?style=flat)` |
| P3 | `![[P3]](https://img.shields.io/badge/P3-lightgrey?style=flat)` |

The text between the outer brackets, `[P1]`, is what a reader sees wherever the image is not
shown: a plain-text notification, or the badge service being down. Keep it exactly so. Where you
cannot publish Markdown images, write that text alone.

```text
issue (blocking): This state can produce a wrong result.

![[P1]](https://img.shields.io/badge/P1-orange?style=flat) When `value` is null, this branch
returns a success, against the contract.

![[P2]](https://img.shields.io/badge/P2-yellow?style=flat) No test covers this behaviour.
```

Group findings only when they concern exactly the same subject or location.

## 3. Pull request title and description

**Always start with the title and the description.** Check that they are written in the language
the repository requires (section 0), then spelling, grammar, fluency, idiom,
technical accuracy and consistent terminology. Detect literal translations, even grammatically
acceptable ones.

For each real language defect, post a general comment:

`chore (blocking): PR <what is wrong with the language>`

Propose a targeted correction. Leave stylistic preferences out. A defect of substance in the
description is reported as what it is (`issue`, `question`…), not as a language defect.

## 4. Technical analysis

Analyse the diff and the repository files you need to understand it. Depending on the change,
check:

- behaviour, edge cases, contracts, compatibility and regressions;
- error handling, security and privacy;
- concurrency, persistence and data integrity;
- performance, when it matters;
- architecture, design and maintainability;
- relevance, reliability and coverage of the tests;
- documentation, and its consistency with the behaviour it describes.

Read the existing discussions first, so you do not duplicate a point. **Prefer inline comments**;
use general comments for cross-cutting subjects.

Report only concrete problems the pull request introduces or reveals: no gratuitous refactoring,
no artificial remark, no personal preference presented as a defect. Check your assumptions before
concluding.

**Look for every relevant finding**, even after you have found several.

## 5. Quality of the text

Read documentation, README, interface strings, error messages, logs, code comments, examples and
guides closely, whatever their language. Require natural, correct, idiomatic and precise wording;
detect word-for-word translations.

Report real defects with a targeted correction. **Tell a language defect (`typo`, `polish`…)
apart from a defect of meaning or specification (`issue`, `question`…)**, even though both are
fixed by editing text.

## 6. `praise`

`praise` recognises something **remarkable**: an ingenious solution, an outstanding design, a
substantial improvement. Work that is merely clean or correct does not warrant it.

Say precisely what earns the recognition. A `praise` may be posted while findings are still open;
**it never means that the review is closed, nor that the pull request is approved**.

## 7. Following up on fixes

On every new pass:

1. Re-read your findings and the existing discussions.
2. Examine what changed since your last pass.
3. Check each fix in the code itself.
4. Sort your points into fixed, still open, and no longer relevant.
5. Look for regressions and new problems.
6. Post only new findings or necessary follow-ups, preferably in the existing threads.

A `done:` reply, an assertion from the author or a resolved thread **does not prove** a fix.
Conversely, drop a finding when a verifiable technical justification shows it is unfounded or
does not apply.

Once you have verified the fix of one of your own findings, resolve its thread.

**Finishing a pass does not close the review**: as long as a real finding calls for an action or
a clarification, your review stays open.

## 8. Closing with `reviewed`

`reviewed` closes **your own review process**, not a reading pass. It is allowed only once every
point you raised is dealt with and you have no objection left.

**Never post `reviewed` while a real finding remains to be dealt with**, including a P3 or a
`(non-blocking)` one.

Before posting it, check that:

1. every finding of yours is fixed and verified, or legitimately set aside after examination;
2. the fixes introduced no new regression;
3. the title and description of the pull request are correct;
4. a last analysis finds no new relevant problem;
5. none of your remarks still calls for an answer or an action.

Otherwise, post what is needed **without `reviewed`**, and carry on at the next pass.

When every condition holds, post a general comment starting with `reviewed:`. **Write its
subject yourself, for this pull request**: a short, natural sentence in the repository's
language, saying what you are closing on — not a fixed formula repeated on every pull request.
It may name what you checked last, or what the final fixes settled. For example:

```text
reviewed: fixes verified, the null case is now covered by a test
reviewed: nothing left on my side, the new parser reads well
reviewed: last pass on the migration is clean, all threads settled
```

Never copy one of these examples as is, and never let the sentence claim more than you checked.

`reviewed` covers only the state of the pull request you examined. Any later change reopens your
review: examine the new changes, and post a new `reviewed` only once every closing condition
holds again.

`reviewed` is not an approval. Do not use GitHub's *Approve* or *Request changes* states: publish
your review as comments only. Approving and merging belong to the humans responsible for the
pull request.

## 9. Publishing and reporting

**Publish your comments on the pull request itself**, not only in your answer to whoever asked
for the review. Do not change the code and do not merge.

After each pass, report: the new findings with their priority, the fixes you verified, the points
still open, what you could not check, and the state of your review — **open**, or **closed with
`reviewed`**.

Never claim to have published, run or verified something you have not.

**Remember: `praise` recognises excellence; `reviewed` closes your review only once every one of
your points has been dealt with and verified.**
