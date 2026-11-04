---
id: TCK-1839
title: "Les préférences de recherche du profil ne remplacent que leurs trois critères, et gardent les autres critères de l'alerte"
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
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#23-savedsearch-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-185--formulaires-dédition-du-front-hors-du-bien-du-client-et-du-profil--champ-vidé-omis-du-corps"
tags: [front, profil, recherches-sauvegardées, alertes, pistes]
---

## Contexte

Réf : **P185.01** du fichier de pistes, `validé (délégué)`. La section « client » du profil édite
la recherche sauvegardée la plus récente de l'utilisateur, qui peut être une alerte enregistrée
depuis la page de recherche avec toutes ses clés de rôle `filtre`. Le formulaire rebâtissait
`criteria` de ses trois seules clés (`type`, `cities`, `price_max`) et l'envoyait en entier ; l'API
remplace la colonne. Un simple « Enregistrer » effaçait `contract_type`, `region`, `bedrooms`,
`price_min`, `furnished`… et l'alerte s'élargissait sans message.

## Décision du porteur (déléguée)

> validé (délégué) — fusionner : en édition, partir de `initial.criteria` et n'y remplacer que `type`, `cities` et `price_max`, une clé vidée par le formulaire étant retirée ; si la saisie des villes est inchangée et que l'alerte portait `city` sans `cities`, garder `city` tel quel et ne pas écrire `cities` ; si la saisie change, écrire `cities` et retirer `city` ; garde : alerte à critères de recherche, enregistrement sans changement → `criteria` inchangé, avec ablation sur la fusion ; reste : le vocabulaire de ville du résumé et du lien (P185.02)

## Objectif utilisateur

Un locataire qui règle ses préférences dans son profil ne perd pas, sans le savoir, les critères
de l'alerte qu'il avait enregistrée depuis la recherche.

## Contrat de données

Aucun changement d'API : `PATCH /api/saved-searches/{id}` reçoit toujours `criteria` en entier,
mais ce `criteria` part désormais des critères existants.

## Contraintes strictes (métier)

- Seules `type`, `cities` et `price_max` sont remplacées ; une clé vidée par le formulaire est
  retirée.
- Saisie des villes inchangée : `city` et `cities` restent tels quels. Saisie changée : `cities`
  est écrite (ou retirée si vide) et `city` est retirée.
- Création (aucune recherche existante) : inchangée.

## Delta à produire

- [x] `SearchPreferencesForm` : `buildCriteria` part de `initial.criteria` et compare la saisie des
  villes à celle du chargement.
- [x] Tests : quatre cas dans `SearchPreferencesForm.test.tsx` (sans changement, villes changées,
  champs vidés, villes vidées).

## Critères d'acceptation

- [x] AC1 — Alerte `{contract_type, city, region, bedrooms, price_min, price_max, type, furnished}`,
  « Enregistrer » sans rien toucher → `criteria` envoyé identique.
- [x] AC2 — Villes changées → `cities` écrite, `city` retirée, les autres critères gardés.
- [x] AC3 — Budget vidé et type décoché → `price_max` et `type` retirés, les autres gardés.

## Reste à faire

- le vocabulaire de ville du résumé et du lien (P185.02)

## Hors périmètre

- Le résumé et le lien « voir les résultats » d'une alerte à `cities` (P185.02, à valider).

## Notes d'implémentation

- Reproduction : les quatre tests neufs, rouges avant correctif (`criteria` réduit à
  `{type, cities, price_max}`, cinq critères perdus).
- Ablation : la fusion `{ ...existing }` ramenée à `{}` → les quatre tests rouges ; remise → 9/9
  verts.
- « Saisie inchangée » se juge sur la liste des villes analysée (virgules, espaces), pas sur la
  chaîne brute : `Dakar ` vaut `Dakar`.
