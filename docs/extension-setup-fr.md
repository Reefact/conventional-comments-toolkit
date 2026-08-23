# Installer et tester l'extension navigateur — guide pas à pas (Windows / PowerShell)

Ce guide part d'un poste Windows **vierge** (aucun Node.js, npm ni Git installés) et vous
mène jusqu'au test de l'extension sur une vraie Pull Request GitHub. Il suppose que vous
avez déjà un navigateur (Chrome, Edge, ou tout autre navigateur à base Chromium) — son
installation n'est pas couverte ici.

Toutes les commandes s'exécutent dans **PowerShell**. Ouvrez-le (menu Démarrer → tapez
« PowerShell » → Entrée).

## 1. Installer Node.js

```powershell
winget install OpenJS.NodeJS.LTS
```

`winget` est l'outil d'installation de paquets intégré à Windows 10/11 (via l'App
Installer du Microsoft Store) ; c'est lui qui installe Node.js et Git ci-dessous. Si une
fenêtre de contrôle de compte utilisateur (UAC) apparaît, acceptez-la.

**Important : fermez puis rouvrez PowerShell** après l'installation — le PATH n'est mis à
jour qu'à l'ouverture d'une nouvelle fenêtre.

Vérifiez :

```powershell
node --version
```

Vous devez obtenir une version **≥ 20** (par exemple `v20.11.0` ou `v24.19.0`).

## 2. Vérifier npm

npm est installé avec Node.js. Vérifiez :

```powershell
npm --version
```

> **Si vous voyez ce message :**
> ```
> npm : Impossible de charger le fichier C:\Program Files\nodejs\npm.ps1, car
> l'exécution de scripts est désactivée sur ce système...
> ```
> C'est une politique de sécurité PowerShell par défaut — pas un problème d'installation.
> Autorisez les scripts installés localement pour votre compte (pas besoin de droits
> administrateur) :
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Une confirmation peut être demandée (`[O] Oui  [N] Non...`) — répondez `O`. Relancez
> ensuite `npm --version`.

## 3. Installer Git

```powershell
winget install --id Git.Git -e --source winget
```

**Fermez et rouvrez PowerShell** à nouveau, puis vérifiez :

```powershell
git --version
```

## 4. Cloner le dépôt

Placez-vous dans le dossier de votre choix (par exemple `cd $HOME\Documents`, ou
n'importe quel autre dossier — il n'y a pas de chemin imposé), puis :

```powershell
git clone https://github.com/Reefact/conventional-comments-toolkit.git
cd conventional-comments-toolkit
```

Toutes les commandes qui suivent s'exécutent **depuis ce dossier**.

## 5. Installer les dépendances

```powershell
npm install
```

> **Si vous voyez cet avertissement :**
> ```
> npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
>   esbuild@0.28.2 (postinstall: node install.js)
>   esbuild@0.21.5 (postinstall: node install.js)
> ```
> Une version récente de npm bloque par défaut les scripts d'installation des paquets,
> sauf approbation explicite. `esbuild` (l'outil qui construit l'extension) en a besoin
> pour installer son binaire natif — un paquet très répandu, sûr à approuver :
> ```powershell
> npm approve-scripts esbuild
> npm install
> ```
>
> **La mention « N vulnerabilities » qui peut apparaître est sans conséquence :** elle
> porte sur des outils de développement (esbuild, TypeScript, vitest…), jamais sur du
> code qui finit dans l'extension — ce projet n'a aucune dépendance en exécution. **Ne
> lancez pas** `npm audit fix --force` : ça peut casser l'outillage en changeant des
> versions sans rapport avec le sujet.

## 6. Compiler le code

```powershell
npm run build
```

Aucune sortie ne s'affiche si tout se passe bien (`tsc` est silencieux en cas de succès).

## 7. Générer le bundle de l'extension

```powershell
npm run build:extension
```

Ça doit afficher :

```
extension bundled into ...\conventional-comments-toolkit\packages\extension\dist-ext
```

## 8. Charger l'extension dans Chrome

1. Ouvrez `chrome://extensions` dans la barre d'adresse.
2. Activez **Mode développeur** (interrupteur en haut à droite).
3. Cliquez **Charger l'extension non empaquetée**.
4. Sélectionnez le dossier `packages\extension\dist-ext` **à l'intérieur** du dossier où
   vous avez cloné le dépôt.

> **Si la fenêtre de sélection de dossier semble incomplète** (par exemple, elle
> n'affiche qu'un sous-dossier `firefox` et aucun autre fichier) : c'est un problème
> d'affichage, courant quand le dépôt est dans un dossier synchronisé par OneDrive,
> Dropbox ou équivalent — pas une absence réelle de fichiers. Vérifiez avec :
> ```powershell
> dir chemin\vers\packages\extension\dist-ext
> ```
> Vous devriez voir `manifest.json`, `content.js`, `background.js`, `options.js`,
> `styles.css`, etc. Si c'est le cas, fermez la fenêtre de sélection, rouvrez-la, et
> réessayez.

L'extension **« Conventional Comments Toolkit »** doit apparaître dans la liste, activée,
sans bouton rouge « Erreurs ».

## 9. Tester sur une vraie Pull Request GitHub

1. Ouvrez une Pull Request sur `github.com` (l'une des vôtres, ou toute PR où vous pouvez
   commenter).
2. Cliquez dans un champ de commentaire (nouveau commentaire, ou réponse dans un fil).
3. Une **barre d'outils** doit apparaître au-dessus du champ, avec les labels (`issue`,
   `nitpick`, `suggestion`, etc.).
4. Écrivez un commentaire sans label : une pastille de validation doit signaler un
   avertissement.
5. Cliquez un label dans la barre d'outils : le préfixe correspondant doit s'insérer dans
   le champ.

Si tout ça fonctionne, l'extension est opérationnelle. Elle tourne en mode `assist` par
défaut — elle aide et signale, mais ne bloque jamais l'envoi (voir `A-FAIRE-fr.md` à la
racine du dépôt pour la suite : composant serveur, autres plateformes, etc.).
