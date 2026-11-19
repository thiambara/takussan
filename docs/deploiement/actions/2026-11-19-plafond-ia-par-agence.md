---
titre: "Décider du plafond IA du jour par agence : clé AI_DAILY_BUDGET_PER_AGENCY_USD de l'API, ou la clé ai.daily_budget_per_agency_usd des Paramètres plateforme"
type: cle-env
tickets: [TCK-2979]
cles: [AI_DAILY_BUDGET_PER_AGENCY_USD]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-2979 (ADR-0131 § 8) rend réglable le plafond IA du jour de chaque agence, en dollars, pour tout usage IA de
l'agence (pas le seul copilote). **Sans valeur, il n'y a pas de plafond par agence** : c'est l'état d'un déploiement
qui ne fait rien. `takussan-api/docker/release.sh` relu : il ne touche à aucune clé IA, rien de ceci n'y a sa place.

Deux voies, au choix du porteur :

1. **La clé d'environnement**, onglet Environment du Compose de l'API (`takussan-api-preview`, puis
   `takussan-api-production` en phase F), à côté d'`AI_DAILY_BUDGET_USD` dans le gabarit
   `deploy/takussan/env.api.production.example` : `AI_DAILY_BUDGET_PER_AGENCY_USD=<montant>` (par exemple `1.00`),
   chaîne décimale, point comme séparateur. Vide, nulle ou illisible : aucun plafond. Puis redéployer.
2. **Les Paramètres plateforme** (`/super-admin/settings`, catégorie « IA »), sous second facteur et journalisé : la
   valeur posée là l'emporte sur la clé d'environnement, sans redéploiement. Vider le champ rend la main à la clé.

Laisser la clé vide est un choix valable : l'action se marque alors `fait` avec la mention « sans plafond ».

## Comment vérifier

- `/super-admin/settings`, catégorie « IA » : la valeur affichée est celle attendue (la clé d'environnement tant que
  rien n'est posé dans la console).
- Avec un plafond posé, une agence qui l'a atteint voit ses demandes IA refusées (`ai_calls.error_code` à `budget`),
  et une autre agence non.

## Historique
