---
id: TCK-1080
title: "Un ancien nom de quartier renommé désigne toujours ce quartier, en recherche comme en alerte"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-quartier-renommé-fait-taire-les-recherches-sauvegardées-sur-son-ancien-nom-et-ce-nom-nest-gardé-nulle-part"
tags: [back, recherche, alertes, referentiel, pistes]
---

## Objectif utilisateur

Une recherche sauvegardée, ou un lien partagé, sur le nom d'un quartier que la console a renommé
continue de trouver les biens de ce quartier, au lieu de se taire sans erreur.

## Contexte

Réf : **P67.02** du fichier de pistes, `validé` (critère V7 accordé, et la voie des alias, qui
ajoute une colonne, choisie par le porteur).

`GeoNeighborhoodModeration::renommer()` écrivait le nouveau nom et réécrivait les adresses ;
l'ancien ne survivait qu'au journal d'activité, et `QuartierDuFiltre::idsDuReferentiel()` ne
compare la saisie qu'au nom courant. Mesuré avant correctif (test de garde ci-dessous) : bien
rattaché à « Sicap Lib », deux renommages (« Sicap Liberté », puis « Sicap Liberté 1 »), puis
`location=Sicap Liberte` → `[]` dans la liste publique.

## Décision du porteur

> (a) garder les anciens noms d'un quartier (table ou colonne d'alias, écrite par `renommer()`, lue par `idsDuReferentiel()`) ; test : renommer, puis rejouer l'alerte sur l'ancien nom (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- Une **colonne** plutôt qu'une table : `geo_neighborhoods.former_names` (`jsonb`, nullable), sans
  modèle neuf. Une source fusionnée garde sa ligne, donc ses anciens noms, et
  `idsDuReferentiel()` la remplace déjà par sa cible (TCK-1052) : la fusion d'un quartier renommé
  est couverte sans écriture de plus.
- Un ancien nom repris plus tard par un autre quartier désigne les deux : le filtre rend l'union.
  Aucune unicité n'est posée sur les anciens noms.
- Les quartiers renommés avant ce ticket n'ont pas d'ancien nom à reprendre (le journal n'est pas
  relu) : seule la suite est couverte.
- La carte (`FiltresDeLaCarte`) lit le même `idsDuReferentiel()` : le test l'éprouve avec la liste.

## Delta à produire

- [x] Migration neuve `2026_10_20_220000_add_former_names_to_geo_neighborhoods` (additive, `down()`).
- [x] `GeoNeighborhood` : `former_names` fillable, casté `array`.
- [x] `renommer()` ajoute le nom d'avant à `former_names`, sans doublon, dans sa transaction.
- [x] `idsDuReferentiel()` compare la clé de la saisie au nom courant et aux anciens noms.
- [x] Test `QuartierDuPanneauTest::test_un_ancien_nom_renomme_designe_toujours_le_quartier`.

## Critères d'acceptation

- [x] AC1 — après deux renommages, la liste et la carte publiques rendent le bien sur chacun des
  trois noms, graphie sans accent comprise.
- [x] AC2 — `PropertySearchService::alertMatches()` sur le premier nom rend `total` 1.
- [x] AC3 — un bien d'un autre quartier n'est pas touché.

## Hors périmètre

- `docs/models-spec.md` ne décrit pas encore la colonne : `/sync-specs` après fusion.
- Les équipements (P67.03) et le rapprochement CRM (P67.04, P67.05).

## Notes d'implémentation

- Ablation : lecture de `former_names` retirée d'`idsDuReferentiel()` (écriture gardée) → 1 rouge
  (la liste, `Sicap Liberte` après renommage : `[]`) ; remise → 4 verts sur la classe.
