---
id: TCK-2054
title: "La recherche de doublon et la création d'une fiche client se font sous un verrou consultatif"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
  adr:
    - "docs/adr/0073-la-creation-d-une-fiche-client-se-serialise-par-un-verrou-consultatif.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#rien-ne-sérialise-la-recherche-de-doublon-et-la-création--deux-créations-simultanées-passent-toutes-deux"
tags: [api, crm, concurrence, pistes]
---

## Objectif

Deux créations simultanées de la même fiche client (même agence, même téléphone ou même e-mail)
ne passent plus toutes deux le détecteur de doublon : la détection et la création se font dans une
transaction, sous un verrou consultatif PostgreSQL, sur les trois chemins de création.

## Contexte

Réf : **P158.02** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : ADR-0073 : verrou consultatif `pg_advisory_xact_lock` sur `(agency_id, téléphone canonique)`, ou l'e-mail replié, sur les chemins de création de fiche client, et `lockForUpdate` sur `users` pour `findOrCreateFromUser` ; clé dérivée comme l'écrit l'ADR ; les deux verrous existants gardent leur `crc32`

ADR-0073 fait foi (les trois chemins, la clé, les règles communes) ; ce ticket ne le recopie pas.

- `CustomerController::store` : `refuseDuplicate()` puis `Customer::create`, sans transaction ni
  verrou.
- `ContactLeadService::convert` : la transaction ne verrouille que la ligne de la demande.
- `CustomerService::findOrCreateFromUser` : lecture par `user_id` puis création, sans verrou.

## Hypothèses (mode sans humain)

- L'utilitaire du § 2 est `App\Support\AdvisoryLock` (clé, pose). La dérivation des parties de la
  clé (téléphone canonique, sinon e-mail replié) vit à côté du détecteur, dans
  `CustomerDuplicateDetector::lockCreation`, pour rester la même normalisation que celle qu'il
  compare.
- `AdvisoryLock::acquire` refuse d'être appelé hors transaction (`LogicException`) : la règle 2 de
  l'ADR devient une erreur, pas une convention.
- Une création sans téléphone ni e-mail ne prend pas de verrou consultatif : le détecteur ne
  cherche rien dans ce cas, il n'y a rien à sérialiser.
- La course entre deux processus réels n'est pas rejouée par la suite (une seule connexion par
  test, dans la transaction de `RefreshDatabase`). Le test établit l'ordre des instructions (verrou
  avant la détection et avant l'insertion, ligne `users` verrouillée avant la relecture) et la
  transaction propre à chaque chemin.

## Delta à produire

- [x] `App\Support\AdvisoryLock` : clé 64 bits (8 premiers octets du SHA-256 de
  `<espace>:<parties>`), pose transactionnelle.
- [x] `CustomerDuplicateDetector::lockCreation(agence, téléphone, e-mail)`.
- [x] `CustomerController::store` : transaction neuve, verrou, détection, création ; le verrou est
  pris aussi sous `allow_duplicate`.
- [x] `ContactLeadService::convert` : verrou après la ligne de la demande.
- [x] `CustomerService::findOrCreateFromUser` : transaction neuve, `users` verrouillée, relecture
  sous verrou, verrou consultatif si le compte a une agence.

## Critères d'acceptation

- [x] AC1 — La clé est celle du § 2 : un entier signé de 64 bits, stable, qui distingue l'agence,
  le téléphone canonique et l'e-mail replié ; deux saisies du même numéro donnent la même clé.
- [x] AC2 — `store` pose le verrou de la clé avant la détection et avant l'insertion, dans sa
  propre transaction, y compris sous `allow_duplicate`.
- [x] AC3 — `convert` pose le verrou après la ligne de la demande, avant la détection et la création.
- [x] AC4 — `findOrCreateFromUser` verrouille la ligne `users`, relit la fiche par `user_id`
  ensuite, puis pose le verrou consultatif si le compte a une agence.
- [x] AC5 — Hors transaction, `AdvisoryLock::acquire` lève.

## Hors périmètre

- Les deux verrous existants (`SuperAdminCooptationService`, `IntegrationController`) gardent leur
  `crc32` (ADR-0073 § 4).
- Toute contrainte d'unicité (ADR-0073 § 5).

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Crm/CreationFicheSousVerrouTest.php` (7 cas). Avant le
  câblage des chemins : 4 rouges (aucun verrou dans `store`, sous `allow_duplicate`, dans
  `convert` ; ligne `users` non verrouillée dans `findOrCreateFromUser`).
- Le test lit l'ordre des requêtes (`DB::listen`) et le niveau de transaction au `creating` de
  `Customer` : sous `RefreshDatabase`, la transaction du chemin est le niveau 2. Une connexion de
  sonde ne servirait à rien : la ligne `users` du test n'est pas validée, une autre connexion ne
  la voit pas et ne bloque donc pas sur elle.
- Ablations, une à une, chacune remise : verrou de `store` retiré → 2 rouges ; verrou de
  `convert` → 1 ; verrou de la ligne `users` → 1 ; verrou consultatif de `findOrCreateFromUser`
  → 1 ; garde « hors transaction » d'`AdvisoryLock::acquire` → 1. Tout remis → 7 verts.
- `unpack('J', …)` lit les 8 octets en gros-boutiste dans un entier PHP, signé sur 64 bits : la
  valeur est celle qu'attend `pg_advisory_xact_lock(bigint)`, sans conversion.

