---
id: TCK-1343
title: "Convertir une demande de contact consulte le détecteur de doublons : 409 `customer.duplicate`, sauf `allow_duplicate`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-125--téléphones-écrits-sans-normalisation-et-leurs-lecteurs"
tags: [api, web, crm, contact-leads, pistes]
---

## Contexte

Réf : **P125.02** du fichier de pistes, `validé` (V7 accordé).

`ContactLeadService::convert()` créait la fiche par `CustomerService::create()` sans consulter
`CustomerDuplicateDetector` (TCK-591). Une demande au `+221771234567` dans une agence qui a déjà
une fiche à ce numéro produisait une seconde fiche (201), là où la création à la main rend 409
`customer.duplicate`.

## Décision du porteur

> porteur (2026-10-22) : consulter `CustomerDuplicateDetector` dans `convert()` et rendre 409 `customer.duplicate` avec `existing`, `allow_duplicate` accepté ; la boîte des demandes présente le doublon comme `CustomerForm`

## Objectif

La conversion d'une demande obéit à la règle de doublon de la création d'un client, et l'agent
voit la fiche existante avant de choisir de convertir quand même.

## Delta à produire

- [x] `ConvertContactLeadRequest` : `allow_duplicate` (`sometimes|boolean`).
- [x] `ContactLeadService::convert()` : sans `allow_duplicate`, le détecteur est consulté sur le
      téléphone et l'e-mail de la demande, dans l'agence de la demande ; une fiche trouvée → 409
      `customer.duplicate` avec `existing`, rien n'est écrit. Même réserve que
      `CustomerController::refuseDuplicate` : la sonde n'est jouée que pour le personnel de l'agence
      ou le super-admin (un bailleur destinataire ne s'en sert pas d'oracle).
- [x] `useConvertLead` envoie `allow_duplicate` quand on force.
- [x] `ContactLeadsInbox` : un 409 `customer.duplicate` affiche le bloc de `CustomerForm` (mêmes
      clés `agentCrm.form.duplicate.*` : titre, fiche masquée, « même téléphone / même e-mail »,
      « Ouvrir sa fiche ») et un bouton « Convertir quand même » (clé neuve
      `contactLeads.actions.convertAnyway`).

## Critères d'acceptation

- [x] AC1 — Fiche existante `77 123 45 67`, demande au `+221771234567` → 409 `customer.duplicate`,
      `existing[0].matched_on = phone`, une seule fiche, demande non convertie ni traitée.
- [x] AC2 — Même demande avec `allow_duplicate: true` → 201, deux fiches.
- [x] AC3 — Doublon par e-mail replié (`Awa@Example.com` / `awa@example.com`) → 409.
- [x] AC4 — Dans la boîte, le 409 affiche la fiche existante et son lien ; « Convertir quand
      même » rappelle l'API avec `allow_duplicate` et mène à la fiche créée.

## Hypothèses

- Le bailleur destinataire d'une demande (qui peut la convertir) n'est pas sondé, comme à la
  création : le refus serait un oracle sur le CRM de l'agence (TCK-591, verif-591 m1).
- Le wolof est en pause : la clé neuve porte en `wo` le texte français.

## Hors périmètre

- Rattacher la demande à la fiche existante (l'autre option de la Piste, non retenue par le porteur).

## Notes d'implémentation

- Ablation API : appel au détecteur retiré → 2 rouges sur 6 (AC1, AC3) ; remis → 6 verts.
- Ablation front : `doublonsDe` neutralisé → le cas 409 rouge ; corps du hook réduit à `{}` → le
  test `contact-leads.tck-1343` rouge ; remis → verts.
