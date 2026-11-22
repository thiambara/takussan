---
titre: "Durcir le réseau Dokploy et les accès : réseau de données, alias Meilisearch, REVOKE CONNECT, relevé Traefik"
type: externe
tickets: [TCK-517]
cles: []
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

Décisions du porteur du 2026-10-20, consignées dans [TCK-517](../../backlog/tickets/todo/TCK-517-production-auto-hebergee.md) mais absentes des étapes du plan :

1. P74.04 d'abord : relever ce que chaque service de `dokploy-network` répond à un conteneur sans secret, l'écrire
   dans hebergement.md ; puis un réseau de données dédié, et les piles hors de `dokploy-network` sauf `api` ;
2. P74.01 : alias `takussan-meilisearch` visé par `MEILISEARCH_HOST`, garde réseau étendue ;
3. P74.02 : `/keys`, `/dumps` et `/snapshots` refusés avec la clé de chaque environnement ;
4. P74.03 : un réseau dédié entre Traefik et le front ;
5. P74.05 : `REVOKE CONNECT ON DATABASE postgres FROM PUBLIC` ;
6. P73.03 : relever ce que Traefik journalise de la chaîne de requête.

## Comment vérifier

Chaque point a sa ligne datée, avec la commande qui le prouve.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · reporté de hebergement.md : seul `/keys` en 403 est relevé (2026-11-04) ; aucun des autres points
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · idem, à faire avant l'ouverture
- 2026-11-22 · preview · a-faire · Claude (session, pour le porteur) · **1, le relevé (P74.04) fait** : écrit dans hebergement.md, ligne « Ce que `dokploy-network` répond sans secret ». **3 (P74.02) fait** : depuis le conteneur `api`, avec la clé de la préproduction, `GET /keys`, `POST /dumps`, `POST /snapshots` et `GET /indexes/prod_properties` → `403`, `GET /indexes` → `200`. **5 (P74.05) fait** sur `serveur-postgres`, partagé avec la future production : `REVOKE CONNECT ON DATABASE postgres FROM PUBLIC`, ACL relue `=T/pgadmin pgadmin=CTc/pgadmin` ; par PDO depuis `api`, `takussan_preview` → base `postgres` : connecté avant, `FATAL: permission denied for database` après, sa propre base connectée, `/up` `200`. **6 (P73.03) relevé** : hebergement.md, ligne « Journal d'accès de Traefik ». Restent, par décision ou chantier : le réseau de données et la sortie des piles de `dokploy-network` (1, seconde moitié), l'alias `takussan-meilisearch` (2), le réseau Traefik–front (4), et ce qu'on retire du journal (6)
