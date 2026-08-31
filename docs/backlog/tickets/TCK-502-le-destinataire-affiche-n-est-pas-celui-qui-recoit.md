---
id: TCK-502
title: "Fiche bien — la carte nomme un agent, le message part chez un autre"
status: todo
phase: P2
family: bug
estimate: M
wave: 57
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-500]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#3-property
tags: [front, back, bug, messaging, property-detail, contact]
---

## Objectif utilisateur

Un visiteur qui écrit au sujet d'un bien doit écrire à la personne dont la fiche lui a montré le
nom et le visage.

## Contrat de données

Deux sources se contredisent aujourd'hui pour un même bien :

- la **carte de contact** de la fiche affiche `property.owner` — nom, avatar, lien vers le profil ;
- le **message** part au premier collaborateur de rôle `agent`, à défaut au propriétaire
  (`PropertyConversationResolver::recipientFor()`).

Relevé le 2026-08-31 sur la base de développement, bien `terrain-viabilise-a-guediawaye-PVh69x` :

```
owner affiché par la carte = Pape Cissé
collaborateur agent        = Ousmane Ndiaye     ← reçoit le message
collaborateur agent        = Demo Agent
```

**Second défaut, visible dans le même relevé : deux collaborateurs portent le rôle `agent`, et
rien ne dit lequel est le premier.** `firstWhere('role', Agent)` prend celui que la collection
rend en tête, c'est-à-dire l'ordre d'insertion — jamais décidé, jamais garanti. « L'agent
principal » n'existe dans aucune colonne.

## Direction UX / Artistique

La fiche doit nommer **celui qui recevra le message**. Que ce soit en corrigeant qui la carte
affiche, ou en corrigeant qui reçoit, est la décision produit à prendre — mais les deux ne peuvent
pas rester différents, parce que l'écran promet quelque chose que l'envoi ne tient pas.

## Contraintes strictes (métier)

1. Un « agent principal » doit être **défini**, pas déduit d'un ordre d'insertion : ou une colonne,
   ou un ordre explicite, ou la règle « le plus ancien accepté ».
2. La carte de contact, le contact anonyme (`contact-lead`), le message authentifié
   (`contact-message`) et la résolution (`.../conversation`) doivent tous désigner la **même**
   personne. Les trois derniers passent déjà par `PropertyConversationResolver` depuis TCK-500 ;
   la carte, non.
3. Le téléphone servi par `GET /public/properties/{slug}/contact` fait partie du lot : il doit
   être celui de la même personne.

## Delta à produire

- [ ] Décider et écrire la règle de l'agent principal (ADR si elle est structurelle).
- [ ] Rendre cette règle unique et partagée par la carte de contact et les trois chemins de contact.
- [ ] Tests : bien à deux collaborateurs `agent`, l'ordre d'insertion inversé ne change pas le
      destinataire ; la carte et l'envoi nomment la même personne.

## Critères d'acceptation

- [ ] AC1 — sur un bien dont un collaborateur `agent` diffère du propriétaire, le nom affiché par
      la carte de contact est celui qui apparaît dans le fil créé.
- [ ] AC2 — sur un bien à deux collaborateurs `agent`, le destinataire est le même quel que soit
      l'ordre d'insertion des deux lignes en base.
- [ ] AC3 — le contact anonyme, le message authentifié et la résolution nomment tous le même
      utilisateur, sur les deux biens ci-dessus.
- [ ] AC4 — le numéro rendu par `GET /public/properties/{slug}/contact` est celui de ce même
      utilisateur.
- [ ] AC5 — chaque test rougit si l'on rétablit l'ancienne règle (ablation).

## Hors périmètre

- Le choix produit lui-même (afficher l'agent, ou envoyer au propriétaire) : ce ticket exige la
  cohérence, il n'impose pas laquelle des deux vérités gagne.
- La messagerie de groupe.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
