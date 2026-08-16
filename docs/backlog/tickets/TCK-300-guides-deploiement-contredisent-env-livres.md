---
id: TCK-300
title: "Les guides de déploiement prescrivent des drivers que les `.env` livrés contredisent"
status: todo
phase: P2
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: [TCK-288]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, documentation, environnement, deploiement, dette]
---

## Objectif utilisateur

Qu'un opérateur qui suit la checklist de production obtienne l'environnement que la production
exécute réellement — au lieu d'appliquer des consignes qu'aucun fichier livré ne respecte.

## Contrat de données

Aucune donnée applicative. Écarts relevés le 2026-08-12 (ardoise D-11), **à re-mesurer fichier par
fichier avant correction** :

| Source | Prescrit | `.env.preview` / `.env.prod` livrent |
|---|---|---|
| `docs/infra/deploy-preview.html` | `CACHE_STORE=database` | `redis` |
| `docs/infra/deploy-preview.html` | `SESSION_DRIVER=database` | `redis` |
| `docs/infra/deploy-preview.html` | `MAIL_MAILER=log` | `resend` |
| `docs/configuration.md` §5.7 | `QUEUE_CONNECTION=redis` | `database` |
| `docs/configuration.md` | `SESSION_SECURE_COOKIE=true`, `SESSION_SAME_SITE=lax` | **absents des deux** |

La checklist de production n'a jamais été confrontée aux fichiers qu'elle prétend décrire.

## Contraintes strictes (métier)

- **Le sens de la correction n'est pas acquis.** Pour chaque ligne, deux sorties : le guide a
  raison et les `.env` livrés sont en défaut, ou l'inverse. `SESSION_SECURE_COOKIE=true` est une
  consigne de sécurité — son absence des deux `.env` est probablement un défaut à corriger, pas une
  consigne à retirer. Trancher **ligne par ligne**, jamais en bloc.
- `docs/configuration.md` a déjà été corrigé le 2026-08-16 sur sa contradiction Meilisearch : la
  re-mesure doit partir de l'état courant du fichier, pas de la citation de l'ardoise.
- Ce ticket **ne modifie pas la production**. Il fait converger les guides et les `.env` versionnés.
- La convergence sans garde retombe en dette. La sortie doit rendre l'écart détectable.

## Delta à produire

- [ ] Re-mesurer chaque ligne du tableau contre l'état courant de `docs/infra/deploy-preview.html`,
      `docs/configuration.md`, `.env.preview` et `.env.prod`
- [ ] Trancher ligne par ligne, et écrire la raison de chaque arbitrage
- [ ] Corriger le côté fautif (guide ou `.env`, selon l'arbitrage)
- [ ] Garde : étendre `scripts/check-env-parity.mjs` — ou créer une garde dédiée — pour confronter
      les valeurs prescrites par les guides aux `.env` livrés
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — aucune clé prescrite par un guide de déploiement ne diverge du `.env` livré
      correspondant, sauf divergence documentée avec sa raison
- [ ] AC2 — `SESSION_SECURE_COOKIE` et `SESSION_SAME_SITE` sont présentes dans `.env.preview` et
      `.env.prod`, ou leur absence est justifiée par écrit
- [ ] AC3 — réintroduire un écart d'une seule clé fait échouer la CI
- [ ] AC4 — chaque arbitrage du tableau porte sa raison en une phrase

## Hors périmètre

- Les valeurs de `.env.example`, qui décrit un environnement fictif par construction (D-12) et sert
  d'environnement de test à la CI (D-54).
- L'application des corrections sur le serveur — TCK-288.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
