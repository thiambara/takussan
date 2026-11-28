---
id: TCK-2999
title: "Activer « Always Use HTTPS » sur la zone Cloudflare takussan.com"
status: todo
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-11-22
updated: 2026-11-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [infra, cloudflare, tls, production, decision-2026-11-22]
---

## Objectif utilisateur

Qu'un visiteur qui tape une adresse en `http://` arrive en HTTPS même si Traefik ne le redirige plus, sur la
préproduction aujourd'hui comme sur la production demain.

## Contrat de données

Aucun endpoint. Le réglage `always_use_https` de la zone `takussan.com`, relu `off` le 2026-11-22 (action
[TLS et surveillance des certificats](../../../deploiement/actions/2026-11-19-tls-et-surveillance-des-certificats.md), étape 3).
**Décidé par le porteur le 2026-11-22 : l'activer.**

## Contraintes strictes (métier)

- La zone est partagée par la préproduction et la future production : un seul geste les couvre toutes les deux.
- Le réglage n'agit que sur les noms **proxifiés** par Cloudflare ; pour les noms en DNS seul, la redirection reste celle
  de Traefik. Le relevé doit dire lesquels sont dans chaque cas.
- Le renouvellement Let's Encrypt de Traefik ne doit pas casser : relire le défi utilisé (HTTP-01 ou TLS-ALPN) avant le
  geste, et `deploy/server/certificats.sh` après.

## Delta à produire

- [ ] Relever, avant : `always_use_https`, la liste des noms proxifiés et en DNS seul, le défi ACME de `traefik.yml`.
- [ ] `PATCH /zones/<id>/settings/always_use_https` → `on`, puis relire.
- [ ] Historique daté dans l'action TLS (étape 3) ; l'action passe `fait` en `preview` si les étapes 1 et 2 le sont déjà
  (c'est le cas au 2026-11-22), et la ligne `production` le dit aussi (même zone).
- [ ] Ligne « Zones Cloudflare » de `docs/infra/hebergement.md` mise à jour.

## Critères d'acceptation

- [ ] AC1 — `GET /zones/<id>/settings/always_use_https` rend `on`.
- [ ] AC2 — `curl -sI http://preview.takussan.com/` (nom proxifié) rend une redirection `301`/`308` vers `https://`, et
  le `Server` de la réponse désigne Cloudflare et non Traefik.
- [ ] AC3 — `deploy/server/certificats.sh` reste vert après le geste.
- [ ] AC4 — l'action TLS porte la ligne datée avec ces trois relevés.

## Hors périmètre

- HSTS (`strict_transport_security`) : une décision à part, irréversible côté navigateur pendant sa durée.
- Le passage des noms en DNS seul vers le proxy.

## Notes d'implémentation

_(à remplir par implementing-specs)_
