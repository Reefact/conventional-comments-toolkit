# FAQ and troubleshooting

**Languages:** English (this file) | [Français](faq-fr.md)

## Nothing shows up

### No toolbar appears on the pull request

Check, in this order:

1. **The domain is allowed.** Open the [settings page](settings-en.md): the domain must be
   under *Configured domains*. If it is under *Unconfigured domains*, associate a platform.
2. **The page was reloaded** after you allowed the domain.
3. **You are in a comment field of a pull request.** The description of the pull request,
   issues and work items are out of scope.
4. **On GitLab, you are in the Markdown editor.** The rich text editor is not handled; switch
   back with *Switch to plain text editing* under the field
   ([platforms](platforms-en.md#gitlab)).
5. **The repository is not in `off` mode.** A repository can switch the extension off for
   itself.

If none of these explains it, open *Status* in the settings page: the journal lists what the
extension looked for and did not find. Download the diagnostic and attach it to an
[issue](https://github.com/reefact/conventional-comments-toolkit/issues), after reading it.

### The pill says nothing in a reply

Replies in a thread are not validated by default; only a `decision` reply is. The toolbar
still works there. A repository turns reply validation on with `scope.validateReplies`
([configuration](configuration-en.md#scope)).

### A published comment shows a badge but its prefix is still in the text

Expected. The prefix is hidden only when everything it says can be shown by badges and the
page's structure is one the extension knows. Otherwise it shows less rather than risk showing
something wrong: the badges sit above the comment and the text stays whole.

### A colleague does not see the badges

Badges are drawn by the extension, in the browser of whoever has it. The stored comment is
plain text, `issue (blocking): …`, readable by everyone.

## Messages

### The pill says *Configuration unread*

The extension could not read the repository's or the organisation's configuration. It keeps
assisting with the rules it has and **does not block**, whatever the mode.

- On **GitLab**, this is the normal state for now: the repository file is not read there.
- On GitHub and Azure DevOps, check that you are signed in and that the network reaches the
  platform. For an organisation's configuration on another host, that host must be allowed.

A repository with **no** configuration file does not cause this: an absent file is normal.

### *Unknown label* on a label I have always used

The repository's configuration disabled it, or never declared it. The message lists the
available labels. Aliases count: `bug:` works only if the repository declares `bug` as an
alias.

### The send button is greyed out

The repository is in `enforce` mode and the comment has an error. The pill names it, usually
with a one-click fix. If the configuration was just relaxed, try again: the extension re-reads
it before blocking and releases the button.

### I changed the configuration file and nothing changed

The extension caches what it read, one hour by default. It always re-reads before blocking a
send, so a send is never blocked by an outdated rule; but the pill and the banner can show the
old rules until the cache expires.

### A direct shortcut does nothing

- The label is disabled in this repository.
- You changed your shortcuts after the field was opened: they apply to the next field.
- On macOS, `Option` + letter may type a special character instead
  ([known limit](keyboard-input-en.md#known-limit-on-macos)).

## What the extension is and is not

### Can someone get around `enforce`?

Yes, and the product says so. The extension only acts in the browser where it is installed;
the platform's API, another browser or a disabled extension goes straight through. `enforce`
catches careless mistakes, which are the common case
([modes](modes-and-adoption-en.md#what-enforce-does-not-do)).

### Does it prevent a merge while blocking threads are open?

No. The banner reports them. To gate merges, use your platform's own setting, such as
required conversation resolution.

### Does `reviewed` approve the pull request?

No. It says your review is over. Approval stays with the platform's own control, and the
extension does not count `reviewed`.

### Are `done`, `ack`, `thanks`… part of Conventional Comments?

No. They are additions of this extension, enabled by default, that a repository can disable
([labels](labels-en.md#labels-that-are-not-part-of-conventional-comments)).

### What leaves my browser?

No comment, code or diff content, ever. The extension reads the configuration file of the
repository you are looking at, using your own signed-in session; it stores no token. Your
language and shortcuts sync through your browser if its sync is on. Telemetry is off unless your
organisation declares an endpoint **and** you agree. The details are in the
[privacy policy](../../PRIVACY.md).

### Does it check commit messages, or the quality of my comment?

Neither. Commit messages are another convention (Conventional Commits). And the extension
checks the **form** of a comment, never whether it is right or kind.

## Turning it off

- **For yourself, on one platform:** withdraw the domain in the settings page.
- **For a repository:** `{ "mode": "off" }` in its `.conventional-comments.json`, if your
  organisation's floor allows it.
- **Entirely:** disable or remove the extension from your browser's extensions page.
