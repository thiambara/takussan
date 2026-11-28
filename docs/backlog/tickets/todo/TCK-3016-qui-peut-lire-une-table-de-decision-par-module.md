---
id: TCK-3016
title: "Qui peut lire : une table de décision par module de lecture, jouée sur ses deux faces"
status: todo
phase: P2
family: back
estimate: M
wave: 99
created: 2026-11-28
updated: 2026-11-28
depends_on: [TCK-3012]
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, tests, back, architecture, adr-0140]
---

## Objectif utilisateur

Une erreur de la règle de lecture commune à la liste et à la fiche est attrapée, et pas seulement leur désaccord.

## Contrat de données

ADR-0138. Les dix modules `app/Services/Lecture/*Lisibles.php` (et `app/Services/Visit/VisitesLisibles.php`) n'ont aucun test direct ; `tests/Feature/Lecture/ListeEtFicheParityTest.php` compare les deux faces, donc ne voit pas une erreur qu'elles partagent. Le verdict « l'agent parti ne lit plus » vit route par route (`Authorization/AgentCreateur*` 11 fichiers / 47 tests, `*ExistenceOracle`, `*Scope`, `*Isolation`).

## Contraintes strictes (métier)

- Additif d'abord : la table s'ajoute ; un test par route ne se retire que si la table rougit à sa place (ADR-0140 § 3), mesuré par ablation sur le module.
- Acteurs : ceux de `ListeEtFicheParityTest` ; lignes : de son agence, autre agence, parent en corbeille, auteur parti.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [ ] Table acteur × ligne → visible pour chaque module, jouée sur `restreindre` ET `peut`
- [ ] Retraits des tests par route que la table couvre, prouvés par ablation

## Critères d'acceptation

- [ ] AC1 — Une mutation commune aux deux faces d'un module (même branche retirée des deux) rougit la table, alors que la parité reste verte (constaté sur au moins deux modules).
- [ ] AC2 — Chaque test retiré est nommé dans les notes avec l'ablation qui le couvre.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
