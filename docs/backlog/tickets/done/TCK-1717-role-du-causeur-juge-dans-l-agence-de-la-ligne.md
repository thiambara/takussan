---
id: TCK-1717
title: "L'export du journal juge `causer_role` dans l'agence de la ligne, pas sur tous les profils du compte"
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
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-139--colonnes-des-exports-quaucun-chemin-nécrit-ou-qui-lisent-une-clé-nommée-autrement"
tags: [back, audit, export, pistes]
---

## Objectif utilisateur

Dans l'export du journal, la colonne `causer_role` dit le rôle que l'auteur tient **dans l'agence
de la ligne**. L'admin d'une agence ne lit plus « agency_admin » pour un agent de chez lui, et
n'apprend plus le rôle que cet agent tient dans une autre agence.

## Contexte

Réf : **P139.02** du fichier de pistes, `validé` (critères V7 et V3 cités par le classement,
accordés).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `9f180a3ae`) : un compte agent dans
l'agence A et admin de l'agence B cause une ligne sur un bien de A → l'export de l'admin de A
(`buildPayload()`) et celui de la console (`payloadForQuery()`) rendent `causer_role =
"agency_admin"`. `mapRow()` prenait `profileTypes()->first()`, qui empile les profils de toutes les
agences du compte.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

## Choix de l'implémenteur (voie la plus étroite)

- La `Piste` laisse deux voies pour l'export de la console : « l'agence de la ligne, ou la liste ».
  Retenue : **l'agence de la ligne** (`activity_log.agency_id`), une seule valeur, sans changer la
  forme de la colonne. La même règle sert l'export d'agence, dont toutes les lignes portent déjà
  l'agence de l'export (`AuditScope`).
- Seuls les trois profils d'agence (`agency_admin`, `agent`, `owner`) sont jugés dans l'agence de
  la ligne ; une ligne sans `agency_id` n'en retient aucun. Les autres types (`super_admin`,
  `service_provider`, `customer`, `tenant`) gardent leur place dans l'ordre de `profileTypes()`,
  comme avant.

## Hypothèses (mode sans humain)

- Le statut d'un profil n'entre pas en compte, comme dans `profileTypes()` (une ligne de profil,
  quel que soit son statut, vaut le rôle).

## Delta à produire

- [x] `ActivityLogExporter::mapRow()` : `causer_role` ← `roleDansLAgence($causer, $log->agency_id)`
  pour un causeur `User`, sur les relations déjà préchargées par `auteurEtSonRole()`.
- [x] Test : `tests/Feature/Audit/RoleDuCauseurDansLExportTest.php` (export d'agence et console).

## Critères d'acceptation

- [x] AC1 — Export de l'agence A : la ligne de l'agent de A, admin de B, sort `agent`.
- [x] AC2 — Export de la console : la ligne chez A sort `agent`, celle chez B `agency_admin`.

## Notes d'implémentation

- Ablation : `causer_role` remis à `profileTypes()->first()` → 2 rouges (`agency_admin` au lieu
  d'`agent`) ; remis → 2 verts.
- `ExportAuditRequetesParLigneTest` (3/3) reste vert : le calcul ne relit que les relations
  préchargées, sans requête par ligne.
