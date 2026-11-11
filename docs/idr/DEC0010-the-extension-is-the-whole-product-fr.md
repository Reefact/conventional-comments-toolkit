# DEC0010 | L'extension seule comme produit

*English: [DEC0010-the-extension-is-the-whole-product-en.md](DEC0010-the-extension-is-the-whole-product-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-10 | Accepté | Reprise de la décision consignée dans `specifications-fr.md` (§2) et le commit `04e7492`, le 2026-11-11 |  |

## Contexte

La spécification décrivait deux composants : l'extension navigateur (composant A), et un vérificateur exécuté dans l'intégration continue de la plateforme (composant B), qui publiait un statut de conformité opposé au merge. Le code du vérificateur avait déjà quitté `main` (`b3009b8`), et la pull request qui devait le remplacer (#90) était fermée.

Une extension navigateur agit côté client uniquement : elle peut empêcher un clic, pas la publication d'un commentaire par l'API, une CLI, un IDE, un autre navigateur ou un poste sans l'extension.

## Décision

Le produit est l'extension navigateur seule, et il ne contrôle pas la complétion d'une pull request.

## Justification

Le texte d'origine ne consigne pas de justification au-delà de la décision. Il note que chaque équipe peut s'appuyer côté intégration continue sur les options natives de sa plateforme, par exemple la résolution obligatoire des conversations.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- La spécification ne décrit plus qu'un composant, celui qui existe.

### Négatives

- Le toolkit lui-même n'empêche plus la fusion d'une pull request qui porte des fils bloquants non résolus ; une plateforme peut toujours l'exiger par ses propres options.

### Risques

- Aucun relevé au moment de la décision.

### Actions de suivi

- Retirer du code la lecture du statut publié et le grisage du bouton de fusion (pull request suivante).
- Conséquences dans la spécification : O3 signifie signaler les fils bloquants non résolus, jamais empêcher la fusion ; le bandeau ne lit que la page, et sa source unique est les fils lus dans le DOM ; `enforce` ne dépend plus de l'âge de la pull request ni d'aucun état publié ; `warn` devient un alias d'`assist`, signalé comme obsolète, les deux modes étant identiques côté extension ; le plancher n'a plus qu'un canal ; les clés qui ne servaient qu'au vérificateur (`formatSeverity`, `overrideLabel`, `resolverOverrideGroup`, `activation`, `docUrl`) sont retirées et signalées comme inconnues ; une résolution de fil compte quel qu'en soit l'auteur, la règle de gouvernance n'existant que pour le vérificateur ; le §12 se limite à la télémétrie de l'extension ; les phases P0 et P5 et 13 critères d'acceptation sont retirés, sans renumérotation ; CA-06 et CA-18 deviennent des tests de non-régression, et la règle des fins de ligne `CRLF` reste normative.
