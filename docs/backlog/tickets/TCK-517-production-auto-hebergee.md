---
id: TCK-517
title: "Production — les deux projets passent en auto-hébergement, puis Vercel est retiré"
status: todo
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: [TCK-516]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, production, dokploy, vercel, adr-0028, attendre-go]
---

## Objectif utilisateur

Que `www.takussan.com` appelle une API servie, et que les deux productions tournent là où tournent
leurs préproductions, prouvées de la même façon.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Déroulé :
[plan, phase F](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#phase-f--la-production),
tâches F1 à F5. **Ne s'ouvre que sur la décision du porteur** — pas avant trois mois selon lui au
2026-09-13 ; ses prémisses se re-mesurent en ouvrant F1.

## Contraintes strictes (métier)

- `LICENSE_DESKTOP_SECRET` de CheckPrint Plus garde la valeur de l'export : il est partagé avec le
  binaire de bureau déjà distribué.
- La suppression des projets Vercel, irréversible, se fait sur confirmation du porteur, au moins
  7 jours après la bascule.

## Delta à produire

- [ ] F1 — re-mesure, bases, clé Meilisearch et sauvegardes de production
- [ ] F2 à F3 — Takussan : `images.yml` sur `master`, environnement `prod` avec réviseur, bascule DNS
- [ ] F4 — CheckPrint Plus
- [ ] F5 — retrait de Vercel, des relevés et de la garde qui le mesuraient

## Critères d'acceptation

- [ ] AC1 — `https://api.takussan.com/up` rend 200 et le commit dans `X-Build-Sha`, à travers Cloudflare
- [ ] AC2 — `https://www.takussan.com/` sert le commit, sans `x-vercel-id`
- [ ] AC3 — une adresse usurpée reste refusée à travers Cloudflare
- [ ] AC4 — TCK-332 passe `done`

## Hors périmètre

- Toute évolution applicative.

## Notes d'implémentation

_(à remplir par implementing-specs)_
