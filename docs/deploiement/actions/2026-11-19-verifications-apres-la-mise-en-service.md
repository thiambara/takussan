---
titre: "Vérifier après la mise en service : IP usurpée refusée, files, robots, IP visiteur, délais, versions"
type: verification
tickets: [TCK-517, TCK-720, TCK-926]
cles: []
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

Après le premier déploiement de production ([plan, F3, étapes 5 et 6](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md), [TCK-517](../../backlog/tickets/todo/TCK-517-production-auto-hebergee.md) AC1 à AC3) :

1. une adresse usurpée (`203.0.113.7`) reste refusée en 403 **à travers Cloudflare** ;
2. les workers consomment les quatre files (D-02 de l'ardoise visait l'ancien serveur ; à relire dans les conteneurs) ;
3. la commande de TCK-926 : `robots` et `noindex` justes en production ;
4. l'IP visiteur relevée depuis un **second réseau** (4G) avant de figer `VISITOR_IP_TRUSTED_HOPS` (TCK-720, AC7) ;
5. `which jpegoptim` dans le conteneur déployé (TCK-720, AC4) ;
6. les délais de Traefik et de Cloudflare écrits dans hebergement.md (TCK-720, P65.01) ;
7. un SMS de notification part sans `UrlGenerationException` (TCK-720, AC1) ;
8. la colonne « production » de `docs/infra/versions.json` mesurée (plan, F5, étape 4 ; ardoise D-09).

## Comment vérifier

Chaque point a sa ligne datée ici.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · reporté de TCK-720 et hebergement.md : IP visiteur relevée depuis un seul réseau (2026-10-18), `jpegoptim` vérifié seulement sur l'image locale, délais non relevés, AC1 de TCK-720 non coché ; l'IP usurpée a été refusée en DNS seul le 2026-09-14
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · aucune production à vérifier
