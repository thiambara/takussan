---
id: TCK-515
title: "Préproductions — Takussan et CheckPrint Plus servis par Dokploy, mesurés, restaurés à blanc"
status: todo
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: [TCK-510, TCK-513, TCK-514]
blocks: [TCK-516]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, dokploy, preproduction, adr-0028]
---

## Objectif utilisateur

Que `preview.takussan.com`, `preview.api.takussan.com` et leurs équivalents CheckPrint Plus servent
le dernier commit de `preview`, et qu'on sache le prouver, le restaurer et le mesurer.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Déroulé :
[plan, phase D](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#phase-d--raccorder-les-préproductions),
tâches D1 à D8.

## Contraintes strictes (métier)

- `TRUSTED_PROXIES` ne vaut jamais `*` : une adresse usurpée par `X-Forwarded-For` reste refusée.
- La restauration à blanc (diff vide des comptes par table) est la condition de la production.

## Delta à produire

- [ ] D1 à D6 — Takussan : services Dokploy, DNS, environnement GitHub, seed, mesures, restauration, budget
- [ ] D7 — CheckPrint Plus
- [ ] D8 — surveillance externe, secrets de l'ancienne chaîne retirés

## Critères d'acceptation

- [ ] AC1 — le job `deploy` d'`images.yml` rend `✓ … sert <commit>` pour l'API et le front
- [ ] AC2 — une IP autorisée passe la liste des webhooks ; `X-Forwarded-For: 203.0.113.7` reste en 403
- [ ] AC3 — restauration PostgreSQL à blanc : `diff` des comptes vide ; volume de médias identique (`sha256sum`)
- [ ] AC4 — budget mesuré : mémoire disponible ≥ 1 500 Mo, `st` < 10, disque < 75 %

## Hors périmètre

- Les fronts de production, toujours sur Vercel (TCK-517).

## Notes d'implémentation

_(à remplir par implementing-specs)_
