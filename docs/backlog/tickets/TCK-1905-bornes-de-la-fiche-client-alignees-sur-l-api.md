---
id: TCK-1905
title: "Les bornes de longueur de la fiche client sont celles de l'API"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [web, crm, validation, parite, pistes]
---

## Objectif

Le formulaire de fiche client accepte les longueurs que l'API accepte : une fiche enregistrée par
l'API se réenregistre depuis le formulaire sans être raccourcie.

## Contexte

Réf : **P195.09** du fichier de pistes, `validé (délégué)` (V7 accordé).

- `customerFormSchema` (`takussan-web/src/lib/schemas/customer.ts`) bornait prénom et nom à 100,
  profession à 120, numéro de pièce à 64 ; `StoreCustomerRequest` et `UpdateCustomerRequest`
  admettent 255, 255, 255 et 100.
- Un prospect public converti (`ContactLeadPublicRequest`, `name` jusqu'à 120) peut porter un
  prénom de 101 à 120 caractères que le formulaire d'édition refusait.

## Décision du porteur (déléguée)

porter les bornes de `customerFormSchema` (`customer.ts`) à celles de `StoreCustomerRequest` et `UpdateCustomerRequest` : `max(255)` pour `first_name`, `last_name` et `occupation`, `max(100)` pour `id_number`, avec les messages existants (`firstNameTooLong`, `lastNameTooLong`, `occupationTooLong`, `idNumberTooLong`) ; test Vitest : un prénom de 150 caractères passe le schéma, un de 256 est refusé ; garder les 10 photos de l'assistant (`MAX_PHOTOS`), comme l'écrit TCK-120 (l. 50), sans changement de code ; reste : juger au front le nombre et la longueur des villes et quartiers recherchés après découpage, qui demande des messages neufs

## Reste à faire

juger au front le nombre et la longueur des villes et quartiers recherchés après découpage, qui demande des messages neufs

## Hypothèses (mode sans humain)

- Les messages existants ne portent aucun chiffre (« Le prénom est trop long. ») : aucun texte ne
  change, dans aucune langue.

## Delta à produire

- [x] `customerFormSchema` : `max(255)` pour `first_name`, `last_name`, `occupation`, `max(100)`
  pour `id_number`, messages inchangés.
- [x] Test Vitest des quatre bornes, et du prénom de 150 caractères.
- [x] `MAX_PHOTOS` de l'assistant inchangé (10, TCK-120).

## Critères d'acceptation

- [x] AC1 — Un prénom de 150 caractères passe le schéma ; un de 256 est refusé par
  `firstNameTooLong`.
- [x] AC2 — Nom et profession : 255 passent, 256 refusés ; numéro de pièce : 100 passe, 101 refusé.

## Hors périmètre

- Les villes et quartiers recherchés (reste ci-dessus).

## Notes d'implémentation

- Test : `takussan-web/src/lib/schemas/__tests__/customer.bornes-de-l-api.tck-1905.test.ts`
  (5 cas). Avant correctif : 5 rouges.
- Ablation : anciennes bornes remises → 5 rouges ; correctif remis → 5 verts.
