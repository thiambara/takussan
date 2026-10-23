---
id: TCK-1747
title: "Les visites, réservations et baux d'une fiche client lisent toutes les pages"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1367]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-171--sélecteurs-et-listes-sans-pagination-nourris-par-la-taille-de-page-par-défaut"
tags: [front, crm, pagination, pistes]
---

## Contexte

Réf : **P171.05** du fichier de pistes, `validé (délégué)` (V7 accordé).

`fetchCustomerLinked` lisait une page de 20 pour chacun des trois onglets de la fiche client
(visites, réservations, baux), que `CustomerLinkedRecords` rend sans total ni page suivante.

## Décision du porteur (déléguée)

> les trois onglets de `fetchCustomerLinked` (visites, réservations, baux) lisent toutes les pages par 100 (`lireToutesLesPages`, TCK-1367), tri inchangé ; test : 21 visites d'un client, la 21ᵉ s'affiche ; reste : `CustomerMatches` (« voir plus » ou pagination des biens correspondants, dont le volume suit le catalogue, et non le client)

## Reste à faire

> `CustomerMatches` (« voir plus » ou pagination des biens correspondants, dont le volume suit le catalogue, et non le client)

## Objectif utilisateur

L'agent voit sur la fiche toutes les visites, réservations et baux du client.

## Contrat de données

Aucun changement d'API : `GET /api/property-visits`, `/api/bookings` et `/api/leases` paginent et
rendent `meta.last_page`.

## Delta à produire

- [x] `fetchCustomerLinked` lit toutes les pages par 100 (`lireToutesLesPages`), filtre, champs et
  tri inchangés.
- [x] Test : 21 lignes par onglet, la 21ᵉ s'affiche (visites, réservations, baux).

## Critères d'acceptation

- [x] AC1 — la 21ᵉ visite d'un client s'affiche sur sa fiche ; de même pour les réservations et les baux.

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Ablation : `agent-crm.ts` rendu à `HEAD` → 3 rouges sur 3 ; correctif remis → 3/3 verts.
