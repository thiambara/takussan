---
id: TCK-470
title: "Les server actions des biens sont typées à plat alors que les payloads sont imbriqués"
status: done
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
depends_on: [TCK-464]
blocks: []
spec_refs:
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [front, typage, properties, dette]
---

## Objectif utilisateur

Aucun effet visible. C'est une dette de typage qui retire au compilateur la capacité d'attraper la
classe de défaut la plus coûteuse déjà rencontrée sur ce domaine.

## Contrat de données

`createPropertyAction` et `updatePropertyAction` sont typées sur un payload **plat**
(`PropertyFormPayload`), alors que les payloads produits par
`takussan-web/src/components/property-form/payload.ts` sont **imbriqués** — l'adresse part dans un
bloc `address: { … }`, ce que le backend attend.

L'écart est masqué par un `as never` aux deux points d'appel :
`PropertyWizard.tsx` (création) et `PropertyForm.tsx` (édition).

## Contraintes strictes (métier)

- Le `as never` **n'est pas une régression de TCK-464** : c'est une convention héritée, déjà en
  place avant. Ce ticket la solde, il n'accuse personne.
- ⚠ Ce qui rend la dette coûteuse : c'est exactement ce typage qui aurait attrapé le défaut central
  de TCK-464 — une adresse qui ne partait jamais. *Un cast qui fait taire le compilateur fait taire
  aussi ce qu'il aurait dit d'utile.*
- Aucun changement de comportement attendu : le payload envoyé sur le réseau doit rester identique,
  octet pour octet. Le prouver plutôt que l'affirmer.

## Delta à produire

- [x] Aligner le type accepté par les deux server actions sur la forme réellement envoyée.
- [x] Retirer les deux `as never`.
- [x] Vérifier qu'un payload mal formé **ne compile plus** — et le montrer, message d'erreur à
      l'appui, plutôt que de le supposer.

## Critères d'acceptation

- [x] AC1 — plus aucun `as never` sur ces deux appels.
- [x] AC2 — un payload plat passé à l'action est une erreur de compilation ; le message obtenu est
      consigné.
- [x] AC3 — les suites de création et d'édition restent vertes, et le corps de requête émis est
      inchangé.

## Hors périmètre

- Les autres server actions du dépôt qui emploieraient le même motif.

## Notes d'implémentation

Relevé par la revue de la tâche 10 de TCK-464, qui a explicitement constaté que le motif préexistait
côté création.
