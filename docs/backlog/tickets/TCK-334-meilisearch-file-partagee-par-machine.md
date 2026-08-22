---
id: TCK-334
title: "Deux `--parallel` simultanés saturent la file de tâches Meilisearch — la CINQUIÈME ressource partagée par machine"
status: done
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-20
updated: 2026-08-22
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

## ⚠ L'ORDRE DES CAUSES A CHANGÉ — remesuré le 2026-08-22

**Le constat d'ouverture ci-dessus reste exact pour le 2026-08-20, et il n'est plus reproductible.**
Il n'est pas effacé : il est daté, et ce qui suit dit pourquoi on ne peut plus l'atteindre.

Entre les deux dates, [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) a fait
basculer la suite sur PostgreSQL, et **`--parallel` a cessé de fonctionner du tout** — pas sous
simultanéité : *seul*, sur n'importe quel test qui touche la base.

```
$ php artisan test --parallel --filter=BasePolicyCapabilityTest      # 2026-08-22, arbre propre
  Tests: 7, Assertions: 0, Errors: 7.
  FATAL: database "takussan_test_12148e66e64_1" does not exist
  SQL: drop database if exists "takussan_test_…_1_test_…_1"
                                             └── suffixé DEUX FOIS ──┘
```

Une paire sur la suite entière rendait **2553 erreurs de chaque côté**, toutes celle-ci. **La file
de tâches Meilisearch ne pouvait donc plus être le facteur limitant : on ne l'atteignait plus.**
L'ordre des causes est : *d'abord la base, ensuite — peut-être — la file.*

### La cause, et elle est plus large que `--parallel`

**TROIS mécanismes nommaient ou créaient la base de test**, là où le dépôt croyait n'en avoir qu'un
(`Tests\Support\TestDatabase`, écrit par ADR-0020 pour fermer la cinquième ressource partagée) :

| # | Mécanisme | Actif quand | Effet |
|---|---|---|---|
| 1 | `Tests\Support\TestDatabase` | toujours *(en principe)* | nomme, crée, horodate, supprime, balaie |
| 2 | `Illuminate\Testing\Concerns\TestDatabases::testDatabase()` (lignes 198-209) | `--parallel` seul | **recompose** `$database.'_test_'.token()` sur le nom déjà engendré |
| 3 | `MigrateCommand::createMissingMySqlOrPgsqlDatabase()` (ligne 275) | toujours | crée en silence toute base pgsql absente |

Le n°2 explique la panne `--parallel`. **Le n°3 explique quelque chose de plus coûteux** :
`TestDatabase::ensureCreated()` n'était accrochée qu'à `Tests\CreatesApplication`, **que seul le
processus PARENT de ParaTest emploie** — `Tests\TestCase` hérite du `createApplication()` du
framework (`Illuminate\Foundation\Testing\TestCase`, ligne 45). Elle **n'a donc jamais tourné dans
un test**, et aucune de ses promesses ne s'appliquait : ni l'horodatage `COMMENT ON DATABASE`, ni la
suppression en fin d'exécution, ni le balayage des orphelines. C'est le n°3 qui faisait passer le
mode séquentiel, en silence.

**Mesuré le 2026-08-22 sur la machine de développement : 129 bases `takussan_test_%` orphelines,
dont 0 horodatée** — donc 129 que `sweepOrphans()` ne pourra jamais réclamer, puisqu'il s'abstient
délibérément sur une base sans horodatage.

> *Un mécanisme d'isolation qui n'est jamais appelé n'échoue pas : un autre le couvre, plus mal, et
> le vert reste vert.*

### Le correctif

Un seul mécanisme nomme et crée la base, dans les deux modes :

- `TestDatabase::neutralizeFrameworkMechanism()` éteint le n°2 par **son propre interrupteur
  documenté**, `LARAVEL_PARALLEL_TESTING_WITHOUT_DATABASES` (ce que pose `--without-databases`,
  dont le sens est exactement le nôtre : *« la configuration des bases est prise en charge
  ailleurs »*). Appelée depuis le worker (`tests/bootstrap.php`) et depuis le parent
  (`Tests\CreatesApplication`), dont les rappels ne vivent pas au même endroit ;
- `TestDatabase::ensureCreated()` est ré-accrochée à `Tests\TestCase::createApplication()` — la
  classe que les tests emploient réellement. Le n°3 est dès lors **préempté** : la base existe avant
  le premier `migrate`.

`tests/Unit/Testing/TestDatabaseIsolationTest.php` garde la propriété, sur le patron de
`FakeDiskIsolationTest` et `CompiledViewIsolationTest`. La garde qui compte est la n°3 : **une base
créée par le dépôt porte un horodatage, une base créée par le framework n'en porte pas** — c'est la
seule différence observable entre les deux créateurs, et la seule chose qui rougisse si le point
d'accroche se reperd.

### Mesures — 2026-08-22, 8 cœurs (`sysctl -n hw.ncpu` → 8)

```
CINQ paires de `--parallel` simultanés, sous-ensemble de 236 tests DB (Authorization|Validation|Testing|Policies)
  load avant 9,75 → 26,12 après la cinquième
  A et B : OK (236 tests, 790 assertions), sortie 0 — les CINQ fois

Disjonction, échantillonnée SIX fois pendant une paire :
  16 bases vivantes distinctes pour 16 workers (2 exécutions × 8), 0 collision, toutes horodatées
  takussan_test_16aab7595c_1 … takussan_test_16b95499ad_8

Séquentiel, deux exécutions simultanées (non-régression) : 236 passés des deux côtés, sortie 0
Sous-ensemble large sous --parallel : tests/Feature/Api → 1102 tests, 3323 assertions, 0 échec
Nettoyage : 0 base horodatée restante après extinction (les 129 legacy, non horodatées, subsistent)
```

**Ablation** — les deux sites de neutralisation retirés : la garde rougit avec son propre message
(*« un SECOND mécanisme a renommé la base sous elle »*) et l'exécution laisse derrière elle
`takussan_test_15ad788ef9f_1_test_15ad788ef9f_1`, non horodatée. Retirer l'appel de
`Tests\TestCase::createApplication()` : gardes 3 et 4 rouges, **et le reste de la suite vert** — ce
qui est exactement le point.

⚠ **Ablation d'un SEUL des deux sites de neutralisation : vert.** Le `putenv()` du parent est hérité
par les workers de ParaTest. La redondance est donc réelle et mesurée ; on la garde parce que ce
couplage n'est pas documenté et que le parent est seul à couvrir ses deux rappels à lui.

### Ce que ces mesures N'ÉTABLISSENT PAS

**La paire sur la suite ENTIÈRE n'a pas été jouée** (interdite à un agent délégué). Une paire sur
`tests/Feature/Search` (99 tests, 2 × 8 workers) passe à **0 `MeilisearchNotIdleException`**, mais
un sous-ensemble de 99 tests n'engendre pas le volume d'indexation d'une suite de 2668 : **il ne dit
rien de la mesure du 2026-08-20.** La question ouverte de ce ticket — la file Meilisearch est-elle
le facteur limitant ? — redevient *posable*, elle n'est pas répondue. Elle exige la paire sur la
suite entière, par la session déléguante, machine au repos.

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

- [x] AC0 *(2026-08-22, ajouté après coup)* — **`--parallel` fonctionne à nouveau**, un seul
      mécanisme nomme et crée la base, et la propriété est gardée par un test. Cet AC n'existait pas
      à l'ouverture du ticket : la panne qu'il solde est postérieure (ADR-0020) et bloquait tous les
      autres.
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

## La paire sur la suite ENTIÈRE, jouée par la session principale — 2026-08-22

Le § précédent laissait la question ouverte, faute de pouvoir jouer la suite entière depuis un agent
délégué. **Elle est jouée, et elle est verte.**

### La mesure

Cinq paires de `php artisan test --parallel` **simultanées sur la suite ENTIÈRE**, 8 cœurs
(`sysctl -n hw.ncpu` → 8), chacune partie machine au repos :

| Paire | `load average` au départ | Durée | A | B |
|---|---|---|---|---|
| 1 | 2,60 6,58 14,47 | 4 min 06 | `Tests: 2736, Assertions: 8791, Skipped: 2` · **0** | idem · **0** |
| 2 | 5,73 16,44 17,82 | 6 min 47 | idem · **0** | idem · **0** |
| 3 | 5,78 26,97 26,68 | 8 min 04 | idem · **0** | idem · **0** |
| 4 | 5,85 27,65 34,42 | 8 min 11 | idem · **0** | idem · **0** |
| 5 | 5,45 32,09 40,87 | 7 min 46 | idem · **0** | idem · **0** |

**Zéro `MeilisearchNotIdleException` sur les dix exécutions.** Le compte de bases orphelines est
resté à 130 avant comme après : les vingt bases par paire (2 × 8 workers, plus le balayage) sont
créées et supprimées, aucune n'a fui.

### La réponse à la question du ticket

**La file de tâches Meilisearch n'est PAS le facteur limitant.** Les quatre pistes du ticket sont
tranchées, et par la mesure :

| Piste | Sort |
|---|---|
| 1 — une instance Meilisearch par exécution | **Écartée.** Elle aurait coûté de la mémoire et compliqué `docker-compose.yml` et `dev.sh doctor` pour résoudre un problème qui n'existe pas. |
| 2 — relever le plafond | **Écartée**, et c'était la bonne intuition d'AC4 : le plafond n'était pas trop bas, il portait sur la mauvaise grandeur. |
| 3 — sérialiser l'indexation par un verrou de machine | **Écartée.** Elle aurait rendu la promesse de `--parallel` partiellement fausse pour rien. |
| 4 — assumer la restriction | **Écartée aussi** — et c'est le point : la restriction n'est plus vraie, donc l'assumer aurait été la fixer par ignorance. |

**Ce qui a été fait à la place tenait aux deux causes réelles, et aucune n'était dans la liste :**

1. **La barrière mesurait le temps mural, pas la vie du serveur.** Elle abandonnait après 10 s
   d'attente, quelle qu'en fût la raison. Or le pire batch *légitime* de l'historique du serveur —
   12 764 batches relevés — a duré **8,24 s pour UNE seule tâche**, sans aucune exécution
   concurrente : pendant ces 8,2 s, le compte de tâches en attente reste FIGÉ. Un détecteur de
   stagnation fondé sur le compte aurait donc fait échouer une exécution que le plafond laissait
   passer. La barrière lit désormais le **battement** du serveur (`GET /batches?limit=1`, champ
   `progress`) : elle n'abandonne plus après N secondes d'attente, mais après N secondes de
   **silence**. Le seuil reste 10 s, appliqué au silence — il ne peut donc que faire attendre
   *plus*, jamais moins, et **AC4 est respecté sans qu'aucun plafond ne soit relevé**.
   `getTasks()` était en outre appelé sans `setLimit()` : le serveur en rend 20 au maximum, donc le
   compte du diagnostic mentait au-delà — précisément quand on en a besoin.
2. **Trois mécanismes nommaient ou créaient la base de test** (cf. § précédent), et c'est la cause
   qui bloquait tout.

### AC — état final

- [x] **AC1** — la décision est écrite et sourcée par une mesure prise au repos.
- [x] **AC2** — deux `php artisan test --parallel` sur la suite ENTIÈRE, lancés ensemble, **0 échec
      des deux côtés**, **cinq fois** et non deux.
- [x] **AC3** — sans objet dans sa branche « si elle ne l'est pas » : la restriction disparaît des
      deux `CLAUDE.md` et de l'ardoise D-56, parce qu'elle a cessé d'être vraie.
- [x] **AC4** — le plafond n'est pas relevé. La grandeur mesurée a changé, et le seuil de silence
      est adossé au plus long batch mesuré de l'historique du serveur (8,24 s), avec 20 % de marge.

### Ce que ces mesures n'établissent pas

Que la saturation observée le 2026-08-20 ne puisse jamais se reproduire — sur une machine plus
lente, ou avec plus de deux exécutions. Elle n'est pas disculpée, elle est **hors d'atteinte** dans
les conditions mesurées. Ce qui a changé pour de bon, c'est que la barrière sait désormais le dire
elle-même : son message distingue « le serveur n'a produit aucun batch depuis X s » de « plafond
absolu atteint, serveur vivant mais trop lent ».

### Une dette laissée ouverte, et elle n'est pas dans le dépôt

**130 bases `takussan_test_%` orphelines subsistent sur cette machine, dont 0 horodatée** — l'héritage
des semaines pendant lesquelles `ensureCreated()` n'était appelée nulle part et où `MigrateCommand`
créait les bases en silence. `sweepOrphans()` **ne pourra jamais les réclamer** : il s'abstient
délibérément devant une base sans horodatage, pour ne pas arracher une base sous une exécution
concurrente vivante. Elles pèsent **1 926 Mo**. Le correctif arrête l'hémorragie, il ne nettoie pas
le passé — et un balayage sans horodatage serait exactement le comportement dangereux que
`sweepOrphans()` refuse. À supprimer à la main, machine sans exécution en cours :

```sql
-- à jouer une fois, en vérifiant d'abord qu'aucune suite ne tourne
SELECT 'DROP DATABASE IF EXISTS "'||datname||'" WITH (FORCE);'
FROM pg_database
WHERE datname LIKE 'takussan_test_%'
  AND shobj_description(oid, 'pg_database') IS NULL;
```
