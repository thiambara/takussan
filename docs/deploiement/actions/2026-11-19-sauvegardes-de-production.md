---
titre: "Mettre en place et prouver les sauvegardes de production : dump nocturne, copie du seau privé, fraîcheur, restauration à blanc"
type: donnee
tickets: [TCK-517, TCK-2458]
cles: []
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

1. Sauvegarde Dokploy de `takussan_prod` à `0 2 * * *`, 30 exemplaires, et une manuelle relue dans R2
   ([plan, F1, étape 5](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md)).
2. Après la livraison de TCK-2458 : poser `/etc/default/sauvegarde-seau-prive-prod` (plan, F1, étape 6).
3. Étendre `PREFIXES` de `fraicheur-sauvegardes` à la production : **aucun ticket ni étape ne le prévoit** (TCK-2458,
   « hors périmètre »).
4. Restauration WAL-G à un instant choisi contre `takussan_prod`, avec `backup:verify-encryption` (plan, F3, étape 6).

## Comment vérifier

Un dump de production relu dans R2 ; `vps-sauvegardes/takussan-prod-private/jours/<date>/.complet` ; une alerte
de fraîcheur forcée nomme la production ; la restauration à blanc rend les mêmes comptes.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · reporté de hebergement.md (dump 14 exemplaires, copie du seau privé depuis le 2026-10-30) ; re-mesuré le 2026-11-19 : timers `sauvegarde-seau-prive`, `fraicheur-sauvegardes`, `wal-g-base` et `wal-g-veille` actifs, sauvegarde manuelle `2026-11-19T09-38-39-071Z.sql.gz` relue dans R2
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · TCK-2458 est `todo` ; aucune base de production à sauvegarder
