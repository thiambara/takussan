---
id: TCK-304
title: "Enveloppe de pagination dupliquée à la main sur 58 fichiers, avec des clés incohérentes"
status: todo
phase: P2
family: technique
estimate: L
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models: []
tags: [back, api, pagination, convention, refactor, dette]
---

## Objectif utilisateur

Qu'un client de l'API — le front, un test, une intégration — puisse lire la pagination de la même
façon sur toutes les listes, au lieu de découvrir quelles clés existent endpoint par endpoint.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16, dans `takussan-api/app/` :

| Clé | Occurrences |
|---|---|
| `total` | 78 |
| `current_page` | 66 |
| `last_page` | 50 |
| `per_page` | 45 |

**58 fichiers** construisent l'enveloppe à la main, et les comptes divergent : les endpoints qui
émettent `total` sans `per_page` (33 d'écart) ne servent pas le même contrat que les autres.
`links`, `from` et `to` apparaissent sporadiquement.

> Chiffres **re-mesurés le 2026-08-16**. L'ardoise D-31 annonçait 44 fichiers et des comptes plus
> bas au 2026-08-12 : la dette s'est **aggravée de 14 fichiers en quatre jours**. Elle grossit à la
> vitesse à laquelle on écrit des contrôleurs, ce qui la rend prioritaire malgré son absence de
> risque.

`takussan-api/CLAUDE.md` tranche déjà pour le code neuf : les 4 clés canoniques. L'existant reste à
converger. `BaseResource` et l'infrastructure de réponse existent depuis TCK-048 (`done`).

## Contraintes strictes (métier)

- **Le front consomme ces clés.** Toute clé retirée d'une réponse est une rupture de contrat
  côté `takussan-web/` : la convergence se fait par ajout et alignement, et chaque suppression est
  vérifiée contre les appelants avant d'être faite.
- Les conventions de lecture obligatoires du dépôt (`fields[table]`, `filter[…]`, `include=`,
  `per_page`) reposent sur `spatie/laravel-query-builder` : l'enveloppe canonique doit rester celle
  que produit son paginateur, pas une invention.
- **Ne pas convertir 58 fichiers en un seul commit.** Le diff serait illisible et la revue
  impossible. Découper par domaine, avec les tests de chaque domaine verts à chaque étape.
- Convergence sans garde = dette qui revient. La sortie inclut un mécanisme qui empêche le 59ᵉ
  fichier.

## Delta à produire

- [ ] Écrire la forme canonique de l'enveloppe, une fois, à l'endroit qui fait foi
- [ ] Inventorier les 58 fichiers et les grouper par domaine
- [ ] Converger domaine par domaine, tests verts à chaque étape
- [ ] Vérifier chaque changement de forme contre les appelants front avant de le faire
- [ ] Garde CI : une enveloppe de pagination construite à la main hors du point canonique fait
      échouer le build
- [ ] Prouver la garde **par mutation** : réintroduire une enveloppe manuelle, vérifier le rouge

## Critères d'acceptation

- [ ] AC1 — toutes les listes paginées de l'API émettent les 4 clés canoniques, et les mêmes
- [ ] AC2 — `grep` des clés dans `app/` ne trouve plus de construction manuelle hors du point
      canonique
- [ ] AC3 — la suite backend reste verte, et aucune assertion de test n'a été assouplie pour y
      arriver
- [ ] AC4 — la suite frontend reste verte ; les appels affectés ont été vérifiés
- [ ] AC5 — réintroduire une enveloppe manuelle fait échouer la CI

## Hors périmètre

- L'adoption de `BaseResource` par les 37 ressources qui ne l'étendent pas — TCK-308.
- Les FormRequest — TCK-305.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
