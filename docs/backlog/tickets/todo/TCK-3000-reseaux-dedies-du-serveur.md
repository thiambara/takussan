---
id: TCK-3000
title: "Réseaux dédiés du serveur : données, Traefik–front, alias takussan-meilisearch — avant l'ouverture"
status: todo
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-11-22
updated: 2026-11-22
depends_on: []
blocks: [TCK-517]
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [infra, dokploy, reseau, securite, production, decision-2026-11-22]
---

## Objectif utilisateur

Qu'un conteneur compromis sur le serveur ne voie plus que les services dont il a besoin, avant que la production n'y
tourne à côté de la préproduction.

## Contrat de données

Aucun endpoint. Décisions du porteur du 2026-10-20 consignées dans TCK-517 (P74.01, P74.03, seconde moitié de P74.04),
**confirmées le 2026-11-22 : un lot à part, fait avant l'ouverture, jamais improvisé sur la préproduction servie.**
Point de départ : le relevé « Ce que `dokploy-network` répond sans secret » de `docs/infra/hebergement.md` (2026-11-22) —
tous les services se voient sur `dokploy-network` (PostgreSQL, Meilisearch, Dokploy, Traefik, API, Reverb, front).
L'action [durcir le réseau et les accès](../../../deploiement/actions/2026-11-19-durcir-le-reseau-et-les-acces-du-serveur.md)
porte ce qui reste.

## Contraintes strictes (métier)

- **ADR d'abord** : la topologie des réseaux est une décision structurelle (règle du dépôt) ; l'ADR dit quels réseaux,
  qui s'y joint, et ce qui reste sur `dokploy-network` (l'`api`, que Traefik route, et rien d'autre).
- Chaque bascule se fait **une pile à la fois**, avec la commande qui prouve l'avant et l'après, et le retour arrière écrit
  avant le geste. La préproduction est le seul environnement servi : une coupure se mesure, elle ne se suppose pas.
- `TRUSTED_PROXIES` et `VISITOR_IP_TRUSTED_HOPS` dépendent du sous-réseau par lequel Traefik joint le front et l'API : les
  relire après le réseau Traefik–front (P74.03), et reprouver l'IP visiteur (relevé « IP du visiteur » de hebergement.md).
- `MEILISEARCH_HOST` vise l'alias `takussan-meilisearch` (P74.01) dans **les deux** gabarits d'environnement, et la garde
  réseau (`scripts/check-reseau-par-environnement.mjs`, `scripts/check-env-production.mjs`) refuse l'ancien nom.

## Delta à produire

- [ ] ADR « Les réseaux du serveur » (numéro suivant de `docs/adr/`).
- [ ] Réseau de données (PostgreSQL, Meilisearch) ; piles `donnees` et `postgres` jointes à lui, retirées de `dokploy-network`.
- [ ] Alias `takussan-meilisearch` dans `deploy/server/compose.data.yml` ; `MEILISEARCH_HOST` des gabarits
  `deploy/takussan/env.*.example` et de Dokploy (préproduction) ; gardes étendues.
- [ ] Réseau dédié Traefik ↔ front (P74.03) ; le front quitte `dokploy-network` s'il n'en a plus besoin.
- [ ] Relevé P74.04 refait après bascule, écrit dans hebergement.md ; historique daté dans l'action « durcir ».

## Critères d'acceptation

- [ ] AC1 — depuis un conteneur jetable sur `dokploy-network`, PostgreSQL et Meilisearch sont **injoignables** (délai ou
  refus de connexion), alors que l'`api` de la préproduction les joint (`/up` `200`, recherche `200`).
- [ ] AC2 — `MEILISEARCH_HOST` rend `http://takussan-meilisearch:7700` dans le conteneur `api` ; la garde rougit si un
  gabarit vise encore `meilisearch:7700` (vérifié par ablation).
- [ ] AC3 — le front est servi par Traefik sur son réseau dédié (`X-Build-Sha` lu), et l'IP visiteur relevée après bascule
  est celle du poste.
- [ ] AC4 — `bootstrap.sh` / le runbook « Reconstruire le serveur » recréent ces réseaux.

## Hors périmètre

- Le journal d'accès de Traefik (TCK-3001).
- `REVOKE CONNECT` et les refus Meilisearch (P74.02, P74.05) : faits le 2026-11-22.
- Le pare-feu de l'hôte.

## Notes d'implémentation

_(à remplir par implementing-specs)_
