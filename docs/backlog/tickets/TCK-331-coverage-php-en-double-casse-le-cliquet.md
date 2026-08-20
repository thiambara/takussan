---
id: TCK-331
title: "`--coverage-php` est passé DEUX FOIS — le cliquet sort en 1 sans un mot, et la carte d'impact n'a jamais été régénérée"
status: doing
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-17
updated: 2026-08-20
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, ci, tests, outillage, dette]
---

## Objectif utilisateur

Que la carte d'impact se régénère réellement, et que le cliquet de couverture rende un verdict
plutôt qu'un silence. Aujourd'hui le step de test sort en **1** avec une suite **entièrement
verte**, et `tests/impact-map.json` ne s'est jamais mise à jour toute seule.

## Contrat de données

Aucune donnée applicative.

## La mesure

**`artisan test --coverage` passe DÉJÀ `--coverage-php` à PHPUnit en interne** — c'est ainsi qu'il
construit sa table par fichier et qu'il évalue `--min`. L'ajouter explicitement le rend présent
**deux fois** : PHPUnit l'écarte, le rapport d'artisan ne se matérialise jamais, `--min` n'a rien à
évaluer, et la commande sort en 1.

Le message existe. Il faut séparer `stderr` et isoler le vrai code de sortie pour le voir — un
`| tail` rend celui de `tail`, ce qui explique qu'il soit resté invisible en CI :

```
WARN  Option --coverage-php cannot be used more than once
```

### Ablation — une seule variable, même sous-ensemble

| | `Total:` | sortie |
|---|---|---|
| sans `--coverage-php` | **`Total: 0.7 %`** | **0** |
| avec `--coverage-php` | **absent**, + le WARN | **1** sous `--min=86` |

### Ce que ce n'est PAS

- **Pas la mémoire.** `cov.php` est écrit **en entier** : 493 Ko sur le sous-ensemble,
  **104 Mo sur la suite complète**. L'écrivain fonctionne.
- **Pas un seuil de taille de suite.** Le nombre de tests est passé de 2313 à 2552 sans rapport :
  l'option n'avait **jamais** tourné.
- **Pas une régression de couverture.** Le clover de l'exécution rouge mesure **86,33 %**, au-dessus
  du cliquet.

### Zéro succès, jamais

| exécution | résultat |
|---|---|
| push `4bd5aa71` | morte avant, sur le 429 à l'installation |
| PR #199, 1ʳᵉ | **rouge**, sortie 1 muette |
| PR #199, 2ᵈᵉ (`--coverage-php` retiré sur PR) | **verte** |
| push `d7132beb` | **rouge**, sortie 1 muette |

**Deux exécutions l'ont produit, deux échecs.** L'option et le step de régénération sont arrivés sur
`origin` avec le push de 38 commits ; le dernier run vert d'avant ne les contenait ni l'un ni l'autre.

## La conséquence, plus lourde que la CI rouge

**`tests/impact-map.json` n'a JAMAIS été régénérée automatiquement.** Elle date de son unique
construction manuelle (`eafab606`) et elle vieillit depuis. `bin/impacted-tests.php` fonctionne, mais
sa carte ne se met pas à jour comme TCK-320 l'annonce — et une carte périmée ne se signale pas : elle
sélectionne simplement moins de tests qu'il n'en faudrait.

⚠ **L'AC7 de TCK-320 a été coché sur LECTURE du workflow**, pas sur une exécution. La condition
`if:`, le `[skip ci]`, l'ordre `git add` / `git diff --cached` sont tous justes — et aucun n'avait
jamais tourné. *Ne jamais déduire l'état d'un environnement de la configuration qui le vise.*

## ⚠ Deux choses à savoir avant de proposer un raccourci

**1. Le clover ne peut PAS remplacer `cov.php`.** La carte d'impact a besoin de l'attribution
**test → lignes** : `bin/build-impact-map.php` lit l'objet `CodeCoverage` sérialisé, qui porte le
tableau des tests par ligne. Le clover ne porte que des **compteurs par fichier** — aucune trace de
quel test a couvert quoi. Une carte dérivée du clover serait **structurellement fausse**, et
`check-impact-map.mjs` la validerait sans broncher, puisqu'elle serait structurellement *cohérente*.
L'invocation directe de PHPUnit n'est donc pas une préférence de style, c'est la seule voie.

**2. La carte gelée se dégrade dans le BON sens — ne pas lire cette fiche comme « les sélections
sont fausses ».** Elle est figée à `eafab606` pendant que `dev` avance, et les deux mécanismes de
TCK-320 poussent alors vers **plus** de tests, jamais moins :

- un fichier de `app/` **absent de la carte** impose la **suite entière** (le défaut à l'escalade,
  durci en revue finale) ;
- la réparation de péremption ajoute d'office **toute classe de test modifiée depuis le commit de la
  carte** — et plus la carte vieillit, plus cet ensemble grossit.

`bin/impacted-tests.php` devient donc progressivement **plus lent et plus large**, pas plus
permissif. **Il ne fabriquera pas de faux vert.** C'est ce qui permet de traiter cette fiche comme
une dette sérieuse plutôt que comme une urgence : la garde ne ment pas, elle s'émousse.

## Delta à produire

- [x] Faire produire les trois sorties de couverture par **une seule** invocation qui les accepte —
      PHPUnit directement plutôt qu'`artisan test --coverage` — et calculer le cliquet depuis le
      **clover** plutôt que depuis la table d'artisan. Ne PAS ajouter une seconde exécution de la
      suite : elle coûterait ~250 s par build. ⚠ Le clover sert au CLIQUET, jamais à la CARTE —
      cf. l'avertissement ci-dessus.
- [x] Vérifier que le cliquet rend **la même valeur qu'aujourd'hui, à la décimale**.
      ⚠ **Cette case a d'abord été cochée sur une valeur (86,3 %) qui n'avait jamais été mesurée
      ici** — l'appariement avait été fait à 0,8 % et à 7,9 %, sur des sous-ensembles. Le
      vérificateur adverse l'a relevé, et il avait raison : c'est la faute de TCK-320 AC7 un cran
      plus bas, dans la fiche même qui la répare. La suite ENTIÈRE a depuis été jouée (cf. le
      complément en fin de fiche) : **86,6 %**, cliquet tenu, sortie 0.
- [ ] Réactiver le step de régénération de la carte, et **prouver qu'il tourne** — pas le relire.
      *Réactivé, et la chaîne entière jouée en local de bout en bout (cf. notes). Ce qui reste, et
      qui NE PEUT être observé qu'en CI : le commit automatique sur `dev`. Cette case ne se coche
      pas sur une lecture — c'est exactement la faute qu'on répare ici.*
- [x] Corriger l'AC7 de TCK-320 par un **encadré daté** plutôt qu'une réécriture : la trace de ce
      qu'on croyait a de la valeur.
- [x] Garde : une exécution qui ne rend pas de ligne `Total:` doit **échouer bruyamment**, pas
      silencieusement. Un `WARN` de PHPUnit ne doit jamais pouvoir se perdre dans un `| tail`.

## Critères d'acceptation

- [x] AC1 — La suite CI sort en **0**, avec sa table et son `Total:`. **OBSERVÉ le 2026-08-20**
      sur la PR #206, job `lint-and-test`, 5 min 12 s, `pass` :
      `Total: 86.6 % (21597 / 24930 lignes exécutables)` puis `✓ cliquet tenu.`
      ⚠ **Nuance à ne pas gommer** : l'AC écrivait « sur `push` vers `dev` », et ce run est un
      `pull_request`. Le step de couverture et le cliquet sont les MÊMES ; le step de régénération
      de la carte, lui, est conditionné au push vers `dev` et n'a donc PAS tourné (cf. AC2 et
      TCK-320 AC7). La case est cochée sur ce qui a été exécuté, pas sur ce qui lui ressemble.
- [ ] AC2 — `tests/impact-map.json` est régénérée par une exécution **observée**, et le commit
      automatique apparaît dans l'historique.
      *MOITIÉ TENUE, et la moitié qui reste ne peut pas l'être ici. La régénération a EU LIEU :
      la session principale a joué la suite entière sous couverture le 2026-08-20 (cf. complément
      en fin de fiche), la carte est passée de 667 à 801 fichiers couverts. Ce qui manque encore
      est le **commit automatique**, qui n'existe que sur `dev` et ne s'observe qu'en CI — et
      aucun run n'est créé pour ce dépôt depuis le 2026-08-18T00:28Z. La case reste décochée :
      une exécution locale n'est pas une exécution CI, et c'est exactement la confusion que cette
      fiche existe pour ne plus commettre.*
- [x] AC3 — Le cliquet rend la même valeur qu'avant, à la décimale.
      **Mesure appariée, un seul et même clover** (`--testsuite=Unit`, 315 tests, 2026-08-20) :
      Collision affiche `Total: 7.9 %`, `bin/coverage-gate.php` affiche
      `Total: 7.9 % (1975 / 24966 lignes exécutables)`.

      **Et sur la suite ENTIÈRE, avec DEUX pilotes de couverture différents — c'est l'appariement
      que cette fiche revendiquait au départ sans l'avoir :**

      | | pilote | mesure |
      |---|---|---|
      | local (session principale) | Xdebug | `Total: 86.6 % (21594 / 24930)` |
      | CI, PR #206 | PCOV | `Total: 86.6 % (21597 / 24930)` |

      **Le même chiffre à la décimale**, 3 lignes d'écart sur 21 597 entre Xdebug et PCOV. Le
      cliquet ne dépend donc ni du pilote ni de la machine.
- [x] AC4 — L'ablation est écrite : retirer le correctif fait revenir la sortie 1 muette.
- [x] AC5 — L'encadré daté de TCK-320 existe et dit pourquoi l'AC7 n'était pas tenu.

## Hors périmètre

- Le seuil `--min=86` lui-même — il n'est pas en cause, mesuré à 86,33 %.
- La parallélisation en CI — c'est TCK-324.
- La fraîcheur de la carte au-delà de sa régénération automatique.

## Notes d'implémentation — 2026-08-20

Machine : macOS, 8 cœurs, PHP 8.4.6, Xdebug 3.4.2, PHPUnit 12.5.30, `load average` ~6 au départ.
Toutes les mesures ci-dessous sont locales et sur des **sous-ensembles** : aucune n'a lancé la suite
entière, et aucune ne prétend remplacer une exécution en CI.

### Ce qui a été construit

| fichier | rôle |
|---|---|
| `takussan-api/tests/Support/CoverageGate.php` | la logique du cliquet, lue **sur le clover** |
| `takussan-api/tests/Unit/Testing/CoverageGateTest.php` | 7 tests, écrits AVANT la classe |
| `takussan-api/bin/coverage-gate.php` | l'enveloppe mince : arguments, impression, code de sortie |
| `.github/workflows/api-ci.yml` | PHPUnit invoqué **directement**, cliquet en step, carte réactivée |

La coupure suit celle que `bin/build-impact-map.php` avait déjà posée : la logique vit dans
`Tests\Support\`, où elle est testée ; le script de `bin/` ne fait que lire des arguments. Et il vit
dans `bin/`, pas dans `app/`, pour la même raison qu'elle : `phpunit.xml` déclare
`<source><include>app</include></source>`, et un outil placé là entrerait au **dénominateur du
cliquet qu'il calcule**.

### La prémisse, re-mesurée avant d'écrire une ligne

Elle tient, à la lettre. Même sous-ensemble, une seule variable, `--min=0` des deux côtés pour que le
seuil ne puisse pas être le coupable :

```
$ XDEBUG_MODE=coverage php artisan test --coverage --min=0 --filter='Tests\Unit\Rules' \
    --coverage-clover=…
  Tests: 27 passed (36 assertions)
                                        Total: 0.8 %
  → sortie 0

$ … la même, + --coverage-php=…
   WARN  Option --coverage-php cannot be used more than once
  Tests: 27 passed (36 assertions)
  (aucune ligne « Total: », `grep -c "Total:"` → 0)
  → sortie 1
```

Les trois écrivains fonctionnent dans les deux cas — `clover.xml` 2,0 Mo, `cov.php` 638 Ko, `html/`
complet. Ce qui meurt est bien **après** eux : `Coverage::report()` de Collision n'est appelé que si
PHPUnit est sorti en 0 (`TestCommand.php:130`), et PHPUnit sort en 1 dès qu'il émet un avertissement
de lanceur.

### ⚠ Un SECOND défaut, trouvé en mesurant, et qui n'était écrit nulle part

`artisan test` appelle `ignoreValidationErrors()`. Conséquence : **la première option que Symfony ne
connaît pas interrompt l'analyse, et toutes les suivantes sont perdues en silence.** Mesuré :

```
$ XDEBUG_MODE=coverage php artisan test --testsuite=Unit --coverage --min=0 --coverage-clover=…
  Tests: 315 passed (908 assertions)          ← suite verte
  (aucune table de couverture, aucun « Total: »)   ← --coverage n'a JAMAIS été vu
  → sortie 0                                   ← et le cliquet n'a rien évalué

$ XDEBUG_MODE=coverage php artisan test --coverage --min=0 --testsuite=Unit --coverage-clover=…
                                        Total: 7.9 %      ← les MÊMES arguments, réordonnés
```

Le même effet se produit avec un chemin de fichier en argument (`php artisan test tests/Unit/X.php
--coverage --min=0` → aucune couverture, sortie 0). **Le cliquet dépendait donc de l'ordre des
arguments, et son absence était silencieuse.** Aucune garde ne l'aurait signalé. C'est, à soi seul,
une raison suffisante de passer par PHPUnit, qui refuse une option qu'il ne connaît pas.

### Ablation — protocole joué, deux scripts, une seule variable

Les deux formes du step, réduites au même sous-ensemble (`Tests\Unit\Rules`, 27 tests) et au même
seuil (`--min=0`). Seule change la **mécanique d'invocation**.

| | tests | ligne `Total:` | sortie |
|---|---|---|---|
| **ablation** — `artisan test --coverage --min=0 … --coverage-php=…` | 27 passés, 0 échec | **absente** (`grep -c` → 0) | **1** |
| **correctif** — PHPUnit direct + `bin/coverage-gate.php` | 27 passés, 0 échec | `Total: 0.8 % (202 / 24974 lignes exécutables)` | **0** |

Le rouge de l'ablation est bien la **signature exacte** observée en CI : suite entièrement verte,
rien d'imprimé après le résumé, sortie 1.

### Le cliquet rend le même nombre — mesure appariée

Sur **un seul et même clover**, celui d'une exécution `--testsuite=Unit` (315 tests, 68 s) :

```
Collision                  →  Total: 7.9 %
php bin/coverage-gate.php  →  Total: 7.9 % (1975 / 24966 lignes exécutables)
```

Le rapprochement est structurel, pas heureux : Collision affiche `percentageOfExecutedLines()`, et le
`<metrics>` de **projet** du clover porte le même couple sous `coveredstatements` / `statements`. La
comparaison au seuil porte sur le **flottant brut** des deux côtés, jamais sur l'arrondi affiché.

### Ce que le cliquet garde désormais, et que `--min` ne gardait pas

Chaque issue sort en 1 **avec sa raison écrite**, là où l'ancienne sortait en 1 sans un mot :

```
clover absent    → ::error:: rapport clover absent … la couverture n'est pas « inchangée », elle est INCONNUE.
clover tronqué   → ::error:: rapport clover illisible : String could not be parsed as XML
0 ligne mesurée  → ::error:: le rapport ne compte aucune ligne exécutable … Ce n'est PAS 100 %.
sous le seuil    → ::error:: Couverture sous le cliquet : 0.8 % < 86.0 %.
```

Le troisième cas est le seul par lequel un cliquet peut mentir **dans le sens qui coûte cher** :
`0 / 0` se lit « 100 % » dans la plupart des conventions. Le jour où PCOV disparaît du runner,
ce step rougit au lieu de laisser passer en silence. Il est couvert par un test.

### La carte d'impact — chaîne complète jouée, en local

```
$ php bin/build-impact-map.php <cov.php produit par le step corrigé> <carte>
  carte écrite : …
    4 classes de test · 10 fichiers couverts sur 931 scannés · 0.04 Mo
$ node scripts/check-impact-map.mjs --report
  ✓ carte d'impact : structure cohérente        → sortie 0
```

⚠ `takussan-api/tests/impact-map.json` **n'a pas été touchée**, et c'est délibéré : une carte dérivée
d'un sous-ensemble serait *structurellement cohérente* et *fonctionnellement fausse* — exactement le
piège que le corps de cette fiche décrit à propos du clover. Sa régénération exige un passage sous
couverture sur la suite entière (~890 s), qui n'est pas délégable.

### Tests

```
$ php vendor/phpunit/phpunit/phpunit tests/Unit/Testing/CoverageGateTest.php
  AVANT la classe : 7 tests, 4 échecs, 3 erreurs   (« Class "Tests\Support\CoverageGate" not found »)
  APRÈS           : OK (7 tests, 16 assertions)
```

`./vendor/bin/pint --test` propre sur les trois fichiers PHP. Le workflow est validé par
`yaml.safe_load` **avec détection de clé dupliquée** (le piège payé quelques heures plus tôt : deux
`if:` sur un même step font rejeter le workflow entier par GitHub, et `safe_load` l'accepte sans
broncher), et les deux blocs `run:` par `bash -n`.

### Ce qui reste, et qui ne peut pas être fait ici

1. Une exécution CI réelle — AC1 et AC2 en dépendent, et **ne se cochent pas sur une lecture**.
2. La régénération de `tests/impact-map.json` : la commande est prête, elle dure ~890 s.


## Complément — la chaîne jouée de bout en bout, sur la suite ENTIÈRE (session principale, 2026-08-20)

Le correctif avait été prouvé sur des sous-ensembles, faute de pouvoir déléguer une commande de
~890 s. La session principale l'a jouée. **Machine NON au repos** — sept agents i18n travaillaient
en parallèle — donc *la durée ci-dessous ne mesure rien du dépôt* et ne doit pas être comparée aux
204-235 s de référence. Le **pourcentage**, lui, ne dépend pas de la charge.

```
### DÉPART 2026-08-20 14:34:48 — 8 cœurs — load average 9,87
Time: 09:43.606, Memory: 340.00 MB
OK, but some tests were skipped!
Tests: 2589, Assertions: 8210, Skipped: 2.          ← 0 ÉCHEC
Generating code coverage report in PHP format ... done
Generating code coverage report in Clover XML format ... done
### CLIQUET
Total: 86.6 % (21594 / 24930 lignes exécutables)
Seuil (cliquet TCK-302) : 86.0 %
✓ cliquet tenu.                                      ← SORTIE 0
### CARTE D'IMPACT
carte écrite : tests/impact-map.json
  357 classes de test · 801 fichiers couverts sur 931 scannés · 0.14 Mo   ← SORTIE 0
```

**Ce que ça établit, et ce que ça n'établit pas.**

Établi : la forme exacte que la CI emploie désormais (`phpunit` directement, puis
`bin/coverage-gate.php` sur le clover) produit **les trois sorties d'une seule invocation**, rend un
chiffre, et sort en 0. C'était tout l'objet de la fiche : la forme précédente sortait en **1 sans
imprimer un chiffre**, sur une suite entièrement verte.

Non établi : le **commit automatique** de la carte sur `dev`, qui n'existe qu'en CI (AC2 ci-dessus).

**La dérive de la carte gelée, mesurée** — elle n'avait plus été régénérée depuis le 2026-08-17 :

| | 2026-08-17 (`eafab606`) | 2026-08-20 (`f39f2449`) |
|---|---:|---:|
| classes de test | 346 | **357** |
| fichiers couverts | 667 | **801** |

**+143 fichiers, −9.** Le sens de cette dérive confirme ce que la correction de TCK-320 avançait
sans l'avoir mesuré : la carte gelée *s'émousse sans mentir*. Un fichier absent de la carte fait
retomber `bin/impacted-tests.php` sur la suite entière — coûteux, jamais faux. Les 143 fichiers
manquants n'ouvraient donc pas un trou de couverture : ils annulaient l'économie que l'outil existe
pour rendre.
