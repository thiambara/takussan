---
titre: "Jouer une fois la réparation des titulaires réassignés (properties:repair-reassigned-owners), --dry-run d'abord"
type: donnee
tickets: [TCK-603, TCK-616]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

TCK-603 a livré `properties:repair-reassigned-owners` pour réparer les biens dont le titulaire a été
réécrit par l'ancien geste de réassignation ; TCK-616 a rendu sa sortie lisible sans `activity_log`
(chaque ligne `review`/`restore` porte `chain=X>B5>Y`, les baux réparés sont listés par
`leases_fixed_ids=`). La commande ne se joue pas au déploiement : une personne la lance une fois par
environnement.

1. `php artisan properties:repair-reassigned-owners --dry-run` dans le conteneur de l'API : relire
   chaque ligne `review` (la chaîne des titulaires dit si la restauration est juste).
2. Si rien ne surprend : relancer sans `--dry-run`, et garder la sortie avec le relevé.

## Comment vérifier

Un second passage `--dry-run` ne propose plus aucune ligne `restore`.

## Historique
