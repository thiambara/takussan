---
id: TCK-489
title: "La date de disponibilité s'écrit, se filtre, et ne s'affiche nulle part"
status: done
phase: P1
family: front
estimate: S
wave: 55
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-464]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [front, properties, public, ux, i18n, bug]
---

## Objectif utilisateur

Un locataire qui cherche un logement pour une date donnée voit, sur la fiche du bien, à partir de
quand il peut y entrer — sans avoir à écrire au bailleur pour le demander.

## Contrat de données

**Le champ est disponible en lecture depuis TCK-464, et il ne l'était pas avant.**
`PropertyResource:81` l'émet désormais (`whenHas('available_from', …)` → `calendarDate()`) ; il
s'écrivait depuis toujours (`StorePropertyRequest`, `UpdatePropertyRequest`) et ne se relisait
jamais. **Rien à créer côté API.**

**Ce que chaque appelant reçoit, mesuré le 2026-08-30 :**

| Appelant | `available_from` dans la réponse ? |
|---|---|
| Fiche publique (`PublicPropertyController::show()`) | **oui** — la route ne pose aucun `fields[properties]`, toutes les colonnes sont émises |
| Fiche app (`DASHBOARD_PROPERTY_DETAIL_FIELDS`) | **oui** — `properties-server.ts:166`, demandé depuis TCK-464 |
| Comparateur (`COMPARE_FIELDS`) | **non**, et c'est délibéré — d'où l'optionalité du type (`types/property.ts:156`) |

**L'asymétrie que ce ticket ferme.** Le champ est **filtrable** publiquement — `FilterSidebar.tsx:580`
propose « disponible à partir de », et `Property::toSearchableArray():372` le porte dans le document
Meilisearch (TCK-128, `done`). On peut donc filtrer sur une date qu'aucune fiche ne montre.
`docs/features.md` la liste en P1 côté filtres et décrit la fiche publique ; la donnée est spécifiée
dans `models-spec.md#3-property`.

**La date n'a de sens qu'en location.** `field-matrix.ts:90` déclare `available_from` pertinent
pour le seul contrat `rent` — c'est la même règle qui gouverne déjà sa saisie, elle gouverne son
affichage.

⚠ **La clé peut être ABSENTE du JSON, pas nulle** (`whenHas`) : le type la déclare optionnelle.
Un composant qui la lit doit traiter les trois cas — absente, nulle, datée — sans les confondre.

## Direction UX / Artistique

**Une information de décision, pas une ligne de tableau de plus.** « Disponible à partir du 15
septembre » répond à la question qu'un locataire se pose avant le prix : *est-ce que je peux y
entrer quand j'en ai besoin ?* Elle mérite d'être lue, pas cherchée.

**Une date passée n'est pas une attente.** Un bien dont la date de disponibilité est derrière nous
est disponible — le dire ainsi plutôt que d'afficher une date morte qui fait douter de la fraîcheur
de l'annonce.

**Sur la fiche app, la même information sert un autre geste** : le bailleur vérifie ce qu'il a
annoncé. Elle s'y lit au même endroit que les autres caractéristiques du bien, sans traitement
particulier.

**Le format est celui de la langue du lecteur**, jamais une date brute ISO.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **Rien ne s'affiche sur une vente.** La condition est lue dans `field-matrix.ts`, pas réécrite.
2. **Une clé absente n'est pas une date nulle**, et aucune des deux ne rend une ligne vide ni le
   littéral « null » — le défaut a déjà été payé une fois sur cette page (`page.tsx`, `<meta
   description>`, TCK-292).
3. **Aucun appel réseau supplémentaire** : les deux fiches reçoivent déjà le champ. Le comparateur
   ne le demande pas et ce ticket ne l'y ajoute pas.
4. **Les libellés appartiennent au front** (principe non négociable n° 5) : `fr`, `en`, `wo`.
5. **Toute lecture d'API passe par des sparse fieldsets** là où la route les honore
   (`docs/spatie-query-builder.md`) : aucune liste de champs n'est élargie « au cas où ».

## Delta à produire

**Frontend — intentionnel**

- [x] La fiche publique d'un bien en location affiche sa date de disponibilité
- [x] La fiche app (aperçu) l'affiche également, pour le bailleur qui vérifie ce qu'il a annoncé
- [x] Le cas « date passée » est distingué du cas « date à venir », et l'absence de date ne rend
      rien
- [x] Libellés `fr` / `en` / `wo`
- [x] Tests : présence en location, absence en vente, date passée, clé absente et clé nulle

## Critères d'acceptation

- [x] **AC1** — Un bien en location dont la date de disponibilité est renseignée l'affiche sur sa
      fiche publique, formatée dans la langue de la page. *Ce test échoue sur le code actuel* :
      aucun composant ne lit ce champ.
- [x] **AC2** — Le même bien basculé en vente ne l'affiche plus, sur les deux fiches.
- [x] **AC3** — Une date de disponibilité déjà passée ne se présente pas comme une attente.
- [x] **AC4** — Une charge utile où la clé est **absente**, et une autre où elle vaut `null`, ne
      rendent ni ligne vide, ni tiret orphelin, ni le littéral « null ».
- [x] **AC5** — La fiche app affiche la date au même titre que les autres caractéristiques.
- [x] **AC6** — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts ; aucune chaîne affichée en
      dur hors dictionnaire.

## Hors périmètre

- Le filtre de recherche « disponible à partir de » : il existe et fonctionne (TCK-128).
- Le comparateur : `COMPARE_FIELDS` ne demande pas ce champ, et l'y ajouter est un autre arbitrage
  (TCK-491 porte la question du comparateur).
- Toute notion de calendrier de disponibilité ou de blocage de dates — c'est la réservation courte
  durée, hors de ce champ.
- Le JSON-LD de la fiche publique : y déclarer une disponibilité est une décision de balisage
  distincte, non instruite ici.

## Notes d'implémentation

**Les quatre cas vivent dans `src/lib/property-availability.ts`, pas dans les composants.** Les deux
fiches ont besoin de la même réponse et aucune n'est le bon endroit pour la porter : la fiche
publique est un composant serveur, l'aperçu un composant client.

**Le jour courant se lit dans l'ISO UTC, délibérément.** `Africa/Dakar` est à UTC+0 toute l'année
(`TIMEZONE`), donc `toISOString().slice(0, 10)` EST le jour local — et cette forme ne fige aucune
locale, ce que `scripts/check-locale-figee.mjs` refuse. La comparaison reste littérale, comme
partout ailleurs sur les dates calendaires (ADR-0018).

**`useFormatteurs()` n'est pas employé sur la fiche publique** : le module porte `'use client'`, et
`PropertyCharacteristics` est rendu côté serveur. C'est le second chemin documenté par le hook
lui-même — `useLocale()` de next-intl plus `formatDate` de `@/lib/format`.

**Aucun élargissement de liste de champs** : les deux fiches recevaient déjà le champ. Vérifié pour
la fiche publique — `PublicPropertyController::show()` n'honore aucun `fields[properties]` et émet
les 47 clés (`public-property.ts`).
