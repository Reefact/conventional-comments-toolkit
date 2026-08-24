# Install and test the browser extension — step-by-step guide (Windows / PowerShell)

This guide starts from a **blank** Windows machine (no Node.js, npm, or Git installed)
and walks you through testing the extension on a real GitHub Pull Request. It assumes
you already have a browser (Chrome, Edge, or any Chromium-based browser) — installing
one is not covered here.

All commands run in **PowerShell**. Open it (Start menu → type "PowerShell" → Enter).

## Shortcut: install from a published release, building nothing

When a release is published, installing takes **no Node, no npm, no Git** — and the rest
of this guide becomes unnecessary:

1. Open the releases page:
   <https://github.com/reefact/conventional-comments-toolkit/releases/latest>.
2. Download `conventional-comments-toolkit-<version>-chromium.zip` (Chrome, Edge, or any
   Chromium browser) or `conventional-comments-toolkit-<version>-firefox.zip` (Firefox).
3. Unzip it **somewhere other than your Downloads folder**: the browser re-reads that
   folder at every start, and deleting it disables the extension.
4. Chrome / Edge: `chrome://extensions` → **Developer mode** → **Load unpacked** → the
   unzipped folder, the one that directly contains `manifest.json`.
   Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → the
   `manifest.json` inside the unzipped folder (a temporary add-on is removed when Firefox
   closes).
5. Confirm it works with step 9 below.

Each archive carries an `INSTALLATION.txt` repeating these steps. The `SHA256SUMS.txt`
published alongside lets you check the download:

```powershell
Get-FileHash conventional-comments-toolkit-<version>-chromium.zip -Algorithm SHA256
```

An extension loaded from a zip **never auto-updates**: every new version means
downloading and re-loading it by hand. This is a path for trying it out and for
troubleshooting; deploying component A goes through the public stores and, in an
organization, through policy-forced installation (§10).

The rest of this guide remains the way to **build the extension yourself** from source:
needed to modify it, or to install a state that has not been released yet.

## 1. Install Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

`winget` is the package installer built into Windows 10/11 (via the App Installer from
the Microsoft Store); it's what installs Node.js and Git below. If a User Account
Control (UAC) prompt appears, accept it.

**Important: close and reopen PowerShell** after installing — the PATH is only updated
when a new window opens.

Verify:

```powershell
node --version
```

You should get a version **≥ 20** (e.g. `v20.11.0` or `v24.19.0`).

## 2. Verify npm

npm ships with Node.js. Verify:

```powershell
npm --version
```

> **If you see this message:**
> ```
> npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts
> is disabled on this system...
> ```
> This is a default PowerShell security policy — not an installation problem. Allow
> locally installed scripts for your account (no administrator rights needed):
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> A confirmation prompt may appear (`[Y] Yes  [N] No...`) — answer `Y`. Then rerun
> `npm --version`.

## 3. Install Git

```powershell
winget install --id Git.Git -e --source winget
```

**Close and reopen PowerShell** again, then verify:

```powershell
git --version
```

## 4. Clone the repository

Move to whichever folder you'd like (for example `cd $HOME\Documents`, or any other
folder — there's no required path), then:

```powershell
git clone https://github.com/Reefact/conventional-comments-toolkit.git
cd conventional-comments-toolkit
```

Every command below runs **from this folder**.

## 5. Install dependencies

```powershell
npm install
```

> **If you see this warning:**
> ```
> npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
>   esbuild@0.28.2 (postinstall: node install.js)
>   esbuild@0.21.5 (postinstall: node install.js)
> ```
> A recent npm version blocks package install scripts by default unless explicitly
> approved. `esbuild` (the tool that builds the extension) needs its script to install
> its native binary — a widely used, trustworthy package, safe to approve:
> ```powershell
> npm approve-scripts esbuild
> npm install
> ```
>
> **The "N vulnerabilities" note that may appear is harmless:** it's about development
> tooling (esbuild, TypeScript, vitest…), never about code that ships inside the
> extension — this project has zero runtime dependencies. **Do not run**
> `npm audit fix --force`: it can break the toolchain by bumping unrelated versions.

## 6. Build the code

```powershell
npm run build
```

No output means success (`tsc` stays silent when it succeeds).

## 7. Build the extension bundle

```powershell
npm run build:extension
```

This should print:

```
extension bundled into ...\conventional-comments-toolkit\packages\extension\dist-ext
```

## 8. Load the extension in Chrome

1. Open `chrome://extensions` in the address bar.
2. Turn on **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `packages\extension\dist-ext` folder **inside** the folder where you
   cloned the repository.

> **If the folder picker looks incomplete** (for example, it only shows a `firefox`
> subfolder and nothing else): this is a display glitch, common when the repository sits
> in a folder synced by OneDrive, Dropbox, or similar — not an actual absence of files.
> Verify with:
> ```powershell
> dir path\to\packages\extension\dist-ext
> ```
> You should see `manifest.json`, `content.js`, `background.js`, `options.js`,
> `styles.css`, etc. If they're there, close the folder picker, reopen it, and try again.

The **"Conventional Comments Toolkit"** extension should now appear in the list,
enabled, with no red "Errors" button.

## 9. Test on a real GitHub Pull Request

1. Open a Pull Request on `github.com` (one of your own, or any PR you can comment on).
2. Click into a comment field (a new comment, or a reply in a thread).
3. A **toolbar** should appear above the field, with the labels (`issue`, `nitpick`,
   `suggestion`, etc.).
4. Write a comment without a label: a validation pill should flag a warning.
5. Click a label in the toolbar: the corresponding prefix should be inserted into the
   field.

If all of that works, the extension is up and running. It operates in `assist` mode by
default — it helps and flags issues, but never blocks submission (see `A-FAIRE-fr.md` at
the repository root for what's next: the server component, other platforms, etc.).
