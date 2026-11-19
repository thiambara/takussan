---
titre: "Créer l'application du front de production, sans authentification basique, avec ses URL posées avant le premier déploiement"
type: cle-env
tickets: [TCK-517]
cles: [API_URL, SITE_URL, MEDIA_URL, API_INTERNAL_URL, VISITOR_IP_TRUSTED_HOPS]
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

[Plan, F3, étape 1](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) et hebergement.md : application `takussan-web-production`, **sans** authentification
basique ; `API_URL`, `SITE_URL` et `MEDIA_URL` posées avant le premier déploiement (elles sont lues au build) ;
`API_INTERNAL_URL` sondée depuis le conteneur ; `VISITOR_IP_TRUSTED_HOPS=2` ; `PUBLIC_CACHE_REVALIDATE_SECRET` et
`TEMPS_REEL_*` (action du temps réel).

## Comment vérifier

`https://www.takussan.com/` sert le commit ; la page ne contient aucune URL de préproduction.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : application `takussan-web-preview` déployée, les 8 clés du gabarit posées et non vides
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : aucune application dans l'environnement `production`
