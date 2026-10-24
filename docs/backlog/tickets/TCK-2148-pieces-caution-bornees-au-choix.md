---
id: TCK-2148
title: "Les pièces d'une restitution de caution sont jugées au choix : 10 Mo chacune, 10 au plus"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-222--photos-et-pièces-téléversées-hors-de-mediamanager-et-mediadropzone"
tags: [front, leases, i18n, pistes]
---

## Objectif utilisateur

Le gestionnaire qui joint à une restitution de caution une pièce trop lourde, ou trop de pièces,
l'apprend au moment où il les choisit, avec leur nom et la borne, au lieu d'un refus de toute la
restitution après l'envoi.

## Contexte

Réf : **P222.04** du fichier de pistes, `validé (délégué)`. `RefundDepositRequest` borne
`uploads` à 10 pièces (`max:10`) et chacune à 10 Mo (`uploads.*` `max:10240`) ;
`DepositRefundModal.handleFiles` garde tout ce que le sélecteur rend.

## Décision du porteur (déléguée)

> juger au choix, dans `handleFiles` de `DepositRefundModal`, chaque pièce à 10 Mo et le nombre à 10, comme `RefundDepositRequest` (`uploads.*` `max:10240`, `uploads` `max:10`), en écartant sans appel à l'API et en nommant les fichiers refusés, sur le modèle du refus de taille de `KycUploader`, `DocumentUploadDialog` et `QuoteSubmitForm` (TCK-1907), sans réduction (pièce justificative, TCK-542) ; clé neuve en `fr` et `en` si aucune du même écran ne convient, le `wo` portant le texte français ; test Vitest : une pièce de 11 Mo est refusée sans appel à l'API ; reste : la borne de la somme sous la borne du corps et l'alignement de `uploads` de l'API sur ce qu'une requête peut porter

## Reste à faire

> la borne de la somme sous la borne du corps et l'alignement de `uploads` de l'API sur ce qu'une requête peut porter

## Hypothèses (mode sans humain)

- Le plafond est inclusif, comme `max:10240` de Laravel : une pièce de 10 Mo exactement passe.
- Le sélecteur **remplace** la sélection (comportement inchangé). Une pièce trop lourde est
  écartée et nommée, les autres restent choisies. Une sélection qui compte plus de 10 pièces
  admises est refusée entière et dite (« Maximum 10 fichiers. »), comme le devis (TCK-1889) :
  choisir lesquelles garder n'est pas au front.
- Aucune clé du même écran (`lease.deposit`) ne convient : clés neuves
  `lease.deposit.modal.file_too_large` (« Fichier trop lourd ({max} Mo au plus) : {files} »,
  texte du devis) et `lease.deposit.modal.max_files` (« Maximum {max} fichiers. ») ; le `wo`
  porte le français (wolof en pause).

## Delta à produire

- [ ] `DepositRefundModal.handleFiles` : pièces de plus de 10 Mo écartées et nommées ; plus de 10
  pièces refusées et dites.
- [ ] Clés `lease.deposit.modal.file_too_large` et `max_files` en `fr`, `en`, `wo`.
- [ ] Test Vitest `DepositRefundModal.pieces-bornees.tck-2148.test.tsx`.

## Critères d'acceptation

- [ ] AC1 — Une pièce de 11 Mo est écartée, nommée avec « 10 Mo », et n'entre pas dans l'envoi :
  la requête ne porte que la petite pièce choisie avec elle.
- [ ] AC2 — Onze pièces admises sont refusées et dites ; aucune ne part.
- [ ] AC3 — Une pièce de 10 Mo exactement est gardée, sans alerte.
- [ ] AC4 — `reduire-photo.branchement.test.ts` reste vert : la caution ne réduit rien.

## Hors périmètre

- La borne de la somme et l'alignement de la règle de l'API (reste, au porteur).
- Le type des pièces (le sélecteur l'annonce déjà par `accept`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
