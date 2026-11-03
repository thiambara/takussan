---
id: TCK-185
title: Baux owner — création avec sélecteurs métier
status: done
phase: P1
family: front
estimate: M
wave: 20
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-044]
blocks: []
spec_refs:
  features:
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#27-guarantor-
tags: [front, owner, leases, crm, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit pouvoir créer un bail sans connaître d'identifiants techniques internes.

## Contrat de données

La création de bail repose sur les biens du portefeuille owner, les clients/locataires suivis dans le CRM et les conditions financières du bail. Les données doivent être chargées via les endpoints dashboard existants avec champs limités et relations nécessaires.

## Direction UX / Artistique

Formulaire de création calme et guidé : sélection du bien par titre/référence, recherche du locataire par nom/email/téléphone, sections financières lisibles, résumé avant création.

## Contraintes strictes (métier)

- Aucun champ `ID` brut ne doit être requis dans l'interface utilisateur.
- Le sélecteur de bien est limité au portefeuille accessible par le profil owner actif.
- Le sélecteur locataire ne retourne que les customers accessibles au même scope.
- Les montants sont affichés et saisis avec devise cohérente.
- La contrainte de garants suit le modèle `Guarantor`.

## Delta à produire

- [ ] Remplacer `Bien (ID)` par un sélecteur/recherche de bien.
- [ ] Remplacer `Bailleur (ID)` par le profil owner actif prérempli ou une sélection autorisée si plusieurs profils.
- [ ] Remplacer `Locataire (ID)` par une recherche Customer.
- [ ] Ajouter un récapitulatif du bien et du locataire sélectionnés.
- [ ] Garder les champs durée, loyer, caution, devise, fréquence, jour d'échéance et clauses.
- [ ] Préparer l'ajout de garants sans bloquer la création initiale.
- [ ] Tests frontend : formulaire sans IDs bruts, filtrage scope, validation des champs requis.

## Critères d'acceptation

- [ ] `/app/leases/new` ne rend plus `Bien (ID)`, `Bailleur (ID)`, `Locataire (ID)`.
- [ ] Un owner peut sélectionner un de ses biens par libellé humain.
- [ ] Un owner peut rechercher un locataire/customer sans saisir d'ID.
- [ ] Le bail créé arrive en statut brouillon ou statut initial conforme au backend.
- [ ] Une tentative avec un bien hors portefeuille est impossible depuis l'UI et refusée côté API.

## Hors périmètre

- Création complète d'un nouveau customer.
- Signature électronique du bail.
- Refonte backend du cycle de vie du bail.

## Notes d'implémentation

Le bailleur est prérempli avec l'utilisateur actif, conformément au scope owner actuel.
