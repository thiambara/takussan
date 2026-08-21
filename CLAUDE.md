# CLAUDE.md

Guide de travail pour Claude Code (claude.ai/code) et tout autre agent sur ce dépôt.

## Ce qu'est ce dépôt

Monorepo **Takussan** — plateforme de gestion immobilière (Sénégal, XOF, français/anglais/wolof).

- `takussan-api/` — Laravel 13, PHP ^8.4 (`config.platform.php` figé à 8.4.1)
- `takussan-web/` — Next.js 16.3.1, React 19, TypeScript 5, Tailwind CSS 4

## État courant — mesuré le 2026-08-12

**Le projet n'est pas un squelette.** Cette précision ouvre le fichier parce que la version
précédente de ce document affirmait le contraire — *« takussan-api : État actuel : skeleton vierge.
Seuls `Controller.php` (abstract) et `User.php` existent »* et *« takussan-web : scaffold vierge
(create-next-app) »* — **pendant 118 jours**, du 2026-04-15 au 2026-08-12, et 308 commits. Tout agent
qui a lu ce fichier avant d'écrire du code a commencé par une contre-vérité de plusieurs ordres de
grandeur. *Un document d'entrée qui ment coûte plus cher que l'absence de document : on ne s'en
méfie pas.*

Ce qui existe réellement — **ordres de grandeur, mesurés le 2026-08-12**, et non des comptes à
tenir à jour :

| | `takussan-api/` | `takussan-web/` |
|---|---|---|
| Code | ~770 fichiers PHP · ~62 000 lignes dans `app/` | ~870 fichiers `.ts`/`.tsx` dans `src/` |
| Surface | ~535 routes · ~160 contrôleurs · 70 modèles | ~110 pages · ~30 route handlers BFF · 20 modules de server actions |
| Données | 135 migrations · 38 factories · 48 fichiers de seeders | — |
| Tests | ~310 fichiers · **~2660 tests, verts _au repos_ sur PostgreSQL** *(2026-08-21)* | ~190 fichiers · **~1290 tests, verts** *(2026-08-21)* |

> Les chiffres sont **arrondis délibérément**. La version précédente annonçait « 875 fichiers
> `.ts`/`.tsx` » — faux dans le commit qui l'écrivait, puisque ce même commit en supprimait sept.
> Ce tableau existe pour établir un ORDRE DE GRANDEUR (« ce dépôt n'est pas un squelette »), et
> une précision à l'unité sur une valeur qui bouge à chaque commit ne sert pas cet objet : elle
> ne fait qu'offrir une prise à l'erreur. Le compte exact se prend à la source :
> `php artisan test`, `npm run test`, `find … | wc -l`.
>
> *Une précision qu'on ne peut pas tenir n'est pas de la rigueur, c'est une dette de rigueur.*

**Le backlog est vidé, pas en cours** — l'écrasante majorité des tickets est `done`, et la poignée
qui reste ouverte tient sur un écran. **Le compte exact ne s'écrit pas ici** :

```bash
node docs/backlog/check-backlog.mjs --report   # compte par statut + la liste des ouverts
```

Une version de ce paragraphe donnait les chiffres en toutes lettres. Elle était **fausse dans le
commit qui l'introduisait** — elle annonçait 265 tickets et 3 `todo` quand la commande ci-dessus en
comptait 270 et 7, les cinq manquants étant ceux que ce même commit ajoutait. C'est exactement le
défaut que ce fichier existe pour ne plus commettre, un cran plus bas : *un compte recopié à la main
est faux dès qu'on ajoute un ticket, et il est faux avec l'autorité d'un document d'entrée.* Un
agent qui suit la convention « prendre le premier ticket de Todo » sur une liste amputée travaille
sur la mauvaise tâche sans jamais l'apprendre.

**Ce qui est vert, et depuis quand.** Au 2026-08-12, après le chantier de reprise : backend Pint
propre et la suite entière verte ; frontend ESLint 0 erreur, `tsc --noEmit` propre, suite verte. Les
trois régressions qui vivaient sur `dev` — une violation Pint qui **bloquait toute la CI depuis le
2026-06-29** (Pint tourne *avant* les tests : la suite entière n'a pas été exécutée en CI pendant six
semaines), une erreur TypeScript et une erreur ESLint bloquante côté front — sont corrigées.

**« Vert » voulait dire « vert au repos », et personne ne l'avait écrit — mesuré le 2026-08-15.**
La suite backend lancée **seule**, machine au repos, rend **2056 passés, 0 échec, sortie 0, en
313 s**. La même suite lancée pendant qu'une autre exécution tournait a rendu **12 échecs** ; relancée
aussitôt, **4 échecs sur un ensemble DIFFÉRENT**, sans qu'un seul fichier n'ait changé entre les deux.
Union des deux exécutions : **14 tests distincts, tous des tests de recherche Meilisearch** — et
ces 14-là, relancés seuls, passent **22/22**.

Ce n'est pas « la machine était chargée ». `waitForMeilisearch()` **abandonnait en silence** au bout
de 10 s — une boucle qui `return` sans lever, sans assertion, sans trace
(`takussan-api/tests/Concerns/InteractsWithMeilisearch.php:68-84`) — pendant que la suite s'infligeait
elle-même un backlog de **3308 tâches d'indexation**. Le test enchaînait donc sur un index à moitié
construit et rougissait sur une assertion métier parfaitement juste, en accusant le code applicatif.

**La CI est verte par chance de tempo** : même commande, même plafond de 10 s, runner simplement assez
rapide pour rester sous la barre. Ce n'est pas une garantie, c'est une marge que personne n'a mesurée.

Ce que cela change pour qui travaille ici : **ne jamais conclure d'un rouge Meilisearch sans l'avoir
relancé seul**, et ne pas lancer la suite entière pendant qu'un autre agent la lance. Détail complet,
chiffres et état du correctif : ardoise **D-44**.

**Le temps de référence de la suite backend — 204 à 235 s, machine au repos, mesuré le 2026-08-16**
sur ~2320 tests, **0 échec, sortie 0** (deux mesures indépendantes le même jour : 235 s, puis 204 s à
`load average` 8-29). C'est cet ordre de grandeur qu'on compare désormais, et non les 313 s
ci-dessus : celles-ci ont été prises le 2026-08-15, sur 2056 tests, **avant** le correctif D-44. Les
deux chiffres décrivent des suites différentes à des dates différentes — ils ne se soustraient pas.

⚠️ **« Au repos » est une condition de la mesure, pas une formule de style — et le facteur mesuré est
d'environ 11.** Le 2026-08-16, sur cette même machine à 8 cœurs, **la même commande** (PHPUnit sous
PCOV, à la virgule près) a rendu **1240 s** sous `load average` 200-258 — vitest et ESLint d'agents
voisins, plus le langage server PHP de l'IDE à ~230 % de CPU — et **113 s** deux heures plus tard à
load 4-8. Un test individuel passait de ~0,1 s à 2-3 s. Un temps de suite mesuré sous charge ne dit
rien du dépôt : il dit ce que la machine faisait d'autre. **Relever `uptime` et `sysctl -n hw.ncpu` à
côté du chiffre** — sans eux, il ne veut plus rien dire six mois plus tard.

**La bonne nouvelle de cette contention, elle, est solide** : c'est justement l'exécution à load
200-258 qui a rendu **2313 tests, 7136 assertions, 2 ignorés, 0 échec**. Le correctif D-44 tient donc
là où l'ancienne version rougissait, et c'est une preuve *plus forte* qu'une exécution au repos, pas
une preuve dégradée : au repos, l'ancienne version passait aussi.

**La couverture est mesurée et gardée depuis le 2026-08-16** — elle ne l'avait jamais été. Sur `app/`
(768 fichiers) : **lignes 86,16 %** (21 148 / 24 544), **méthodes 66,87 %**, **classes 43,81 %**. La CI
pose un **cliquet à 86 %**, pour un surcoût mesuré de **+36 %** (83 s → 113 s), et publie le
clover en artefact à chaque exécution. Le seuil a été **resserré de 85 à 86 le 2026-08-16**, la CI ayant confirmé **86,3 %** au premier
passage (PR #176) — la marge de 85 couvrait un doute sur le PCOV du runner, ce doute est levé. Il
reste 0,3 point, soit ~74 lignes non testées : c'est serré délibérément. Le seuil garde contre
l'**érosion** ; il ne dit pas que 86 %
suffit, et une méthode traversée sans assertion y compte pour couverte.

> **Remesurée sur PostgreSQL le 2026-08-21 : 86,8 %** (21 893 / 25 218 lignes exécutables), contre
> 86,16 % sur SQLite. Le cliquet à 86 % tient, avec plus de marge qu'avant — le chantier ADR-0020 a
> supprimé du code que rien n'exécutait (un branchement par driver mort, un garde-fou applicatif
> injoignable) davantage qu'il n'en a ajouté.
>
> ⚠ **Le seuil n'est PAS resserré, et c'est délibéré.** Ce 86,8 % est pris sous **Xdebug en local**,
> quand la CI mesure sous **PCOV** — les deux pilotes ne comptent pas exactement les mêmes lignes
> exécutables. *Resserrer un cliquet sur une mesure prise par un autre pilote, c'est fabriquer un
> rouge de CI qui n'apprend rien.* Le resserrement se décide sur un chiffre de CI, comme le
> 2026-08-16.
>
> Durée sous Xdebug : **1414 s (23 min 34)**, contre 641 s sans couverture.

⚠️ **Le cliquet n'est PLUS le `--min` de `artisan test`, depuis TCK-331 (2026-08-20).** La CI
invoque **PHPUnit directement** et évalue le seuil dans un step à part,
`php bin/coverage-gate.php storage/coverage/clover.xml --min=86`, qui lit le **clover**. Deux
raisons mesurées, et la seconde est la plus coûteuse : `artisan test --coverage` passe déjà
`--coverage-php` à PHPUnit en interne (une seconde occurrence est écartée, le rapport ne se
matérialise jamais, `--min` n'a rien à évaluer et la commande sort en **1 sans imprimer un
chiffre**, sur une suite verte à 86,33 %) ; et `artisan test` appelle `ignoreValidationErrors()`,
si bien que **toute option placée après une option que Symfony ne connaît pas est perdue en
silence**. Le cliquet lit désormais un fichier, pas un code de sortie — et un rapport qui n'a
mesuré **aucune** ligne exécutable y est un échec, jamais un 100 %.

Ce second défaut n'est pas théorique et il ne se limite pas à `--testsuite`. **Re-mesuré le
2026-08-20 sur le drapeau que ce fichier documente lui-même deux lignes plus haut, `--filter`** —
même test, même pilote Xdebug, une seule variable, l'ordre :

```
$ XDEBUG_MODE=coverage php artisan test --coverage --min=86 --filter=CurrencyRuleTest
    Total: 0.7 %
    FAIL  Code coverage below expected: 0.7 %. Minimum: 86.0 %.        → sortie 1

$ XDEBUG_MODE=coverage php artisan test --filter=CurrencyRuleTest --coverage --min=86
    Tests: 2 passed (11 assertions)
    (aucune ligne « Total: », aucune table)                            → sortie 0
```

**La seconde forme dit « vert » en n'ayant rien mesuré.** Retenir la signature plutôt que la
règle : *une commande de couverture qui sort en 0 sans imprimer de ligne `Total:` n'a pas mesuré
la couverture* — quelle que soit l'option qui l'a avalée.

**`--parallel` a été refusé le 2026-08-16, puis REPRIS et validé le 2026-08-17** (TCK-321). Les
deux causes du refus sont soldées — le test dépendant de l'ordre (TCK-314) et les gardes d'isolation,
dont les deux jetons sont désormais **composés** (`<pid+aléa>_<index worker>`) plutôt qu'opposés.
**Cinq exécutions d'épreuve à 0 échec**, et ×3,2 sur la meilleure paire comparable (208,80 s
séquentiel à load 3,74 → **64,90 s** à load 6,11, 8 cœurs).

⚠️ **Deux limites, mesurées, et elles gouvernent l'usage :**

1. **La collision de démarrage est TROUVÉE ET CORRIGÉE (TCK-322), la preuve sur la suite entière
   reste à faire.** Deux `--parallel` simultanés : l'un passait, **l'autre mourait au démarrage** sur
   `mkdir(): File exists` — une **quatrième** ressource partagée par machine, que D-44 ne pouvait pas
   connaître parce que ParaTest n'était pas installé. Ce n'était pas ParaTest : c'est le rappel
   `setUpProcess` de Laravel qui crée `storage/framework/views/test_<index worker>` dans le processus
   **parent**, là où le jeton composé de TCK-321 — posé dans `tests/bootstrap.php` — n'atteint
   jamais. Les vues compilées sont désormais enracinées par exécution
   (`Tests\Support\TestCompiledViews`). `--tmp-dir` ne corrigeait rien : ce répertoire n'est pas
   celui de ParaTest.

   **Mesuré le 2026-08-17, 8 cœurs : cinq paires simultanées à 0 échec des deux côtés** (`load`
   21-94), une paire compilant du Blade verte à `load` 215, et l'ablation du correctif fait
   remourir l'une des deux.

   ⚠️ **La paire sur la suite ENTIÈRE a été jouée le 2026-08-20, et elle ROUGIT — mais pas pour
   cette raison-là.** Machine au repos (load 3,39 sur 8 cœurs) : `A = 38 erreurs`, `B = 37`, sur
   2589 tests chacune. **Les deux ont DÉMARRÉ** — le correctif ci-dessus tient, `mkdir(): File
   exists` ne s'est pas produit — et les jetons d'index sont bien distincts. Les 75 erreurs sont
   *toutes* des `MeilisearchNotIdleException` : **une CINQUIÈME ressource partagée par machine, la
   file de tâches globale du serveur Meilisearch.** Contrôle joué juste après, même arbre, même
   repos : **une seule exécution rend 2589 tests, 0 échec, en 108 s**. C'est donc la simultanéité,
   pas l'arbre ni la charge.

   **Donc : un seul agent à la fois sur `--parallel` en suite entière** — la restriction ne change
   pas, sa RAISON change, et c'est TCK-334 qui la porte désormais. Le mode séquentiel et
   `bin/impacted-tests.php` supportent la simultanéité depuis D-44.

   *À lire deux fois : c'est le correctif D-44 qui a rendu ce diagnostic possible.* L'ancienne
   version abandonnait en silence au bout de 10 s et rougissait sur une assertion métier juste, en
   accusant le code applicatif. Ici la barrière lève, compte les tâches en attente index par index,
   et nomme elle-même la cause probable dans son message. **Le diagnostic était dans l'erreur.**
2. **Pas activé en CI — et c'est désormais un RÉSULTAT, plus un défaut** (TCK-324, mesuré le
   2026-08-18 sur le runner `ubuntu-latest`, `nproc` **4**, AMD EPYC 7763, load 1,05 au départ) :

   | suite | durée | sortie |
   |---|---|---|
   | séquentielle | **206 s** | 0 · 2552 passés |
   | `--parallel` | **83 s** | 0 · 2554 tests, 8069 assertions |

   **Gain ×2,48**, bien au-dessus de la barre de ~1,5× que TCK-324 posait. **L'obstacle n'est pas
   le gain** : une SEULE exécution de la suite porte à la fois les tests **et** le cliquet
   `--min=86`, et PCOV agrège mal entre processus. Paralléliser cette exécution-là revient à
   abandonner le cliquet ; l'ajouter en second passage coûte 83 s de plus, pas 123 s de moins,
   puisque la couverture reste le chemin critique.

   *Le gain est réel et inutilisable dans la forme actuelle de la CI* — ce n'est pas « ça ne vaut
   pas le coup ». Ce qui changerait la réponse : sortir le cliquet du job de PR. Détail : ardoise
   **D-30**.

Détail et raisonnement : ardoise **D-30**, tickets **TCK-302**, **TCK-314**, **TCK-321**, **TCK-322**, **TCK-324**.

**L'ardoise est ouverte et écrite.** `docs/ardoise.md` porte l'inventaire des manquements mesurés,
chacun sourcé, classé et priorisé — dont quatre qui touchent la **production** et ne se voient pas
depuis le code. **La lire avant de planifier quoi que ce soit.**

## Les commandes réelles (utiliser celles-ci, ne pas en inventer)

```bash
./dev.sh                 # tout : services docker + API + file de jobs + scheduler + front
./dev.sh api             # back seul
./dev.sh services        # les conteneurs seuls
./dev.sh doctor          # diagnostic : qui répond, qui manque, migrations en attente
```

`takussan-api/` :

```bash
php artisan test                    # ⚠ TOURNE SUR POSTGRESQL depuis ADR-0020 (2026-08-21), plus
                                    #   sur SQLite : `phpunit.xml` force `pgsql` SANS REPLI, et
                                    #   `docker compose up -d postgres` est un prérequis dur au
                                    #   même titre que Meilisearch. La base est créée PAR PROCESSUS
                                    #   (`Tests\Support\TestDatabase`) — c'est la cinquième
                                    #   ressource partagée par machine, et la seule que la
                                    #   migration a CRÉÉE : sous SQLite `:memory:` chaque processus
                                    #   avait la sienne gratuitement.
                                    # ⚠⚠ LE TEMPS DE RÉFÉRENCE EST 648 s (10 min 49), mesuré le
                                    #   2026-08-21 sur 2668 tests / 8616 assertions / 0 échec,
                                    #   MACHINE AU REPOS : load average 2,93 au départ et 4,63 à
                                    #   l'arrivée, 8 cœurs, 335,70 s user + 29,66 s system.
                                    #   C'est ~×2,8 la référence SQLite ci-dessous (204-235 s), et
                                    #   c'est le PRIX de la propriété achetée : ce que la suite
                                    #   éprouve est ce que la production exécutera. La piste si ce
                                    #   coût devient insupportable — NON empruntée, faute de
                                    #   nécessité démontrée — est `CREATE DATABASE … TEMPLATE` :
                                    #   migrer une base modèle une fois, la cloner par processus.
                                    # L'ANCIENNE référence SQLite, conservée pour la comparaison :
                                    # ~2300 tests, 204-235 s MACHINE AU REPOS (2026-08-16, deux
                                    #   mesures) — exige une instance Meilisearch (cf. D-08).
                                    #   Le temps ne se mesure QUE machine au repos : à load 200-258
                                    #   sur 8 cœurs, la même commande met ×11 plus longtemps.
                                    #   Un rouge Meilisearch se relance seul AVANT d'accuser le code
                                    #   (cf. D-44) — mais depuis le correctif, la suite entière rend
                                    #   0 échec même sous cette charge.
php artisan test --filter=Foo
php artisan test --parallel          # ×3,2 sur la meilleure mesure (208,80 s séquentiel, load 3,74
                                    #   → 64,90 s en parallèle, load 6,11 au départ ; 8 cœurs,
                                    #   mesuré le 2026-08-17, cf. D-30). ⚠ POUR LE RITUEL DE FIN DE
                                    #   BRANCHE, machine au repos — PAS pour la boucle quotidienne :
                                    #   la suite séquentielle n'occupe que 0,73 cœur sur 8 (mesuré
                                    #   le 2026-08-17, load average 5,7 → 21,7 sur 8 cœurs : user
                                    #   417,40 s + sys 29,42 s pour 611,4 s), et
                                    #   deux agents qui parallélisent en même temps demandent 16
                                    #   cœurs à une machine qui en a 8. NON activé en CI, et
                                    #   c'est MESURÉ (TCK-324, 2026-08-18, runner à 4 cœurs) :
                                    #   206 s séquentiel → 83 s en parallèle, gain ×2,48. Le gain
                                    #   est réel ; il est INUTILISABLE, parce qu'une seule
                                    #   exécution porte les tests ET la couverture qui alimente
                                    #   le cliquet à 86 % (par le clover depuis TCK-331), et que
                                    #   PCOV agrège mal entre processus (cf. D-30).
                                    #   ⚠⚠ La mort au démarrage de deux --parallel simultanés
                                    #   (« mkdir(): File exists ») est CORRIGÉE par TCK-322 :
                                    #   les vues compilées sont enracinées par exécution. Cinq
                                    #   paires simultanées à 0 échec, mais sur des SOUS-ENSEMBLES
                                    #   La paire sur la suite ENTIÈRE a été jouée le 2026-08-20
                                    #   et elle ROUGIT — 38 et 37 erreurs, TOUTES Meilisearch,
                                    #   alors qu'une seule exécution rend 0 échec en 108 s au
                                    #   même repos. Cinquième ressource partagée : la file de
                                    #   tâches du serveur (TCK-334). On garde donc « un seul
                                    #   agent à la fois » pour celle-ci, pour une AUTRE raison. Le
                                    #   séquentiel et impacted-tests.php supportent la
                                    #   simultanéité. Pour le quotidien :
                                    #   php bin/impacted-tests.php --run
php bin/impacted-tests.php --run     # ← LA commande du quotidien : ne lance que les tests que
                                    #   le diff touche, via tests/impact-map.json (carte dérivée
                                    #   d'un rapport de couverture, jamais éditée à la main).
                                    #   Mesuré le 2026-08-17 par ablation : 4 classes, 16,7 s à
                                    #   load 5,2-5,8/8 cœurs, contre 204-235 s pour la suite
                                    #   entière au repos.
                                    #   ⚠ Un vert ici NE DIT RIEN de la suite : c'est une boucle
                                    #   de retour, pas une garde. La CI et le rituel de fin de
                                    #   branche jouent la suite entière, toujours.
XDEBUG_MODE=coverage php vendor/phpunit/phpunit/phpunit \
  --coverage-clover=storage/coverage/clover.xml
php bin/coverage-gate.php storage/coverage/clover.xml --min=86
                                    # couverture de lignes de app/ — le CLIQUET de la CI (TCK-302),
                                    #   dans la forme EXACTE qu'elle emploie depuis TCK-331.
                                    #   Exige un pilote de couverture : PCOV en CI, Xdebug en local.
                                    #   ⚠ La VARIABLE D'ENVIRONNEMENT, pas `-d xdebug.mode=…`.
                                    #   Le seuil est posé au niveau MESURÉ ; il ne dit pas
                                    #   « 86 % suffit », il dit « on ne redescend pas ».
                                    #   ⚠⚠ `php artisan test --coverage --min=86` N'EST PLUS la
                                    #   forme de la CI, et il ne faut pas s'en servir pour juger
                                    #   du cliquet — DEUX défauts mesurés le 2026-08-20 :
                                    #   (a) `artisan test --coverage` passe DÉJÀ `--coverage-php`
                                    #       à PHPUnit ; l'ajouter le rend présent deux fois,
                                    #       PHPUnit l'écarte, `--min` n'a plus rien à évaluer, et
                                    #       la commande sort en 1 SANS IMPRIMER UN CHIFFRE, sur
                                    #       une suite entièrement verte (TCK-331) ;
                                    #   (b) `artisan test` ignore ses erreurs de validation : la
                                    #       PREMIÈRE option que Symfony ne connaît pas interrompt
                                    #       l'analyse et fait perdre TOUTES les suivantes en
                                    #       silence. `--testsuite=Unit --coverage --min=86` sort
                                    #       en 0 sans avoir mesuré quoi que ce soit. Le cliquet
                                    #       dépendait de l'ORDRE DES ARGUMENTS.
                                    #   `coverage-gate.php` lit le clover, rend le MÊME nombre
                                    #   à la décimale (mesure appariée), et fait ÉCHOUER
                                    #   bruyamment un rapport absent, tronqué, ou qui n'a mesuré
                                    #   aucune ligne — `0/0` n'est pas 100 %, c'est une mesure
                                    #   absente.
./vendor/bin/pint                   # ← AVANT CHAQUE COMMIT. Rien ne l'impose : c'est une
                                    #   violation d'un seul fichier qui a cassé la CI six semaines.
php artisan migrate
php artisan migrate:fresh --seed    # 48 fichiers de seeders. MESURÉ sur PostgreSQL le 2026-08-21 :
                                    #   262 s, sortie 0, 836 biens / 305 utilisateurs / 4 agences,
                                    #   0 erreur, et AUCUNE séquence désynchronisée (vérifié en
                                    #   insérant une ligne applicative dans 5 tables semées : la
                                    #   panne des séquences ne se voit qu'au PREMIER insert suivant,
                                    #   pas au seed lui-même).
                                    #   ~450 biens. SANS médias par défaut :
                                    #   SEED_DOWNLOAD_MEDIA=false des DEUX côtés (.env.example
                                    #   ET .env.docker) depuis TCK-301 — il valait `true`, et
                                    #   décidait pour tout nouveau clone de 1000 à 2700 requêtes
                                    #   HTTP. `true` reste valable, mais c'est un choix : les
                                    #   échecs sont alors comptés, imprimés, et `db:seed` sort en
                                    #   erreur au-delà de 10 % — un jeu partiel ne se déclare plus
                                    #   complet.
```

`takussan-web/` :

```bash
npm run dev
npm run lint          # ⚠ `npm run build` ne lance PAS ESLint sous Next 16
npx tsc --noEmit      # ⚠ aucun script `typecheck` : une erreur TS a survécu 53 jours sur dev
npm run test          # vitest
npm run build
```

Racine — **les gardes ne s'énumèrent pas ici, elles se listent** :

```bash
ls scripts/check-*.mjs                        # l'inventaire, toujours juste
for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done   # toutes, d'un coup
node docs/backlog/gen-index.mjs --check        # + les deux générateurs
node docs/gen-features-by-actor.mjs --check
```

> **Pourquoi une commande et pas une liste.** Ce bloc a cité **deux** gardes sur douze pendant que
> le dépôt en accumulait dix autres, et il n'y avait aucun moyen de s'en apercevoir : une liste
> écrite à la main est juste le jour où on l'écrit. C'est exactement le défaut que la moitié de ces
> gardes existent pour attraper ailleurs (D-15 sur `INDEX.md`, D-44 sur les modèles indexables,
> D-18 sur `models-spec.md`) — il vivait dans le document qui les présente.
>
> Elles vérifient toutes la même chose sous des formes différentes : **qu'un document dérivé suit
> encore sa source, et que la source suit encore la réalité.** Chacune porte son motif et son
> histoire dans son propre en-tête ; c'est là qu'il faut lire, pas ici.
>
> `.github/workflows/repo-ci.yml` les rejoue toutes à chaque PR.

## Qui lance quoi — la règle des tests quand plusieurs agents travaillent

**Un agent délégué lance les tests qu'il juge pertinents pour SON travail. Il ne lance jamais la
suite entière. C'est la session qui l'a délégué qui la lance, une fois, à la fin.**

La règle vaut pour les deux suites — `php artisan test` et `npm run test`.

| Qui | Quoi | Quand |
|---|---|---|
| Agent délégué | la ou les classes qu'il touche, `php artisan test <fichier>` | pendant son travail, autant de fois qu'il veut |
| Agent délégué | `php bin/impacted-tests.php --run` | s'il ne sait pas quoi lancer |
| Session déléguante | **`php artisan test` en entier** | **une seule fois, à la fin**, avant de proposer le merge |

**Trois raisons, toutes mesurées, et la troisième est la plus coûteuse :**

1. **Le temps ne s'additionne pas, il se multiplie.** La suite occupe 0,73 cœur sur 8 : dix agents
   qui la lancent chacun ne se partagent pas la machine, ils la saturent. Mesuré : la même commande
   met **×11** plus longtemps à `load average` 200-258 qu'au repos. Dix vérifications complètes
   coûtent bien plus que dix fois une.
2. **Un temps mesuré sous charge ne dit rien.** Toute mesure prise pendant qu'un autre agent teste
   décrit la machine, pas le dépôt — et c'est ainsi qu'on écrit dans un document un chiffre qu'on
   ne pourra plus reproduire.
3. **Un rouge sous charge accuse le mauvais coupable.** C'est toute l'histoire de D-44 : 14 tests de
   recherche rougissaient sur un ensemble **différent à chaque exécution**, sans qu'un fichier ait
   changé. La réponse humaine à ce signal est connue — on relance jusqu'au vert — et à partir de là
   la suite ne garde plus rien.

**Corollaire opérationnel, payé le 2026-08-17** : une commande de plus de ~10 minutes ne peut pas
être déléguée du tout — elle est coupée en cours de route, **sans rien produire et sans le dire**.
Un passage sous couverture (~890 s), une épreuve répétée, un build long : la session principale les
lance elle-même, puis redonne l'artefact à l'agent.

**Ce que ça ne change pas** : la suite entière reste la seule garde. Un vert de
`bin/impacted-tests.php` ne dit rien d'elle, et le rituel de fin de branche l'exige toujours.

## Environnement de développement

`docker-compose.yml` sert **PostgreSQL 17 (avec pgvector), Meilisearch, Redis et Mailpit**. Chaque service couvre une
divergence dev↔prod qui coûtait cher tant qu'elle n'était pas provisionnée — le raisonnement, service
par service, est dans l'en-tête du fichier.

> **Le moteur est PostgreSQL 17 depuis le 2026-08-21** ([ADR-0020](docs/adr/0020-postgresql-sur-tous-les-environnements.md)),
> sur tous les environnements, **suite de tests comprise**. L'image est `pgvector/pgvector:pg17` et
> non `postgres:17` — l'extension doit être *disponible* partout dès maintenant, alors qu'aucune
> table ne l'utilise, sinon le motif se referme en silence le jour du chatbot (TCK-344). La base est
> créée en `--encoding=UTF8 --locale=C` : collation **déterministe**, décision la plus lourde de
> l'ADR, dont dépend le sens de six contraintes d'unicité sur texte.
>
> **La leçon qui a précédé cette décision survit, et elle vaut désormais DAVANTAGE.** Le compose et
> la CI ont tourné sur `mariadb:11.4` du 2026-06-29 au 2026-08-13 parce qu'un commentaire affirmait
> que la prod sortait d'un `apt install mariadb-server` — commande que personne n'avait exécutée.
> Mesuré sur le serveur ce jour-là : `mysql-server 8.0.46`. Pas un écart de version, **le mauvais
> moteur**. *Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
> d'installation — qui le vise.*
>
> C'est pourquoi la constante de `scripts/check-db-engine.mjs` s'appelle désormais **`CIBLE` et non
> `PROD`** : il n'existe **aucune** production PostgreSQL à mesurer (D-04), et une constante nommée
> `PROD` inviterait à croire qu'elle a été relevée quelque part. Le jour où le serveur existe
> (TCK-288), la première chose à faire est de le mesurer et de comparer.

**Les ports sont décalés d'un cran** (5433, 7701, 6380, 1026/8026) : les ports canoniques étaient
occupés par des installations natives brew et par un projet voisin. Le décalage rend les deux mondes
simultanés au lieu d'exiger qu'on démonte l'existant.

**`.env.docker` est l'environnement de développement, `.env.example` est le contrat des clés.**
`.env.example` ne reproduit **aucun** environnement existant : il livre `SCOUT_DRIVER=collection`
quand la CI et la production indexent sur Meilisearch, et `CACHE_STORE=redis` sans que **lui-même** fournisse Redis — un développeur qui suit
ce seul fichier, hors docker, obtient une application qui ne démarre pas. `.env.docker` aligne chaque
driver sur celui de la production. `scripts/check-env-parity.mjs` garde la parité des **clés** entre
les deux (jamais des valeurs — deux fichiers aux valeurs identiques n'auraient aucune raison d'être
deux), et `scripts/check-webhook-env-keys.mjs` garde ce que la parité ne peut pas voir : **une clé
absente des DEUX fichiers est en parité parfaite** (TCK-296).

> ⚠️ **Nuance mesurée le 2026-08-16 (TCK-300), parce que la phrase ci-dessus vieillit mal sur un
> point.** `CACHE_STORE=redis` n'est **plus** un écart avec la production : les deux `.env` livrés
> déclarent `redis` pour le cache et la session. Ce qui reste vrai, c'est que `.env.example` seul ne
> provisionne rien — `docker-compose.yml` s'en charge, et c'est précisément sa raison d'être.
>
> Le relevé des drivers réellement déclarés par les environnements déployés vit dans
> [`docs/infra/prod-drivers.json`](docs/infra/prod-drivers.json), **et nulle part ailleurs** : il
> était recopié dans trois documents qui se contredisaient, dont un qui se contredisait lui-même.

`./dev.sh` ne force pas docker : il détecte si le `.env` vise les conteneurs du dépôt ou des services
natifs, **sonde ce que le `.env` déclare**, et nomme ce qui ne répond pas. Un service déclaré et
absent ne produit aucune erreur lisible — l'API démarre, et c'est la première requête qui meurt.

> **`./dev.sh doctor` nomme aussi le cas inverse, depuis TCK-301** : un `.env` qui vise le port
> CANONIQUE (5432 / 7700 / 6379 / 1025) alors que le dépôt publie le port décalé. Ce cas-là ne
> produit *aucun* rouge — les services répondent, ce sont ceux de brew — mais rien de ce que
> `docker-compose.yml` garantit ne s'applique alors : ni PostgreSQL 17, ni `--locale=C` (dont dépend
> le sens des contraintes d'unicité sur texte), ni la disponibilité de pgvector, ni l'isolation de
> l'index Meilisearch, ni Mailpit. `takussan-api/.env` est ignoré par git : aucun
> fichier de ce dépôt ne peut corriger l'écart, seulement l'afficher (dette D-48).

## Workflow git

**`dev` est la branche d'intégration**, et c'est aussi la branche par défaut du dépôt (mesuré :
`gh api repos/thiambara/takussan -q .default_branch` → `dev`). Toutes les PR la ciblent — **les 10
dernières fusionnées, sans exception**, plus de 24 au total.

**`master` n'est pas décorative : c'est elle qui sert le site public.** Un merge vers `master`
déploie le front en production, via l'intégration Git Vercel — pas via un workflow de ce dépôt
([ADR-0017](docs/adr/0017-deploiement-du-front-pilote-par-vercel.md),
[`docs/infra/frontend-deploiement.md`](docs/infra/frontend-deploiement.md), qui portent le relevé
mesuré et sa garde). Y pousser est donc une **action sortante** ; ce n'est pas un rangement de
branche.

⚠️ **Trois chiffres de ce paragraphe étaient faux, et ils l'étaient dans le sens qui rassure.
Re-mesurés le 2026-08-20 :**

| Ce que ce fichier écrivait | Mesuré le 2026-08-20 |
|---|---|
| `master` « figé au **2026-05-18** » | `git log -1 --format='%h %ad' --date=iso origin/master` → **`fefe2c87 2026-08-15 14:56:07 +0000`** (*Merge pull request #151 from thiambara/dev*) |
| « **31 commits** derrière `dev` » | `git rev-list --count origin/master..origin/dev` → **273** |
| « ne contient même pas la chaîne de déploiement » | `git cat-file -e origin/master:.github/workflows/deploy.yml` → **présent** |

`master` reste un **ancêtre strict** de `dev` (`git rev-list --count origin/dev..origin/master` →
**0**) : elle n'a aucun commit propre, un merge serait un *fast-forward*. C'est le seul point de
l'ancien paragraphe qui ait tenu.

**« La production n'a jamais été déployée » : vrai de l'API, FAUX du front — et il faut désormais
les distinguer.**

- **Le front EST en production, et il est public.** `https://www.takussan.com/` → **200**,
  `https://takussan.com/` → **307** vers `www`. Vercel a produit **3 déploiements d'environnement
  « Production »** (et 212 « Preview »), tous par `vercel[bot]`, et les 3 refs de Production sont
  exactement les 3 derniers commits de `git log --first-parent origin/master`.
- **L'API, elle, n'a jamais servi en production** — mais la raison a changé, et c'est le point
  neuf. Ce n'est plus « `deploy.yml` n'a jamais tourné » : **il a tourné deux fois le 2026-08-15,
  et les deux ont ÉCHOUÉ.**

  ```
  $ gh run list --workflow=deploy.yml --limit 10
  completed  failure  Deploy Laravel API              master  workflow_dispatch  31894037166  53s  2026-08-15T15:54:29Z
  completed  failure  Merge pull request #151 …       master  push               31891294106  48s  2026-08-15T14:56:11Z
  $ gh run view 31891294106 --log-failed
    SQLSTATE[HY000] [1045] Access denied for user 'takussan_prod'@'localhost' (using password: YES)
    ERROR: Deployment failed (exit code: 1). Rolling back...
    Removing failed release: /var/www/takussan/releases/20260815165630
  ```

  Le déploiement va jusqu'à `composer install` sur le serveur, meurt à `php artisan migrate --force`
  sur l'**authentification MySQL du compte `takussan_prod`**, et **se déroule proprement en
  arrière**. D'où le 404 : `https://api.takussan.com/up` → **404** quand
  `https://preview.api.takussan.com/up` → **200**, sur le même serveur (dette D-04, TCK-288).
  ⚠ Ce journal ne dit **pas** de quel côté est l'écart — secret périmé, compte absent, *grant*
  manquant : les trois se ressemblent ici. Ne pas le deviner ; l'ardoise D-04 le pose comme la
  première mesure à prendre.

**Et c'est cette combinaison qui coûte, pas chacun des deux faits.** Le front de production est
public et son bundle porte `NEXT_PUBLIC_API_URL = https://api.takussan.com` — l'hôte qui rend 404.
Re-mesuré le 2026-08-20 en téléchargeant les chunks servis par `www.takussan.com` — la valeur est
inlinée à la compilation, elle est donc lisible sans accès à Vercel :

```js
let e = "https://api.takussan.com".replace(/\/api$/, ""), s = `${e}/api`
```

Il y a donc un utilisateur exposé devant une API absente, ce que D-04 décrivait comme n'existant
pas. C'est l'objet de [TCK-332](docs/backlog/tickets/TCK-332-front-public-appelle-une-api-absente.md),
et cela relève la priorité de TCK-288.

> **Pourquoi ce paragraphe est réécrit et non corrigé chiffre par chiffre.** Il a déjà servi une
> fois de leçon : sa version précédente écrivait « la production ne reçoit plus rien depuis trois
> mois », déduite du **YAML** du workflow et non de son historique d'exécution, et la correction
> concluait *« ne jamais déduire l'état d'un environnement de la configuration qui le vise »*.
> **La correction elle-même a vieilli exactement de la même façon** : ses chiffres — 2026-05-18,
> 31 commits, `deploy.yml` absent de `master` — ont été mesurés une fois, le 2026-08-12, puis
> recopiés comme s'ils étaient une propriété du dépôt. **Ils sont devenus faux TROIS JOURS plus
> tard** : le 2026-08-15, `master` recevait `fefe2c87`, la chaîne de déploiement, deux tentatives
> de déploiement et un site public. Cinq jours de plus, et **rien dans ce fichier ne pouvait le
> signaler** — la phrase gardait l'aplomb du jour où elle avait été juste.
>
> *Une mesure sans sa date devient une croyance.* Chaque affirmation ci-dessus porte donc sa
> commande et son 2026-08-20 : c'est ce qui permettra de savoir, la prochaine fois, ce qui est
> périmé plutôt que de le supposer juste.

Messages de commit en français, préfixés du type conventionnel, citant le ticket quand il y en a un
(`feat(api): … (TCK-280)`). Ne jamais merger ni pousser sans demande explicite.

## Specs & backlog

**Sources de vérité fonctionnelles** (ne jamais dupliquer dans un ticket) :

- `docs/features.md` — spec fonctionnelle
- `docs/models-spec.md` — spec data/modèles. **Les 62 modèles de premier niveau y sont désormais
  mentionnés, et `scripts/check-models-spec.mjs` (Repo CI) casse si un nouveau ne l'est pas**
  (TCK-310, ex-dette D-18 : 16 modèles y manquaient). ⚠ La garde vérifie qu'un **nom** apparaît,
  jamais qu'il est bien décrit — c'est un plancher, pas une preuve de justesse.

**Backlog** : `docs/backlog/` → `INDEX.md` + `tickets/TCK-NNN-<slug>.md`.

> **`INDEX.md` est GÉNÉRÉ** depuis les frontmatters par `node docs/backlog/gen-index.mjs`.
> Ne jamais l'éditer à la main — éditer le frontmatter du ticket, puis régénérer.
> `node docs/backlog/check-backlog.mjs` garde sa fraîcheur, et la CI rejoue les deux.
>
> *Pourquoi :* l'INDEX était maintenu à la main, et il était **faux sur 213 de ses 266 entrées
> (80,1 %)**. Il affichait 40 tickets à faire et 177 en review là où les frontmatters en comptaient
> 3 et 2. Le premier ticket de sa colonne « Todo » — la convention documentée pour « implémente la
> tâche suivante » — était `done` depuis trois mois. *Aucune liste maintenue à la main ne reste
> juste ; seule une liste dérivée le reste.*

**Format ticket** : frontmatter YAML (`id`, `title`, `status`, `phase`, `family`, `estimate`,
`created`, `updated`, `depends_on`, `blocks`, `spec_refs`, `tags`, `wave`) + corps.

**Règles** :

1. Un ticket décrit un delta, pas la spec — il pointe vers elle via `spec_refs`.
2. `depends_on` → autres tickets uniquement. Un ticket ne démarre pas tant que ses dépendances ne
   sont pas `done`.
3. Après merge d'un ticket qui modifie une spec : `/sync-specs`.
4. **Le statut vaut pour ce qui est mergé sur `dev`.** Une branche non mergée, c'est `doing`.

## Décisions d'architecture

`docs/adr/` — un ADR numéroté par décision structurelle, index dans `docs/adr/README.md`.

**Toute nouvelle décision structurelle s'écrit en ADR AVANT l'implémentation.** Le dépôt a vécu
jusqu'ici sans aucun ADR : 32 décisions structurelles avaient été prises et se retrouvaient
dispersées entre quatre documents de spec, les tickets du backlog (dont l'écrasante majorité est
archivée en `done`), des fichiers de
CI et des commentaires de code. Une décision qui ne vit que dans un ticket clos est une décision
perdue — et deux d'entre elles étaient déjà **contredites par la documentation** qui prétendait les
décrire.

## Conventions par dossier

Chargées à la demande quand on travaille dedans :

- **`takussan-api/CLAUDE.md`** — contrôleur de base et enveloppe JSON, `HasQueryBuilder`, autorisation
  par capacités et profils polymorphes, pagination, pièges déjà payés.
- **`takussan-web/CLAUDE.md`** — `apiFetch` vs `apiRequest` vs `useApiQuery` (et le piège `/api`),
  route handlers BFF, design system, i18n, conventions de composants.

Deux règles sont assez coûteuses pour être rappelées ici :

**Le préfixe `/api` n'est pas symétrique.** `apiFetch` l'ajoute tout seul ; `apiRequest` et
`useApiQuery` **non** — l'appelant l'écrit. L'oubli ne produit pas un 404 propre mais un
`net::ERR_FAILED` par CORS (Laravel n'expose que `api/*`), ce qui envoie chercher le défaut au mauvais
endroit. Rien dans le typage ni le lint ne l'empêche.

**Sparse fieldsets obligatoires.** Le backend utilise `spatie/laravel-query-builder`. Toute lecture
depuis le front passe `fields[table]=…` avec les seules colonnes de la vue, filtre par `filter[…]`
côté serveur (jamais côté client sur une liste déjà récupérée), et charge les relations par
`include=`. Référence complète : `docs/spatie-query-builder.md`.

```
filter[status]=active            filter[search]=mot clé        filter[price_min]=50000
sort=-created_at                 include=address,owner         include=bookingsCount
fields[properties]=id,title      per_page=20
```

## Principes non négociables

Décidés délibérément. Les violer est une régression, pas un choix de style.

1. **Le rôle est un profil polymorphe, pas une permission.** `spatie/laravel-permission` a été
   **désinstallé** (TCK-278) et remplacé par des profils (`OwnerProfile`, `AgentProfile`,
   `AgencyAdminProfile`, `BrokerProfile`, `ServiceProviderProfile`, `PlatformProfile`), une enum
   `Capability` de 44 cas `<domaine>.<verbe>`, et `MembershipCapabilityResolver` — table de vérité
   définie en code, additive (OR entre profils). Une garde CI casse sur tout import
   `Spatie\Permission\`. *Des docblocks décrivent encore le mécanisme supprimé : ne pas les croire
   (dette D-21).*

2. **L'agence est la frontière d'isolation.** Une capacité se juge toujours pour un couple
   *(utilisateur, agence)*. Le profil actif est résolu par `ResolveActiveProfile` et lu via
   `request()->activeProfile()`. `users.agency_id` **n'existe plus** en base (TCK-142) — l'accesseur
   `User::getAgencyIdAttribute()` est un pont de compatibilité, pas une colonne.

3. **Le montant est décimal en base, entier ×100 à la frontière du driver de paiement.** XOF n'a pas
   de sous-unité : chaque driver local doit re-diviser par 100. *Cette règle n'était écrite dans
   aucune spec — seulement dans un commentaire (dette D-22).*

4. **Une migration se pense pour PostgreSQL, et il n'y a plus qu'un moteur.**

   ⚠ **Ce principe disait l'inverse jusqu'au 2026-08-21** — *« une migration se pense pour MySQL,
   jamais pour SQLite »*, la suite tournant sur SQLite et la production sur MySQL 8.0. Il est
   **révoqué par [ADR-0020](docs/adr/0020-postgresql-sur-tous-les-environnements.md)**, qui pose
   PostgreSQL 17 sur *tous* les environnements, **suite de tests comprise**. SQLite et MySQL ne
   sont plus des variantes supportées ; `phpunit.xml` force `pgsql` sans repli, comme il force
   déjà `SCOUT_DRIVER`.

   **Le gain principal n'est pas PostgreSQL, c'est que la base de test EST celle de la
   production.** La divergence « tests permissifs, production stricte » que le bloc de pièges
   ci-dessous existait pour compenser **n'existe plus** : ce que la suite éprouve est ce
   que la production exécutera. Le job CI qui rejouait le DDL sur le moteur réel a donc changé de
   raison d'être — il ne garde plus que les `down()` (voir plus bas).

   Écrire un `down()` juste n'est pas une politesse : c'est le seul code dont on ait besoin le jour
   où un déploiement tourne mal, et **la suite de tests n'en exécute toujours aucun**. Le job
   `migrations-pgsql` en couvre **15 sur 135** — ceux au-dessus de la borne TCK-278, dont le
   `down()` est délibérément irréversible. *Ne pas lire ce job comme « les `down()` sont
   couverts ».* Il affiche son compte à chaque exécution, et la ligne qui le recompte est dans son
   propre commentaire.

5. **Le front possède le texte affiché.** L'API émet des codes et des données ; les libellés passent
   par next-intl (`fr`/`en`/`wo`). *Tenu à 82 fichiers sur 875 : la règle est une intention, pas un
   état (dette D-24).*

### Migrations — les pièges PostgreSQL, et ceux qui ont disparu

**Ce bloc a été entièrement remesuré le 2026-08-21, pendant la bascule.** Les pièges qu'il liste
sont ceux que le chantier a réellement payés — pas une liste recopiée d'ailleurs. *Un piège qu'on
n'a pas payé n'a pas sa place dans ce fichier : il fait perdre du temps à qui le lit sans jamais
rien attraper.*

1. **Une erreur ABANDONNE la transaction entière — et c'est le piège le plus coûteux.**
   Après le moindre échec, PostgreSQL refuse toute commande jusqu'au `ROLLBACK` :
   `SQLSTATE[25P02] current transaction is aborted, commands ignored until end of transaction
   block`. MySQL et SQLite laissaient continuer.

   Conséquence directe : **tout code qui attrape une exception SQL et poursuit dans la même
   transaction est cassé.** Et comme `RefreshDatabase` enveloppe chaque test dans UNE transaction,
   le message accuse la première requête innocente venue, jamais la coupable — dont l'erreur, elle,
   n'apparaît que dans le journal du serveur :

   ```bash
   docker compose logs --since 2m postgres | grep ERROR | grep -v 25P02
   ```

   ```php
   ❌ try { Modele::create($x); } catch (UniqueConstraintViolationException) { /* déjà là */ }
   ✓ Modele::query()->insertOrIgnore($x + ['created_at' => $n, 'updated_at' => $n]);
   ```

   *Une exception attendue dans le cas NOMINAL n'est pas un mécanisme de contrôle.*

2. **`FOR UPDATE` est refusé sur un agrégat.** `->lockForUpdate()->count()` et
   `->lockForUpdate()->sum(…)` lèvent `SQLSTATE[0A000]`.

   ⚠ **Ne pas corriger la syntaxe : corriger le verrou.** Verrouiller les lignes *existantes* ne
   ferme aucune course d'INSERT concurrent — MySQL le faisait par un verrou d'intervalle en
   REPEATABLE READ, effet de bord du moteur que personne n'avait écrit. Le point de sérialisation
   portable est la **ligne parent** :

   ```php
   ❌ $total = $property->collaborators()->lockForUpdate()->sum('commission_share');
   ✓ Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();
     $total = $property->collaborators()->sum('commission_share');
   ```

3. **Nom d'index/FK auto-généré > 63 caractères** — et PostgreSQL ne REFUSE pas, il **tronque**,
   avec un simple `NOTICE`. L'index existe alors sous un nom que Laravel ne calculera jamais, et
   c'est le `dropIndex()` d'une migration future qui échouera, sur un index « introuvable » qui est
   pourtant là. La limite était 64 sous MySQL : **un nom de 64 exactement passait et ne passe
   plus.**

   ```php
   ✓ $table->index(['long_col_1', 'long_col_2'], 'short_explicit_name_idx');
   ✓ $table->foreignId('col')->constrained('table', 'id', 'short_fk_name');
   ```

4. **`jsonb`, jamais `json`.** Le type `json` de PostgreSQL n'a **aucun opérateur d'égalité** :
   `DISTINCT`, `GROUP BY` et `UNION` y sont impossibles, et aucun index GIN ne s'y pose. Les 69
   colonnes du dépôt sont en `jsonb` depuis ADR-0020. La conversion est gratuite tant que la table
   est vide, et c'est un `ALTER` sous `ACCESS EXCLUSIVE` ensuite.

5. **Une longueur de `VARCHAR` est APPLIQUÉE.** SQLite n'en appliquait aucune : un
   `string('country', 2)` acceptait sept caractères, et un test pouvait asserter un comportement
   que le schéma interdit. `SQLSTATE[22001] value too long`.

6. **`nextval()` n'est pas transactionnel.** Le `ROLLBACK` de `RefreshDatabase` rend les lignes,
   **jamais les numéros** : un identifiant ne repart pas à 1 au test suivant, contrairement à
   SQLite. *Un identifiant écrit en dur dans un test n'affirme pas une valeur, il affirme une
   propriété du moteur.*

7. **Deux colonnes homonymes ne sont plus arbitrées en silence.** `select('t.*')` plus un
   `withCount('relation')` dont l'alias porte le nom d'une colonne réelle rendent deux colonnes de
   même nom : MySQL et SQLite en choisissaient une, PostgreSQL refuse
   (`ORDER BY … is ambiguous`). Aliaser explicitement.

8. **Une clé étrangère n'est PAS indexée automatiquement.** InnoDB créait un index sur toute
   colonne portant une FK ; PostgreSQL non. Les 177 FK du dépôt étaient indexées gratuitement,
   aucune ne l'est. À indexer **par mesure** (`EXPLAIN`) et non en masse — en commençant par les
   colonnes `agency_id`, l'agence étant la frontière d'isolation. *C'est la contrepartie du piège
   MySQL n°2 qui disparaît : plus rien ne refuse un `dropIndex`, et plus rien ne sert les
   requêtes.*

**Les pièges MySQL qui ont DISPARU** — ne plus les chercher : `DEFAULT` sur `JSON`/`TEXT` (accepté
par PostgreSQL), `dropUnique`/`dropIndex` sur une colonne portant une FK (voir n°8), et la limite
de 64 caractères (devenue 63, et silencieuse — voir n°3). L'interdiction d'`enum()` (ADR-0007)
**reste**, mais pour sa raison propre : un `string()` plus un contrôle applicatif se fait évoluer,
un type SQL énuméré non.

## Design & UI

Pour tout travail d'interface, lire et appliquer **[`docs/design-guidelines.md`](docs/design-guidelines.md)**.

Direction retenue : **« Ancrage Local Contemporain »** — palette Lin (`--background #fcf9f3`,
`--primary #a85332`, `--accent #5d6e4f`), typographie Bricolage/DM Sans, quatre variantes de cartes
(Standard / Listing / Cover / Compact). Les primitives sont **shadcn style `base-nova` sur
`@base-ui/react`** — il n'y a **aucune** dépendance Radix dans ce projet.

⚠️ `docs/plans/routing-layouts-roles.md` prescrit une palette (« Takussan Heritage ») et une stack
(Next 14, Tailwind v3) **entièrement révoquées**. Ne pas s'en servir.

## Workflows

Deux voies équivalentes — `.windsurf/workflows/` ou `.claude/commands/` :

- `/write-spec` — crée un ticket, ne touche jamais au code.
- `/implement-spec` — implémente un ticket, ne modifie jamais les specs.
- `/sync-specs` — fait converger `docs/features.md` et `docs/models-spec.md`.

Si l'utilisateur demande « crée un ticket » ou « implémente TCK-NNN » sans slash command, lire
directement le workflow correspondant.

**Les compétences vivent sous `.agent/skills/`, et nulle part ailleurs.** Les deux voies ci-dessus
n'en sont que des relais : elles pointent toutes deux vers `.agent/workflows/`, qui pointe vers
`.agent/skills/`. Une compétence se corrige donc là, une seule fois.

> Un second répertoire, `.agents/` — 602 fichiers, suivi par git, référencé par aucun fichier du
> dépôt — a coexisté avec lui pendant trois mois (TCK-303, ardoise D-46). Le coût n'a pas été la
> duplication, mais le doute : le 2026-05-18, la correction « `spatie/laravel-permission` a été
> retiré, les capacités sont résolues par `MembershipCapabilityResolver` » y a été écrite. Elle
> était **juste**, et elle est tombée dans la copie que personne ne charge. Pendant trois mois,
> tout agent qui implémentait un ticket a lu qu'il fallait employer un paquet désinstallé sur
> lequel la CI casse à l'import. *Un répertoire mort n'est pas inerte : il absorbe les
> corrections.* `scripts/check-skills-dir.mjs` refuse désormais toute compétence de ce dépôt
> hors du canonique — quel que soit le nom du répertoire qui la porte.

## Où vont les fichiers

Tout document de conception va sous `docs/`, **jamais à la racine**. `docs/adr/` pour les décisions,
`docs/backlog/` pour les tickets, `docs/plans/` pour les plans d'implémentation, `docs/qa/` et
`docs/smoke-tests/` pour les campagnes. `docs/ardoise.md` porte les dettes.

**`AGENTS.md` ne duplique plus ce fichier** — il y renvoie. Deux fichiers d'instructions divergents à
la racine, c'est un mensonge qui attend son lecteur.
