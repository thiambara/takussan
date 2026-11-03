---
id: TCK-1397
title: "L'archive RGPD porte les avis reçus sur le profil de prestataire"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-139--colonnes-des-exports-quaucun-chemin-nécrit-ou-qui-lisent-une-clé-nommée-autrement"
tags: [back, rgpd, avis, pistes]
---

## Objectif utilisateur

L'export de ses données rend à un prestataire les avis reçus sur son profil de prestataire, à
côté de ceux reçus sur son compte.

## Contexte

Réf : **P139.04** du fichier de pistes, `validé` (critère V3 cité par le classement, accordé).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `e72d2ad69`) : un prestataire a un
avis sur son profil et un sur son compte → `payloads()['reviews.json']` ne rend que celui du
compte.

## Décision du porteur

> porteur (2026-10-22) : ajouter à `reviews.json` les avis sur le profil de prestataire du titulaire ; pas les avis sur ses biens

## Hypothèses (mode sans humain)

- La cible suit `ReceivedReviews::targetsActor()` : les profils de prestataire non supprimés du
  titulaire, comme `profile.json`, qui rend son profil par la relation (portée `SoftDeletes`).

## Delta à produire

- [x] `DataExportBuilder::payloads()` : `reviews.json` ajoute les avis dont la cible est un
  `ServiceProviderProfile` du titulaire.
- [x] Test : `DataExportTest::test_l_archive_porte_les_avis_recus_sur_le_profil_de_prestataire`.

## Critères d'acceptation

- [x] AC1 — L'avis sur le profil de prestataire du titulaire est dans `reviews.json`.
- [x] AC2 — Les avis sur ses biens, et sur le profil d'un autre prestataire, n'y sont pas.

## Notes d'implémentation

- Ablation : `DataExportBuilder.php` rendu à son état antérieur → rouge (seul l'avis sur le
  compte) ; remis → vert.
