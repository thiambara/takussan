# Le temps d'exécution de la suite de tests — mesure, puis conception

**Mesuré le 2026-08-17**, sur `dev` (`4eee25aa`), machine à **8 cœurs** (`sysctl -n hw.ncpu`).
`load average` relevé à côté de chaque chiffre, sans quoi aucun d'eux ne veut rien dire six mois
plus tard (cf. `CLAUDE.md`, et l'écart ×11 qui y est documenté).

## Le problème posé

Pendant le développement, plusieurs agents travaillent en parallèle sur ce dépôt. Si chacun lance
`php artisan test`, chacun paie 204 à 235 s d'horloge au repos — et bien davantage dès que la
machine n'est plus au repos. La question n'était pas « la suite est-elle lente » mais **« où part
réellement le temps »**, et elle n'avait jamais été mesurée : le dépôt connaît le *total* de sa
suite depuis le 2026-08-15, jamais sa *répartition*.

## Ce que la mesure dit

### 1. Il n'y a pas de point chaud

Une exécution complète avec `--log-junit` (2408 tests, 607,6 s cumulés, `load average` 5,74 → 21,73,
611 s d'horloge) :

| | |
|---|---|
| Classe la plus lourde | `Tests\Feature\Public\PropertySearchTest` — **4,7 %** du total |
| 50 % du temps | réparti sur **62 classes** |
| 80 % du temps | réparti sur **175 classes sur 350** |
| Par test | médiane **0,181 s** · moyenne 0,252 s · p90 0,307 s · max 10,98 s |
| `Tests\Unit` | 228 tests, 19,6 s, médiane 0,083 s |
| `Tests\Feature` | 2180 tests, 588,1 s, médiane 0,188 s |

**Conséquence directe** : optimiser les tests lents ne rendrait presque rien. Ramener les
25 classes les plus lourdes à zéro rendrait ~10 %.

### 2. 42 % de la suite est du plancher de harnais

Deux classes de sondes, l'une de 10 tests et l'autre de 200, ne contenant que `assertTrue(true)`,
avec `RefreshDatabase`, exécutées à `load average` ~18 :

| Sonde | Durée |
|---|---|
| 10 tests | 4,27 s |
| 200 tests | 24,31 s |

Pente = (24,31 − 4,27) / 190 = **105,5 ms par test**. Ordonnée à l'origine = **3,2 s**.

**2408 × 105,5 ms = 254 s, soit 42 % de la suite**, pour des tests qui n'exécutent rien. C'est
Laravel qui reconstruit son conteneur d'application à chaque test : 22 fichiers de config,
22 service providers (7 déclarés + 15 auto-découverts).

### 3. Les 131 migrations coûtent ~1 s, une seule fois

C'était l'hypothèse la plus évidente, et elle est **fausse**. `RefreshDatabase` migre une fois par
processus (`RefreshDatabaseState::$migrated`) puis enveloppe chaque test dans une transaction. Le
delta mesuré entre la sonde `Feature` + `RefreshDatabase` et la sonde `Unit` sans base est de
**0,96 s au total**, pas par test.

### 4. `config:cache` rend 6 % — écarté

24,31 s → 22,85 s sur la sonde de 200 tests. Le gain est réel mais négligeable devant le risque :
mettre la config en cache neutraliserait les surcharges d'environnement que `phpunit.xml` pose
délibérément (`DB_CONNECTION`, `SCOUT_DRIVER`, les quatre URLs SMS de TCK-300…). *Six pour cent ne
paient pas ce risque-là.*

### 5. La suite occupe 0,73 cœur sur 8

`user 417,40 s + sys 29,42 s = 446,8 s` de CPU pour **611,4 s d'horloge**. La suite est **strictement
mono-processus**, et **sept cœurs sont inutilisés du début à la fin**.

C'est le fait qui gouverne la décision sur `--parallel` : trois agents qui lancent la suite
séquentiellement n'entrent pas en concurrence pour le CPU (3 cœurs sur 8), ils attendent simplement
chacun leur tour d'horloge. Trois agents qui la lancent en `--parallel` demandent 24 cœurs à une
machine qui en a 8.

### 6. La sensibilité à la charge, re-confirmée

**610 s à `load average` 5,7 → 21,7**, contre 204-235 s documentées au repos — ×3, *en n'occupant
qu'un seul cœur*. La contention ne vient donc pas de la suite : elle vient de tout le reste
(navigateur, IDE, `vitest` d'un agent voisin, les autres processus `claude`).

## La méthode retenue : sélection par impact

### Le mécanisme existe et a été vérifié

PHPUnit conserve, sous `--coverage-php`, l'association **ligne de code → identifiants de test**.
Vérifié sur `PropertyCrudTest` : 20 tests, 20 identifiants distincts de la forme
`Tests\Feature\Api\PropertyCrudTest::test_requires_auth`, 500 à 700 lignes chacun.

Carte complète produite le 2026-08-17 : `XDEBUG_MODE=coverage php artisan test --coverage-php` →
**891,8 s**, 2406 passés, 2 ignorés, **0 échec**, `load average` 2,6 → 9,9. Fichier brut de **95 Mo**,
réduit à **0,08 Mo** en collapsant à la granularité *classe* et en internant les noms.

> Xdebug, pas PCOV : le dépôt utilise PCOV en CI et Xdebug en local (`CLAUDE.md`). Les 891,8 s
> ci-dessus sont donc un chiffre **local**, à ne pas comparer aux +36 % mesurés sous PCOV pour
> TCK-302.

### Sélectivité — les deux bornes, et elles ne disent pas la même chose

**Borne haute (pessimiste) — par commit mergé**, sur 172 commits hors merge touchant `takussan-api/`
parmi les 400 derniers :

| | |
|---|---|
| Suite entière | **102 / 172 (59 %)** — re-mesuré le 2026-08-17 après le durcissement du sélecteur (cf. encadré ci-dessous). Le chiffre initial était 97/172 |
| Sélection partielle | 75 — médiane **5 classes**, p75 18, **p90 264** |
| Gain franc (≤ 10 classes) | **49 / 172, soit 28 %** |

> ⚠️ **Re-mesuré après la revue finale : 102/172, et non 97/172.** La revue a trouvé que le
> sélecteur **ignorait en silence** tout chemin sous `takussan-api/` qu'il ne reconnaissait pas —
> `tests/BaseTestCase.php` (dont **89** classes héritent), `tests/ApiTestCase.php` (38),
> `tests/Concerns/InteractsWithMeilisearch.php` (21), les trois fichiers de `tests/Support/` qui
> portent les mécanismes de D-44, `.env.example` (qui **est** l'environnement de test de la CI),
> `lang/`, `resources/views/`. Tous rendaient « rien à lancer » et sortie 0 : le **quatrième**
> chemin de faux vert de ce chantier.
>
> Le défaut par défaut de la boucle était « ignorer » ; il est désormais « escalader », avec une
> liste explicite de chemins inertes (`docs/`, `storage/`, `vendor/`, `node_modules/`,
> `public/build/`, `*.md`). `config/` a de plus été déplacé de la règle de `routes/` vers les
> déclencheurs durs : l'arête route → contrôleur borne réellement l'impact, une valeur de
> configuration se lit globalement.
>
> **Le prix de ces deux corrections est de cinq commits sur 172.** Une escalade de plus coûte des
> secondes ; une sous-sélection produit un vert qui ne prouve rien.

**Borne basse (réaliste) — par fichier**, sur les 482 fichiers `app/` réellement modifiés en
400 commits :

| Classes sélectionnées | Part | Temps plancher estimé |
|---|---|---|
| **1-5** | **81 %** | **≈ 5 s** |
| 6-20 | 10 % | ≈ 5-13 s |
| 21-100 | 4 % | ≈ 13-70 s |
| 101-350 | 6 % | ≈ 70-256 s |

Médiane **2 classes**, p75 3, p90 13. **70 des 482 fichiers ne sont couverts par aucun test.**

> **Mesuré de bout en bout une seule fois, le 2026-08-17** (ablation : une ligne vide ajoutée dans
> `app/Services/Search/PropertySearchService.php`, `load average` 5,2-5,8 sur 8 cœurs) : **4 classes
> sélectionnées, 26 tests, 16,7 s d'horloge** — soit ×2,8 le plancher « estimé » annoncé ci-dessus
> pour cette tranche, et un gain réel d'environ **×13** (16,7 s contre 204-235 s pour la suite
> entière au repos), pas ~120×. Le modèle plancher (amorçage + coût par test) sous-estime le coût
> réel d'un facteur ~2,8, pour une cause qui n'a pas été instruite. Ce n'est pas fatal — ×13 justifie
> amplement l'outil — mais ce tableau, comme celui du dessus, est un *estimé*, et une seule mesure de
> bout en bout ne le remplace pas encore.

**Les deux bornes décrivent deux moments différents du travail, et c'est ce qui rend la méthode
cohérente** : un agent qui itère modifie un fichier à la fois — c'est la borne basse, ~5 s **estimés**
dans 81 % des cas (mesurés : 16,7 s pour 4 classes, cf. ci-dessus). Un commit mergé empaquette un
ticket entier (migration + routes +
contrôleur + service + tests) — c'est la borne haute, et le repli sur la suite entière y tombe
**au moment précis où le rituel de fin de branche l'exige de toute façon**. Le repli n'est pas un
échec de la méthode ; il est bien placé.

### Ce que la carte ne peut pas faire, et pourquoi

**`routes/` ne se cartographie pas.** L'idée d'élargir le périmètre de couverture à `routes/` a été
écartée par le raisonnement, sans mesure inutile : un fichier de routes s'exécute à
l'**enregistrement**, donc au démarrage de l'application, donc dans **tous** les tests. Chaque ligne
serait « couverte » par les 350 classes. Le repli retenu est d'extraire les classes de contrôleur
citées dans les lignes modifiées du diff et de les chercher dans la carte ; à défaut, suite entière.
Mesuré : cette extraction laisse 36 commits sur 172 en repli.

**Les migrations non plus.** Elles s'exécutent une fois par processus, attribuées au premier test :
la carte les rattacherait à une classe arbitraire. Elles restent un déclencheur dur de suite entière,
et c'est correct — une migration change le schéma sous tous les tests.

## Architecture

Trois pièces, chacune avec une seule raison d'être.

### a) `php artisan test:build-impact-map`

Lit un fichier `--coverage-php` et le réduit à `takussan-api/tests/impact-map.json` :

```json
{ "version": 1,
  "commit": "4eee25aa",
  "generated_at": "2026-08-17",
  "classes": ["Tests\\Feature\\Api\\PropertyCrudTest", "..."],
  "scanned": ["app/Models/Property.php", "..."],
  "files":   { "app/Models/Property.php": [0, 12, 47] } }
```

Deux choix portent tout le reste :

- **Granularité classe, pas méthode.** Le plancher mesuré est de 3,2 s d'amorçage + 105 ms par test :
  lancer une classe entière plutôt qu'une méthode coûte quelques dixièmes de seconde et divise la
  taille de la carte par ~7. Sur-inclusif, donc du bon côté.
- **`scanned` liste les 796 fichiers `app/` du périmètre, `files` les 667 couverts.** Cette
  distinction est ce qui permet de traiter « fichier existant que personne ne teste » (→ rien à
  lancer, 129 fichiers) autrement que « fichier inconnu de la carte » (→ suite entière). Sans elle,
  36 commits sur 172 étaient escaladés à tort.

### b) `php artisan test:impacted`

`git diff --name-only` → règles → `php artisan test --filter=…`.

| Fichier modifié | Décision |
|---|---|
| `app/**` présent dans `files` | ses classes de test |
| `app/**` présent dans `scanned` mais absent de `files` | **rien** (aucun test ne le couvre) |
| `app/**` absent de `scanned` | **suite entière** |
| `routes/**`, `config/**` | classes de contrôleur/service citées dans le diff → leurs tests ; sinon **suite entière** |
| `database/{migrations,factories,seeders}/**`, `bootstrap/**`, `composer.lock`, `composer.json`, `phpunit.xml`, `tests/bootstrap.php`, `tests/TestCase.php` | **suite entière** |
| `tests/**` | ces classes-là, telles quelles |
| `docs/`, `*.md`, `takussan-web/` | rien |

La commande **affiche toujours** ce qu'elle a décidé et pourquoi : le nombre de classes retenues, la
règle qui a déclenché un éventuel repli, et l'âge de la carte. Une sélection silencieuse est une
sélection qu'on ne peut pas mettre en doute.

### c) La réparation de péremption — le point critique

Une carte vieille de deux semaines rate les tests écrits depuis : c'est un **faux vert**. Deux
gardes, et il faut les deux :

1. **La carte porte le commit qui l'a engendrée.** `test:impacted` ajoute d'office toutes les classes
   de test ajoutées ou modifiées depuis ce commit
   (`git diff --name-only <commit>..HEAD -- tests/`). Cela referme le trou « un test neuf couvre mon
   fichier » pour un coût nul.
2. **`test:impacted` ne remplace JAMAIS la suite entière comme garde.** C'est une boucle de retour
   rapide pendant le développement. La CI et le rituel de fin de branche continuent de jouer les
   2408. Une carte périmée coûte alors une découverte tardive — **jamais une régression mergée**.

## Où vit la carte

**Retenu : committée, engendrée par un job de CI sur push vers `dev` uniquement.**

- La CI mesure déjà la couverture à chaque PR (TCK-302, cliquet `--min=86`) : ajouter
  `--coverage-php` ne coûte que la sérialisation, le calcul est déjà payé.
- **Sur push vers `dev` seulement**, pas sur chaque PR : régénérer le fichier à chaque PR en ferait
  un aimant à conflits de merge.
- L'agent qui clone a la carte immédiatement, sans réseau ni `gh auth`.
- 0,08 Mo : la taille ne pose aucun problème de dépôt.

**Écarté — artefact CI téléchargé (`gh run download`)** : impose authentification et réseau à une
commande qu'on veut pouvoir lancer hors ligne, et fait dépendre la boucle quotidienne d'un service
tiers.

**Écarté — génération locale à la demande** : 891,8 s sous Xdebug, mesuré. Demander cela à chaque
agent avant de pouvoir gagner du temps est une contradiction dans les termes.

**Ce que la carte n'est pas** : elle n'entre pas dans le cliquet de couverture, ne rend aucun verdict,
et sa péremption ne casse aucune CI. C'est un **index dérivé**, au même titre qu'`INDEX.md` — et
comme lui, jamais édité à la main. `scripts/check-impact-map.mjs` vérifie qu'il parse, que son
`commit` existe dans l'historique et que son âge reste sous 30 jours — **avertissement, pas échec**.

## Phase 2 — `--parallel`, réservé à la CI

D-30 a mesuré `--parallel` (**2,6× : 204 s → 66-83 s**) puis l'a **refusé** sur deux conditions.

**La première est déjà levée, et l'ardoise ne l'a pas enregistré** : TCK-314 est `done` et mergé
(PR #192, `4929df7f`). L'entrée D-30 le cite encore comme condition non remplie — à corriger.

**La seconde a été mal formulée.** D-30 la pose comme « décider lequel des deux jetons gouverne ».
La lecture du code dit que c'est la mauvaise question : les deux jetons ne répondent pas à la même.

| Jeton | Isole | Valeur |
|---|---|---|
| `ParallelTesting::token()` (Laravel) | les workers **entre eux** | `1`, `2`, … `N` |
| `Tests\Support\TestProcessToken` (dépôt) | les **exécutions simultanées** entre elles | `pid` + 3 octets d'aléa |

En `--parallel`, Laravel supplante le second : deux agents qui parallélisent obtiennent tous deux
`public_test_1` et se détruisent mutuellement — exactement la panne que D-44 a soldée. **Choisir
l'un réintroduit le défaut que l'autre garde.** La correction est de les **composer** :
`TEST_TOKEN = <TestProcessToken>_<index worker>`. Les deux gardes de
`Tests\Unit\Testing\FakeDiskIsolationTest` se réécrivent en conséquence — la seconde devient
« `LARAVEL_PARALLEL_TESTING` est absent **hors** mode parallèle ». `TestSearchIndex` hérite du même
discriminant pour les index Meilisearch.

**Pourquoi le cantonner à la CI** : la mesure 5 ci-dessus. La suite occupe 0,73 cœur sur 8 ;
`--parallel` la fait passer à 8. Un agent seul y gagne 2,6× ; deux agents qui parallélisent
simultanément demandent 16 cœurs à une machine qui en a 8, et retombent dans le régime ×11 que
`CLAUDE.md` documente. `--parallel` est un gain **en CI** (runner dédié) et au **rituel de fin de
branche** (un seul agent, machine au repos) — pas dans la boucle quotidienne, que la phase 1 couvre
beaucoup mieux.

**Condition de bascule, inchangée et non négociable** (D-30) : **cinq exécutions consécutives à
0 échec**, un rouge Meilisearch relancé seul avant d'être compté, `uptime` et `sysctl -n hw.ncpu`
relevés à côté des chiffres.

## Ce que cette conception ne fait pas

- **Elle ne réduit pas le plancher de 105 ms.** Le seul levier mesuré (`config:cache`) rend 6 % et
  a été écarté. Réutiliser le conteneur d'application entre tests rendrait les tests dépendants les
  uns des autres : plafond bas, risque élevé, non retenu.
- **Elle ne touche pas la suite frontend.** `vitest` parallélise déjà par défaut sur le nombre de
  cœurs — son problème n'est pas le même, et TCK-313 le tient déjà par un bout.
- **Elle ne rend aucun verdict.** Un `test:impacted` vert ne dit rien de la suite. Seules la CI et
  le rituel de fin de branche le disent.

## Découpage en tickets

1. **Phase 1 — sélection par impact.** `test:build-impact-map`, `test:impacted`, le job de CI sur
   `dev`, `scripts/check-impact-map.mjs`, la documentation dans `takussan-api/CLAUDE.md`.
2. **Phase 2 — `--parallel` en CI.** Composition des deux jetons, réécriture des deux gardes de
   `FakeDiskIsolationTest`, `composer require --dev brianium/paratest`, les cinq exécutions
   d'épreuve, et la correction de l'entrée D-30 de l'ardoise (TCK-314 est soldé).

## Provenance des chiffres

Tout ce document a été mesuré le 2026-08-17 sur une machine à 8 cœurs. Aucun chiffre n'est repris
d'un document antérieur sans être daté et attribué. Les commandes :

```bash
sysctl -n hw.ncpu; uptime                       # à relever À CÔTÉ de chaque mesure
php artisan test --log-junit=junit.xml          # répartition par test  (611 s, load 5,7→21,7)
XDEBUG_MODE=coverage php -d memory_limit=4G \
  artisan test --coverage-php=cov.php           # carte par test        (891,8 s, load 2,6→9,9)
```

Les sondes de plancher (10 et 200 tests triviaux) ont été **supprimées** après mesure : elles ne
laissent aucune trace dans l'arbre. Pour les reproduire, il suffit de deux classes vides
`extends Tests\TestCase` avec `RefreshDatabase`, et de prendre la pente entre les deux.
