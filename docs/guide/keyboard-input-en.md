# Keyboard input

**Languages:** English (this file) | [Français](keyboard-input-fr.md)

Three ways to write a prefix without touching the mouse. They complement the toolbar; all
three produce exactly the text a click would.

| Way | You type | Who sets it |
|---|---|---|
| [Completion list](#completion-list) | `/` or `:` in an empty field | Nobody: it lists the active labels |
| [Abbreviations](#abbreviations) | `?ib` then `Tab` | The team, in the repository's configuration |
| [Direct shortcuts](#direct-shortcuts) | `Alt+I` | You, in the extension's settings |

## Completion list

In an **empty** comment field, type `/` or `:`. A list of the active labels opens and narrows
as you type.

```text
:su
```

lists `suggestion` and `summary`. `↑` and `↓` move through the list, `Enter` or `Tab` accepts
the selected label, `Esc` closes the list. Accepting `suggestion` leaves:

```text
suggestion: 
```

with the caret after the space, ready for the subject. The list follows the order of the
toolbar buttons, your personal order included.

## Abbreviations

Type an abbreviation, then press `Tab`: it expands into a full prefix, decoration included.

```text
?ib
```

then `Tab` gives:

```text
issue (blocking): 
```

An abbreviation expands wherever the caret is, so it also works after a quotation or a line
of context.

### Shipped abbreviations

| Abbreviation | Expands to | | Abbreviation | Expands to |
|---|---|---|---|---|
| `?i` | `issue: ` | | `?ch` | `chore: ` |
| `?ib` | `issue (blocking): ` | | `?ty` | `typo: ` |
| `?su` | `suggestion: ` | | `?po` | `polish: ` |
| `?ni` | `nitpick: ` | | `?qui` | `quibble: ` |
| `?no` | `note: ` | | `?sum` | `summary: ` |
| `?pr` | `praise: ` | | `?r` | `reviewed: ` |
| `?to` | `todo: ` | | `?thx` | `thanks: ` |
| `?th` | `thought: ` | | `?do` | `done: ` |
| `?que` | `question: ` | | `?a` | `ack: ` |
| `?de` | `decision: ` | | `?di` | `disagree: ` |

An abbreviation takes as many letters as it needs to name one label: two tell `nitpick` from
`note`, three are needed for `question` and `quibble`. Since the expansion waits for `Tab`,
`?i` and `?ib` can coexist.

A shipped abbreviation only expands to an **active** label. `?qui` does nothing until the
repository enables `quibble`, and `?do` does nothing in a repository that disabled `done`.

### Add your own

The abbreviation table belongs to the team. It lives in the repository's
`.conventional-comments.json`, under `shortcuts.abbreviations`. Each entry maps an
abbreviation to the text inserted, colon and space included:

```json
{
  "shortcuts": {
    "abbreviations": {
      "?sec": "issue (blocking, security): ",
      "?snb": "suggestion (non-blocking): "
    }
  }
}
```

Your entries are added to the shipped ones; an entry with the same abbreviation redefines it
([configuration](configuration-en.md)).

## Direct shortcuts

A key combination inserts a label straight into the comment you are writing.

| Shortcut | Label | | Shortcut | Label |
|---|---|---|---|---|
| `Alt+I` | `issue` | | `Alt+Q` | `question` |
| `Alt+S` | `suggestion` | | `Alt+P` | `praise` |
| `Alt+N` | `nitpick` | | `Alt+C` | `chore` |
| `Alt+T` | `todo` | | `Alt+D` | `decision` |

You typed:

```text
this name does not say what the variable holds
```

`Alt+N` gives:

```text
nitpick: this name does not say what the variable holds
```

Changed your mind? `Alt+I` **replaces** the label instead of adding a second one:

```text
issue: this name does not say what the variable holds
```

A decoration already written stays: on `nitpick (non-blocking): …`, a shortcut changes the
label and keeps `(non-blocking)`. A shortcut to a label the repository disabled does nothing.

### Change them

Direct shortcuts are a personal preference. In the [settings page](settings-en.md), under
*Local preferences* → *Direct shortcuts*, write one shortcut per line:

```text
Alt+R=reviewed
Alt+D=
```

- `Alt+R=reviewed` adds a shortcut.
- `Alt+D=`, with no label, disables the shipped `Alt+D`.
- The shipped shortcuts you do not mention stay as they are.

A shortcut is `Alt` plus one letter, and its label is written by its identifier (`reviewed`,
not an alias). The preference follows you through your browser's sync. It applies to the next
comment field that opens, not to those already open.

### Known limit on macOS

The extension recognises a shortcut by the character the key produces. On macOS, `Option`
plus a letter usually types a special character instead of the letter, so a direct shortcut
may not fire there. This has not been tested on a Mac. The completion list and the
abbreviations do not depend on `Alt` and are not affected.
