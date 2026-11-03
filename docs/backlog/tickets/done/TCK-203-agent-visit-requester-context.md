---
id: TCK-203
title: "Visites agent — afficher le demandeur exploitable"
status: done
phase: P1
family: front
estimate: S
wave: 22
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#16-crm--relation-client
  models:
    - docs/models-spec.md#17-propertyvisit-
    - docs/models-spec.md#7-customer
tags: [front, visits, crm, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un agent ouvre une visite et identifie immédiatement le demandeur pour confirmer, replanifier ou contacter.

## Contrat de données

`PropertyVisit` peut référencer un `visitor`, un `customer` ou des champs visiteur anonymes. La fiche agent doit consommer la relation disponible et afficher un libellé humain.

## Direction UX / Artistique

Détail de visite orienté rendez-vous : demandeur, moyen de contact, bien, créneau, durée, statut et actions proches du titre.

## Contraintes strictes (métier)

- Respecter le scope agence/portefeuille.
- Ne pas exposer d'informations personnelles si l'agent n'est pas autorisé sur la visite.
- Gérer les trois modes d'identification du visiteur.

## Delta à produire

- [ ] Remplacer `Customer #id` par nom complet ou libellé humain disponible.
- [ ] Afficher téléphone/email ou lien fiche client quand autorisé.
- [ ] Ajouter fallback lisible pour visiteur anonyme incomplet.
- [ ] Ajouter tests pour visite liée à Customer, visite liée à User et visite anonyme.

## Critères d'acceptation

- [ ] `/app/visits/{id}` n'affiche plus `Customer #...` comme seul identifiant.
- [ ] Une visite avec Customer affiche un lien vers la fiche CRM si accessible.
- [ ] Une visite anonyme affiche au moins nom/téléphone/email disponibles.
- [ ] Les actions de visite restent visibles selon statut.

## Hors périmètre

- Création d'un nouveau Customer depuis une visite.
- Paiement de visite.
- Rappels automatiques.

## Notes d'implémentation

The visit detail endpoint now loads and serializes the `customer` relation for show responses, because the frontend cannot render a human requester from `customer_id` alone.
