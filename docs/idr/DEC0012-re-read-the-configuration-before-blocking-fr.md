# DEC0012 | Relecture de la configuration avant tout blocage

*English: [DEC0012-re-read-the-configuration-before-blocking-en.md](DEC0012-re-read-the-configuration-before-blocking-en.md)*

## Statut

| Date | Statut | Note | Compte rendu lié |
| --- | --- | --- | --- |
| 2026-11-10 | Accepté | Reprise de la décision consignée dans `specifications-fr.md` (§8.1.3, règle 3) et les commits `0bc7f60` et `4867255`, le 2026-11-11 | Revues des PR #162 et #166 |

## Contexte

L'extension ne peut pas apprendre qu'une configuration distante a changé. Elle garde la configuration en cache pendant `configCacheTtlSeconds` ; une décision de blocage prise sur ce cache pouvait bloquer un envoi sur une configuration déjà assouplie.

La configuration d'organisation est le point de bascule pour assouplir le `mode` sur l'ensemble des dépôts qui ne l'écrivent pas eux-mêmes.

## Décision

Avant de bloquer un envoi, quel que soit le diagnostic, l'extension relit la configuration en contournant son cache, et si elle ne bloque plus, libère le contrôle d'envoi en invitant à renvoyer, sans rejouer l'envoi retenu.

## Justification

Aucun envoi n'est ainsi bloqué sur une configuration périmée : dès la tentative d'envoi suivante, et sans attendre l'expiration du cache, un envoi n'est plus bloqué si la configuration effective relue le permet. Un assouplissement de l'organisation ne le permet pas toujours : un dépôt qui écrit lui-même `enforce`, ou un plancher d'entreprise, gardent `enforce` effectif.

Le texte d'origine ne consigne pas de raison au refus de rejouer l'envoi : il précise seulement qu'il n'y a ni rejeu ni clic synthétique, et une seule relecture en cours par éditeur, aucune pendant la frappe.

## Alternatives envisagées

Aucune alternative n'a été documentée au moment de la décision.

## Conséquences

### Positives

- Un assouplissement qui change la configuration effective prend effet à l'envoi suivant.

### Négatives

- Chaque blocage coûte une relecture de la configuration.

### Risques

- Le cache HTTP du navigateur n'est pas mesuré : seul le cache de l'extension est contourné.

### Actions de suivi

- Aucun relevé au moment de la décision.
