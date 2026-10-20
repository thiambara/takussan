---
id: TCK-1052
title: "Un ancien nom de quartier fusionné désigne le quartier cible, en recherche comme en alerte"
status: done
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
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-recherche-sauvegardée-sur-un-quartier-fusionné-ne-trouve-plus-rien-alors-que-le-référentiel-garde-le-lien-vers-la-cible"
tags: [back, recherche, alertes, referentiel, pistes]
---

## Objectif utilisateur

Une recherche sauvegardée, ou un lien partagé, sur le nom d'un quartier que la console a fusionné
dans un autre continue de trouver les biens de ce lieu, au lieu de se taire sans erreur.

## Contexte

Réf : **P67.01** du fichier de pistes, `validé` (critère V7 accordé).

La fusion (`GeoNeighborhoodModeration::fusionner()`) garde la source avec `merged_into_id` et
réécrit les adresses vers la cible. `QuartierDuFiltre::idsDuReferentiel()` rendait l'identifiant
de la source, qu'aucune adresse ne porte plus. Mesuré avant correctif (test de garde ci-dessous) :
bien rattaché à « Liberte Quatre », fusion dans « Liberté 4 », puis `location=Liberte Quatre` → 0
dans la liste publique.

## Décision du porteur

> un ancien nom fusionné désigne le quartier cible : suivre la fusion dans `idsDuReferentiel()` (`merged_into_id ?? id`) ; test : alerte et `/public/properties/search` sur l'ancien nom → 1 (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- La carte (`FiltresDeLaCarte`) lit le même `idsDuReferentiel()` : elle suit la fusion du même
  geste, et le test l'éprouve avec la liste, comme les autres cas de TCK-663.

## Delta à produire

- [x] `QuartierDuFiltre::idsDuReferentiel()` rend `merged_into_id ?? id`, sans doublon.
- [x] Test `QuartierDuPanneauTest::test_un_ancien_nom_fusionne_designe_le_quartier_cible`.

## Critères d'acceptation

- [x] AC1 — après fusion, `/api/public/properties/search` et `/api/public/properties/map` sur
  l'ancien nom rendent le bien.
- [x] AC2 — `PropertySearchService::alertMatches()` sur l'ancien nom rend `total` 1.
- [x] AC3 — le nom de la cible rend toujours le bien.

## Hors périmètre

- Le renommage (P67.02), les équipements (P67.03) et le rapprochement CRM (P67.04, P67.05).

## Notes d'implémentation

- Ablation : `(int) $q->id` remis → 1 rouge (la liste, ancien nom, après fusion : `[]`) ; remis →
  3 verts.
