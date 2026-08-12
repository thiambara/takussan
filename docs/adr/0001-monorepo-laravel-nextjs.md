# ADR-0001 — Monorepo Laravel 13 + Next.js 16, deux applications dans un dépôt

- **Statut** : Accepté
- **Date de la décision** : 2026-04 · **Rédigé rétroactivement** : 2026-08-12

## Contexte

Takussan est une plateforme de gestion immobilière pour le marché sénégalais : un site public de
recherche de biens, un espace applicatif pour les agences, les agents, les propriétaires et les
locataires, et une console d'administration de plateforme.

Deux surfaces très différentes : un back-office riche en règles métier (baux, paiements, échéanciers,
comptabilité, notifications multicanal) et un front public dont le référencement et le temps
d'affichage comptent.

## Décision

**Deux applications, un dépôt.**

- `takussan-api/` — Laravel 13 / PHP, l'API JSON et toute la logique métier.
- `takussan-web/` — Next.js 16 App Router / React 19 / TypeScript, le rendu public et applicatif.

Le front ne parle jamais à la base : il consomme l'API. La frontière est le contrat HTTP.

## Conséquences

**Ce que le monorepo rend possible.** Un changement qui traverse la frontière — un champ ajouté à
une ressource et consommé par un écran — tient dans un commit, se relit d'un coup, et se réverte
d'un coup. Les deux CI se déclenchent sur des chemins distincts (`takussan-api/**`,
`takussan-web/**`), donc le coût d'intégration reste séparé même si l'historique est commun.

**Ce qu'il ne donne pas gratuitement.** Rien ne garantit que les deux côtés restent d'accord. Deux
duplications assumées le montrent : la règle d'autorisation `agency.kind` est écrite **deux fois**,
en PHP (`app/Support/AgencyKindGuard.php`) et en TypeScript
(`src/lib/access/server-guards.ts`) — le docblock PHP l'avoue en se déclarant « backend twin » —, et
**aucun test ne vérifie qu'elles ne divergent pas** (ardoise D-23). Un dépôt commun rend la dérive
visible ; il ne l'empêche pas.

**Le déploiement, lui, n'est pas monolithique.** L'API part sur un VPS par un script bash zero
downtime ; le front est déployé par Vercel — **entièrement hors du dépôt**, sans workflow, sans
`vercel.json`, sans mapping branche→environnement écrit nulle part. Il est donc impossible de savoir,
depuis le code, quelle branche déploie quel environnement front (ardoise D-10). Le monorepo donne
l'illusion d'une unité que la chaîne de livraison ne tient pas.

## Application

- `takussan-api/` — 769 fichiers PHP, 62 033 lignes dans `app/`, 535 routes, 124 migrations.
- `takussan-web/` — 875 fichiers TS/TSX, 111 pages, 31 route handlers BFF.
- `.github/workflows/api-ci.yml` et `web-ci.yml` — filtrés par chemin.
- `docker-compose.yml` + `dev.sh` à la racine — un seul geste démarre les deux
  ([ADR-0011](0011-environnement-de-dev-conteneurise.md)).
