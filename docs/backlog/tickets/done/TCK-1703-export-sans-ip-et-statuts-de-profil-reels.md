---
id: TCK-1703
title: "L'export du journal n'annonce plus d'`ip_address`, et la spec dit les statuts réels de chaque profil"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-108--ce-que-lapi-tire-encore-de-la-requête-sur-le-chemin-interne-du-front"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [api, audit, export, specs, profils, pistes]
---

## Contexte

Réf : **P108.02** et **P115.06** du fichier de pistes, `retenu · à valider — chemin fermé`,
validées par le porteur le 2026-10-22 et traitées en session. Leur correctif passe par la spec,
que l'implémenteur ne modifie pas.

- **P108.02** — `ActivityLogExporter` déclare une colonne `ip_address`, remplie par
  `properties->ip`. Aucun `withProperties()` ni `tapActivity` n'écrit cette clé : 0 ligne sur
  25 597 en développement. La colonne sort vide dans tout export, et `models-spec.md` décrit un
  champ qui n'existe pas.
- **P115.06** — `features.md` promet à tous les profils une machine à états
  `draft → pending → active → suspended | expired | archived`. Aucun enum de profil n'a `pending`
  ni `expired`.

## Objectif utilisateur

L'export ne promet pas une colonne toujours vide, et la spec dit ce que le code fait.

## Delta à produire

- [x] `ActivityLogExporter` : `ip_address` retirée des colonnes et de la ligne (voie la plus
  étroite : écrire l'IP au journal serait un choix de données personnelles, que personne n'a fait).
- [x] `docs/models-spec.md` : la ligne « `ip_address`, `user_agent` » dit qu'aucun chemin ne les
  écrit.
- [x] `docs/features.md` (onboarding) : les statuts réels de chaque profil, et ceux qu'aucun chemin
  ne pose.

## Critères d'acceptation

- [x] AC1 — l'en-tête d'un export CSV ne contient plus `ip_address`
  (`ActivityLogExporterTest::test_l_export_n_annonce_pas_de_colonne_que_rien_n_ecrit`).
- [x] AC2 — `features.md` ne cite plus `pending` ni `expired` comme états d'un profil.

## Hors périmètre

- Retirer des enums les cas sans écrivain (`inactive`, `archived`, `suspended` du prestataire) :
  c'est un choix de produit, que porte P115.04 pour le prestataire.
- `LeaseSignature.ip_address` est une pièce de preuve écrite par la signature, sans rapport avec
  ce défaut.

## Notes d'implémentation

- Test écrit d'abord : rouge sur l'arbre d'origine (`assertStringNotContainsString`, ligne 76),
  vert après le retrait. `tests/Feature/Api/ActivityLogExporterTest.php` et `tests/Feature/Audit` :
  60 verts.
- Les écrivains de statut, relevés par `grep` des cas d'enum hors `Models/Enums` :
  - agent : `Draft` (invitation), `Suspended` (suspension d'équipe) ;
  - bailleur : `Draft`, `Blocked` ;
  - admin d'agence : `Suspended` ;
  - prestataire : `Draft` ;
  - `Inactive` et `Archived` : 0 écriture.
