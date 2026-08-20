---
id: TCK-334
title: "Deux `--parallel` simultanés saturent la file de tâches Meilisearch — la CINQUIÈME ressource partagée par machine"
status: todo
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-20
updated: 2026-08-20
depends_on: [TCK-322]
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, determinisme, meilisearch, paratest, dette]
---

## Objectif utilisateur

Que deux agents puissent lancer `php artisan test --parallel` sur la suite entière en même temps sur
la même machine, sans se casser mutuellement — ou, à défaut, que l'impossibilité soit **une décision
mesurée et écrite**, et non une restriction qu'on reconduit faute d'avoir cherché.

## Contexte — la mesure qui ouvre ce ticket

TCK-321 a validé `--parallel`. TCK-322 a trouvé et corrigé la **quatrième** ressource partagée par
machine (les vues compilées de Laravel, créées dans le processus parent, hors de portée du jeton
d'isolation posé dans `tests/bootstrap.php`). Il restait à jouer la paire sur la suite ENTIÈRE.

**Jouée le 2026-08-20, machine au repos, 8 cœurs :**

```
départ  load 3,39 sur 8 cœurs
A = 2   Tests: 2589, Assertions: 8117, Errors: 38, Skipped: 2
B = 2   Tests: 2589, Assertions: 8116, Errors: 37, Skipped: 2
arrivée load 114,89

contrôle, même arbre, même commande, machine au repos :
départ  load 3,70
UN SEUL Tests: 2589, Assertions: 8210, Skipped: 2   ← 0 ÉCHEC, 108 s
        real 108,09  user 448,45  sys 44,35
```

Les **75 erreurs sont toutes** des `Tests\Support\MeilisearchNotIdleException` :

> Meilisearch n'a pas vidé sa file de tâches : 5 tâche(s) encore en attente après 10.1 s
> (plafond 10.0 s) — `testing_2acdf5665a_8_agencies`: 4, `testing_2acdf5665a_8_users`: 1.
> Le test aurait lu un index à moitié construit.

## Ce qui est DÉJÀ écarté par la mesure — ne pas le re-chercher

- **Ce n'est pas la collision de démarrage de TCK-322.** Les deux exécutions ont démarré et joué
  leurs 2589 tests chacune ; `mkdir(): File exists` ne s'est pas produit.
- **Ce n'est pas une collision de noms d'index.** Les jetons composés de TCK-321 fonctionnent :
  `testing_2acdf5665a_8_…` contre `testing_2ace1470ae_8_…`, distincts des deux côtés.
- **Ce n'est pas l'arbre.** Le contrôle à une seule exécution, sur le même arbre et au même repos,
  rend 0 échec.
- **Ce n'est pas « la machine était chargée ».** Les deux mesures PARTENT du repos (3,39 et 3,70).
  La charge de 114 est le *résultat* de la simultanéité, pas sa cause — et la file de tâches d'un
  serveur d'indexation n'est pas une ressource CPU.

## Le fait nouveau

**Le serveur Meilisearch est une ressource partagée PAR MACHINE, et sa file de tâches est GLOBALE.**
L'isolation du dépôt porte sur les *noms d'index* ; elle ne peut rien contre le débit d'indexation
d'une instance unique. Deux suites parallèles — soit 16 processus PHP sur 8 cœurs — lui adressent
deux fois le travail d'indexation d'une suite complète, et la barrière de 10 s expire.

## Ce que cette mesure valide au passage, et qu'il faut dire

**Le correctif D-44 a fonctionné exactement comme il devait.** L'ancienne version de
`waitForMeilisearch()` **abandonnait en silence** au bout de 10 s : le test aurait enchaîné sur un
index à moitié construit et rougi sur une assertion métier juste, en accusant le code applicatif.
Ici, la barrière lève, nomme la file, compte les tâches en attente index par index, et écrit
elle-même la cause probable. *Le diagnostic était dans le message d'erreur.*

## Pistes — à mesurer, pas à choisir sur le papier

1. **Une instance Meilisearch par exécution** (port dérivé du jeton d'isolation, comme les index).
   Coûte de la mémoire et complique `docker-compose.yml` et `dev.sh doctor`.
2. **Relever le plafond de la barrière** sous simultanéité détectée. ⚠ Attention : c'est un plafond
   qui a déjà masqué un défaut pendant des semaines (D-44) — le relever sans le mesurer reviendrait
   à refaire la faute d'origine, un cran plus haut.
3. **Sérialiser l'indexation** entre exécutions par un verrou de machine — simple, mais rend la
   promesse de `--parallel` partiellement fausse.
4. **Assumer la restriction** : un seul `--parallel` en suite entière à la fois, écrit et motivé.
   C'est l'état actuel ; ce ticket existe pour qu'il soit un *choix*, pas un défaut de connaissance.

## Delta à produire

- [ ] Trancher entre les quatre pistes, **par la mesure**, et écrire la décision.
- [ ] Si une piste est retenue : la prouver par la paire sur la suite ENTIÈRE, 0 échec des deux
      côtés, `uptime` et `sysctl -n hw.ncpu` relevés à côté du chiffre.
- [ ] Mettre à jour la restriction dans `CLAUDE.md` (racine et `takussan-api/`) et dans l'ardoise —
      **quelle que soit l'issue** : aujourd'hui la restriction est écrite avec la MAUVAISE raison.

## Critères d'acceptation

- [ ] AC1 — la décision est écrite et sourcée par une mesure prise au repos.
- [ ] AC2 — si la simultanéité est rendue possible : deux `php artisan test --parallel` sur la suite
      ENTIÈRE, lancés ensemble, **0 échec des deux côtés**, deux fois de suite.
- [ ] AC3 — si elle ne l'est pas : la restriction est écrite avec **sa vraie raison** (la file de
      tâches Meilisearch, et non la collision de démarrage de TCK-322, qui est corrigée).
- [ ] AC4 — le plafond de la barrière n'est pas relevé sans une mesure qui établit qu'il est le bon
      chiffre. Un plafond non mesuré est la faute d'origine de D-44.

## Ce que ce ticket ne fait pas

- Il ne remet pas en cause `--parallel` lui-même (TCK-321), ni le correctif des vues compilées
  (TCK-322), ni la barrière Meilisearch (D-44) — les trois sont validés par cette mesure même.
- Il ne traite pas l'activation de `--parallel` en CI : c'est TCK-324, et la décision y est déjà
  écrite (gain réel ×2,48, inutilisable tant que le cliquet de couverture partage l'exécution).
