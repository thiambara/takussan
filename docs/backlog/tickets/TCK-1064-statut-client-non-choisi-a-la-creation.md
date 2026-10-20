---
id: TCK-1064
title: "Le formulaire de création d'un client ne propose plus de statut, que l'API écartait (P80.01)"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [front, customers, pistes]
---

## Objectif utilisateur

L'agent qui crée une fiche client ne se voit plus proposer un statut que l'enregistrement ignore :
le client est créé actif, et son statut se change ensuite depuis l'édition.

## Contexte

Réf : **P80.01** du fichier de pistes (angle 80), `validé (délégué)` (critère V7 accordé).

`CustomerForm` rend le sélecteur `status` dans les deux modes et l'envoie à la création ;
`StoreCustomerRequest` n'a pas de règle `status` et `CustomerController::store()` force
`CustomerStatus::Active`. Choisir « Inactif » à la création enregistrait donc un client actif.

## Décision du porteur (déléguée)

> retirer le sélecteur `status` du formulaire en mode `create` (il reste en `edit`), et ne plus envoyer `status` dans le corps de création ; `StoreCustomerRequest` inchangé, le contrôleur garde `CustomerStatus::Active` forcé, le défaut déjà en vigueur ; test : en `create` le sélecteur n'est pas rendu et le corps n'a pas de `status`, en `edit` il l'est

## Reste à faire

> créer un client directement `inactive` ou `blocked`, au porteur

## Contrat de données

`POST /api/customers` (inchangé) : le corps de création ne porte plus `status`.
`PUT /api/customers/{id}` (inchangé) : le corps d'édition le porte toujours.

## Contraintes strictes (métier)

- Aucun changement côté API : la création reste `active` par défaut (`docs/models-spec.md` § 7).
- Aucune clé de traduction neuve.

## Delta à produire

- [ ] `CustomerForm` : le sélecteur `status` n'est rendu qu'en mode `edit`.
- [ ] `lib/schemas/customer.ts` : `status` devient facultatif dans `CustomerFormPayload`, et
      `sansStatut()` retire la clé du corps de création.
- [ ] Test : `CustomerForm.statut.test.tsx` (deux cas).

## Critères d'acceptation

- [ ] AC1 — en `create`, aucun champ « Statut » n'est rendu, et le corps passé à
      `createCustomerAction` n'a pas de clé `status`.
- [ ] AC2 — en `edit`, le champ « Statut » est rendu et le corps d'édition porte le statut de la
      fiche.

## Hors périmètre

- Créer un client directement `inactive` ou `blocked` (reste au porteur).
- `StoreCustomerRequest` et `CustomerController::store()` : inchangés.

## Notes d'implémentation

_(à remplir par implementing-specs)_
