---
titre: "Décider pg_stat_statements, statement_timeout et log_min_duration_statement (redémarre toute la base)"
type: decision
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

[Plan, F1, étape 8](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) : ces réglages se posent sur le service `serveur-postgres`, partagé par les deux
environnements, et exigent un redémarrage de la base. À trancher **avant** l'ouverture, quand une coupure ne coûte
encore rien.

## Comment vérifier

`show statement_timeout` et `select * from pg_extension` rendent ce qui a été décidé.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · reporté du plan : non décidé au 2026-11-01
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · même service PostgreSQL
