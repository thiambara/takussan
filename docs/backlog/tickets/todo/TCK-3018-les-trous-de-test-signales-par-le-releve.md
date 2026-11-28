---
id: TCK-3018
title: "Les trous de test signalés par le relevé : vérifier chacun, combler ceux qui existent"
status: todo
phase: P2
family: back
estimate: S
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

Ce que la suite ne garde pas encore et devrait garder est éprouvé.

## Contrat de données

Signaux NON vérifiés du relevé du 2026-11-28 : défaut XOF de `agencies.currency` masqué par la factory ; pas de budget de requêtes N contre 2N sur les listes de factures et d'états des lieux ; parité entre le geste `pay` de la facture et la route de paiement en ligne ; course « annuler » d'une visite absente de `GestesDeLaVisiteTest` (peut-être couverte depuis TCK-3005 b) ; plafond par agence des exports d'un bailleur ; alertes Discord et Slack (3 tests partagés), `AlertsOnFirstFailure`, `BoundedResendClient`. NB : les « fichiers jamais couverts » de `tests/impact-map.json` sont un artefact (carte du 2026-11-19) — vérifiés : chacun a 1 à 5 fichiers de test.

## Contraintes strictes (métier)

- Re-mesurer chaque signal avant d'écrire un test : un signal faux se note et ne produit rien.
- Un test neuf va dans la classe du module (ADR-0140 § 1), rouge d'abord sur une mutation.
- **Règle de retrait (ADR-0140 § 3)** : par grappe, relire les deux côtés, puis muter en production la règle que le test retiré garde : un test qui reste doit rougir, sinon le test se déplace au lieu de se supprimer. Une ligne du relevé dont la raison dit « doute » ne se retire pas.
- Les règles sacrées (argent, isolation d'agence et lecture, empreintes et HMAC du Radar, idempotence, autorisation par capacités) ne perdent un test que si un autre rougit à sa place.
- Jamais de suite entière en local : les classes touchées par le créneau ; la CI juge la suite et le cliquet de couverture (`Total:` du job `couverture`).

## Delta à produire

- [ ] Pour chaque signal : verdict mesuré (réel / déjà couvert, par quel test)
- [ ] Les tests des trous réels, dans la classe du module

## Critères d'acceptation

- [ ] AC1 — Chaque signal a un verdict mesuré dans les notes.
- [ ] AC2 — Chaque test ajouté a rougi sur une mutation de la règle qu'il garde.

## Hors périmètre

- Le front (`takussan-web`) ; renommer les 1 391 méthodes `ac1_/m4_…` (aucun gain de détection ni de temps).
