# Journal des corrections

**Ce fichier porte le POURQUOI. `CLAUDE.md` porte la RÈGLE.**

Chaque entrée ici est le récit d'une erreur mesurée : ce qu'un document affirmait, ce que la mesure
a rendu, et ce que ça a coûté. La règle qui en découle, elle, est restée dans le `CLAUDE.md`
concerné, en une ligne, avec un renvoi vers l'entrée correspondante.

**Pourquoi cette séparation.** Les trois `CLAUDE.md` du dépôt pesaient **37 210 tokens** — plus que
tout le reste du contexte de démarrage réuni (harnais, outils, mémoire). Mesuré le 2026-08-22 sur
les compteurs des 19 sessions du dépôt : un démarrage médian à **48 936 tokens**, dont ~32 % pour
ces trois fichiers, avant le premier mot de travail. Or 33 à 39 % de leur volume était de
l'archéologie — juste, précieuse, et relue intégralement à chaque session par un agent qui n'en
avait pas besoin pour la tâche du jour.

⚠️ **Ce n'est PAS une mise au rebut, et le motif compte.** Ce dépôt a déjà payé le prix d'un
répertoire mort qui absorbe les corrections — `.agents/`, 602 fichiers, trois mois (D-46, cf.
[J-10](#j-10)). Un journal que personne n'ouvre reproduirait exactement ça. La parade tient en une
contrainte : **la règle ne quitte jamais `CLAUDE.md`.** Ce qui part d'ici est l'histoire qui la
justifie, jamais l'instruction qui l'applique. Un agent qui ne lit jamais ce fichier travaille
correctement ; il travaille seulement sans savoir ce que ces règles ont coûté.

**Et la contrepartie est réelle** : c'est ce coût-là qui fait qu'on ne les enfreint pas à la
légère. Quand un renvoi ci-dessous croise ce que tu t'apprêtes à faire — resserrer un seuil,
recopier un compte à la main, déduire l'état d'un environnement d'un fichier de configuration —
**ouvre l'entrée avant de trancher.**

---

## Racine — `CLAUDE.md`

### <a id="j-01"></a>J-01 — Pourquoi les ordres de grandeur sont arrondis délibérément

Les chiffres du tableau « ce qui existe réellement » sont **arrondis délibérément**. La version
précédente annonçait « 875 fichiers `.ts`/`.tsx` » — faux dans le commit qui l'écrivait, puisque ce
même commit en supprimait sept.

Ce tableau existe pour établir un ORDRE DE GRANDEUR (« ce dépôt n'est pas un squelette »), et une
précision à l'unité sur une valeur qui bouge à chaque commit ne sert pas cet objet : elle ne fait
qu'offrir une prise à l'erreur. Le compte exact se prend à la source : `php artisan test`,
`npm run test`, `find … | wc -l`.

*Une précision qu'on ne peut pas tenir n'est pas de la rigueur, c'est une dette de rigueur.*

Le même défaut, un cran plus bas, a frappé le compte de tickets : un paragraphe donnait 265 tickets
et 3 `todo` quand `check-backlog.mjs --report` en comptait 270 et 7 — les cinq manquants étant ceux
que le commit lui-même ajoutait. Un agent qui suit « prendre le premier ticket de Todo » sur une
liste amputée travaille sur la mauvaise tâche sans jamais l'apprendre.

### <a id="j-02"></a>J-02 — La couverture, ses re-mesures, et pourquoi le seuil ne bouge pas

**Historique des mesures.** 86,16 % sur SQLite (2026-08-16, `app/`, 768 fichiers : 21 148 / 24 544
lignes, méthodes 66,87 %, classes 43,81 %). Le seuil a été resserré de 85 à 86 le 2026-08-16, la CI
ayant confirmé 86,3 % au premier passage (PR #176) — la marge de 85 couvrait un doute sur le PCOV
du runner, ce doute est levé. Surcoût mesuré du cliquet : **+36 %** (83 s → 113 s).

**Remesurée sur PostgreSQL le 2026-08-21 : 86,8 %** (21 893 / 25 218 lignes exécutables). Le
cliquet tient avec plus de marge qu'avant — le chantier ADR-0020 a supprimé du code que rien
n'exécutait (un branchement par driver mort, un garde-fou applicatif injoignable) davantage qu'il
n'en a ajouté. Durée sous Xdebug : **1414 s (23 min 34)**, contre 641 s sans couverture.

**Re-mesurée le 2026-08-22, après le lot de la vague 45 : 86,9 %** (22 014 / 25 323 lignes
exécutables), toujours sous Xdebug en local, cliquet `--min=86` franchi, sortie 0, sur
`Tests: 2736, Assertions: 8791, Skipped: 2`.

⚠ **Le seuil n'est PAS resserré, et c'est délibéré.** Ces 86,8 et 86,9 % sont pris sous **Xdebug en
local**, quand la CI mesure sous **PCOV** — les deux pilotes ne comptent pas exactement les mêmes
lignes exécutables. *Resserrer un cliquet sur une mesure prise par un autre pilote, c'est fabriquer
un rouge de CI qui n'apprend rien.* Le resserrement se décide sur un chiffre de CI, comme le
2026-08-16.

Le seuil garde contre l'**érosion** ; il ne dit pas que 86 % suffit, et une méthode traversée sans
assertion y compte pour couverte.

### <a id="j-03"></a>J-03 — Pourquoi les gardes se listent au lieu de s'énumérer

Ce bloc a cité **deux** gardes sur douze pendant que le dépôt en accumulait dix autres, et il n'y
avait aucun moyen de s'en apercevoir : une liste écrite à la main est juste le jour où on l'écrit.

C'est exactement le défaut que la moitié de ces gardes existent pour attraper ailleurs — D-15 sur
`INDEX.md`, D-44 sur les modèles indexables, D-18 sur `models-spec.md` — et il vivait dans le
document qui les présente.

Elles vérifient toutes la même chose sous des formes différentes : **qu'un document dérivé suit
encore sa source, et que la source suit encore la réalité.** Chacune porte son motif et son
histoire dans son propre en-tête ; c'est là qu'il faut lire.

### <a id="j-04"></a>J-04 — MariaDB pendant six semaines, ou l'erreur que ce dépôt a payée deux fois

Le compose et la CI ont tourné sur `mariadb:11.4` du 2026-06-29 au 2026-08-13 parce qu'un
commentaire affirmait que la prod sortait d'un `apt install mariadb-server` — commande que
personne n'avait exécutée. Mesuré sur le serveur ce jour-là : `mysql-server 8.0.46`. Pas un écart
de version, **le mauvais moteur**.

*Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
d'installation — qui le vise.*

C'est pourquoi la constante de `scripts/check-db-engine.mjs` s'appelle **`CIBLE` et non `PROD`** :
il n'existe **aucune** production PostgreSQL à mesurer (D-04), et une constante nommée `PROD`
inviterait à croire qu'elle a été relevée quelque part. Le jour où le serveur existe (TCK-288), la
première chose à faire est de le mesurer et de comparer.

⚠ **Cette leçon a été apprise DEUX FOIS.** Voir [J-08](#j-08) : la correction qui l'énonçait a
vieilli exactement de la même manière que l'erreur qu'elle corrigeait.

### <a id="j-05"></a>J-05 — `CACHE_STORE=redis`, et le relevé recopié dans trois documents

`CACHE_STORE=redis` n'est **plus** un écart avec la production depuis TCK-300 (2026-08-16) : les
deux `.env` livrés déclarent `redis` pour le cache et la session. Ce qui reste vrai, c'est que
`.env.example` seul ne provisionne rien — `docker-compose.yml` s'en charge, et c'est précisément sa
raison d'être.

Le relevé des drivers réellement déclarés par les environnements déployés était recopié dans
**trois documents qui se contredisaient, dont un qui se contredisait lui-même**. Il vit désormais
dans [`docs/infra/prod-drivers.json`](infra/prod-drivers.json), et nulle part ailleurs.

### <a id="j-06"></a>J-06 — Le paragraphe `master` réécrit trois fois, et pourquoi

Ce paragraphe a déjà servi une fois de leçon. Sa version initiale écrivait « la production ne
reçoit plus rien depuis trois mois », déduite du **YAML** du workflow et non de son historique
d'exécution ; la correction concluait *« ne jamais déduire l'état d'un environnement de la
configuration qui le vise »* (cf. [J-04](#j-04)).

**La correction elle-même a vieilli exactement de la même façon.** Ses chiffres — `master` figée au
2026-05-18, 31 commits de retard, `deploy.yml` absent de `master` — ont été mesurés une fois, le
2026-08-12, puis recopiés comme s'ils étaient une propriété du dépôt. **Ils sont devenus faux TROIS
JOURS plus tard** : le 2026-08-15, `master` recevait `fefe2c87`, la chaîne de déploiement, deux
tentatives de déploiement et un site public. Re-mesuré le 2026-08-20 :

| Ce que le fichier écrivait | Mesuré le 2026-08-20 |
|---|---|
| `master` « figé au 2026-05-18 » | `fefe2c87 2026-08-15 14:56:07 +0000` (*Merge PR #151*) |
| « 31 commits derrière `dev` » | **273** |
| « ne contient même pas la chaîne de déploiement » | `deploy.yml` **présent** |

Cinq jours de plus, et **rien dans ce fichier ne pouvait le signaler** — la phrase gardait l'aplomb
du jour où elle avait été juste.

*Une mesure sans sa date devient une croyance.* Chaque affirmation du paragraphe actuel porte donc
sa commande et sa date : c'est ce qui permettra de savoir, la prochaine fois, ce qui est périmé
plutôt que de le supposer juste.

### <a id="j-07"></a>J-07 — L'INDEX du backlog, faux sur 80 % de ses entrées

`docs/backlog/INDEX.md` était maintenu à la main, et il était **faux sur 213 de ses 266 entrées
(80,1 %)**. Il affichait 40 tickets à faire et 177 en review là où les frontmatters en comptaient
3 et 2.

Le premier ticket de sa colonne « Todo » — la convention documentée pour « implémente la tâche
suivante » — était `done` depuis trois mois.

*Aucune liste maintenue à la main ne reste juste ; seule une liste dérivée le reste.*

### <a id="j-08"></a>J-08 — `.agents/`, le répertoire mort qui absorbait les corrections

Un second répertoire de compétences, `.agents/` — 602 fichiers, suivi par git, référencé par aucun
fichier du dépôt — a coexisté avec le canonique pendant trois mois (TCK-303, ardoise D-46).

Le coût n'a pas été la duplication, mais le doute. Le 2026-05-18, la correction
« `spatie/laravel-permission` a été retiré, les capacités sont résolues par
`MembershipCapabilityResolver` » y a été écrite. Elle était **juste**, et elle est tombée dans la
copie que personne ne charge. Pendant trois mois, tout agent qui implémentait un ticket a lu qu'il
fallait employer un paquet désinstallé sur lequel la CI casse à l'import.

*Un répertoire mort n'est pas inerte : il absorbe les corrections.*

`scripts/check-skills-dir.mjs` refuse désormais toute compétence de ce dépôt hors du canonique —
quel que soit le nom du répertoire qui la porte.

⚠️ **Le motif s'est reproduit le 2026-08-22, un cran plus bas, et la garde ne pouvait pas le
voir.** `.claude/skills/` contenait 77 compétences `bmad-*`/`wds-*` **identiques à l'octet près** à
celles de `.windsurf/skills/` (même empreinte agrégée `ae3ff0c7`, `diff -r` sans un écart, 16 Mo et
1 579 fichiers chacune, même commit d'origine `35658e88`), dont 12 **triplées** dans
`.agent/skills/`. La garde restait verte : elle ne contrôle que les 15 compétences **écrites par ce
dépôt** et ignore les 166 de fournisseur.

Le coût n'était pas le disque : Claude Code injecte le nom et la description de chaque compétence
dans **chaque** session, soit **~3 800 tokens** mesurés, pour **0 invocation** de `bmad-*`/`wds-*`
sur 19 sessions (quand `code-review` en compte 29). `.claude/skills/` a été retiré ; la copie
`.windsurf/skills/` demeure.

### <a id="j-09"></a>J-09 — Les références de temps de la suite backend

Le bloc de commandes empilait **cinq** références successives. Une seule est opérationnelle ; les
autres sont conservées ici parce qu'on les cite encore en comparaison — **et parce qu'elles ne se
soustraient pas les unes aux autres.**

| Date | Suite | Durée | Conditions |
|---|---|---|---|
| 2026-08-15 | 2056 tests, SQLite | **313 s** | avant le correctif D-44 |
| 2026-08-16 | ~2320 tests, SQLite | **204-235 s** | deux mesures, machine au repos, 8 cœurs |
| 2026-08-21 | 2668 tests / 8616 assertions, PostgreSQL | **648 s** | load 2,93 → 4,63 ; 335,70 s user + 29,66 s system |
| 2026-08-22 | ~2740 tests / ~8800 assertions, PostgreSQL | **470-610 s** | deux mesures (468 s puis 612 s), 8 cœurs |

⚠ **Elles ne se comparent pas entre elles** : ni le même nombre de tests, ni le même moteur, ni la
même instance Meilisearch (le lot du 2026-08-22 a épinglé le conteneur 1.16 au lieu d'une instance
native 1.36 partagée avec un autre projet). Aucune ablation n'a isolé la part de chacun.

**Le passage à PostgreSQL coûte ~×2,8 sur SQLite, et c'est le PRIX de la propriété achetée** : ce
que la suite éprouve est ce que la production exécutera. La piste si ce coût devenait
insupportable — NON empruntée, faute de nécessité démontrée — est `CREATE DATABASE … TEMPLATE` :
migrer une base modèle une fois, la cloner par processus.

**Le facteur de charge est d'environ 11.** Le 2026-08-16, sur cette même machine à 8 cœurs, la même
commande (PHPUnit sous PCOV, à la virgule près) a rendu **1240 s** sous `load average` 200-258 —
vitest et ESLint d'agents voisins, plus le langage server PHP de l'IDE à ~230 % de CPU — et
**113 s** deux heures plus tard à load 4-8. Un test individuel passait de ~0,1 s à 2-3 s.

⚠ **« Machine au repos » ne se lit PAS sur la moyenne à 1 minute** : elle retombe en premier, et
c'est la charge des minutes précédentes que la suite subit encore. Relever les TROIS moyennes de
`uptime`, plus `sysctl -n hw.ncpu` — sans eux, un chiffre ne veut plus rien dire six mois plus tard.

### <a id="j-10"></a>J-10 — Le cliquet de couverture, et les deux défauts d'`artisan test`

Le cliquet n'est plus le `--min` d'`artisan test` depuis TCK-331 (2026-08-20). La CI invoque PHPUnit
directement et évalue le seuil dans un step à part, sur le **clover**. Deux raisons mesurées :

**(a) La double option.** `artisan test --coverage` passe déjà `--coverage-php` à PHPUnit en
interne. Une seconde occurrence est écartée, le rapport ne se matérialise jamais, `--min` n'a rien
à évaluer, et la commande sort en **1 sans imprimer un chiffre**, sur une suite verte à 86,33 %.

**(b) L'ordre des arguments — le plus coûteux.** `artisan test` appelle `ignoreValidationErrors()` :
la **première** option que Symfony ne connaît pas interrompt l'analyse et fait perdre **toutes les
suivantes en silence**. Re-mesuré le 2026-08-20 sur `--filter`, même test, même pilote Xdebug, une
seule variable — l'ordre :

```
$ XDEBUG_MODE=coverage php artisan test --coverage --min=86 --filter=CurrencyRuleTest
    Total: 0.7 %
    FAIL  Code coverage below expected: 0.7 %. Minimum: 86.0 %.        → sortie 1

$ XDEBUG_MODE=coverage php artisan test --filter=CurrencyRuleTest --coverage --min=86
    Tests: 2 passed (11 assertions)
    (aucune ligne « Total: », aucune table)                            → sortie 0
```

**La seconde forme dit « vert » en n'ayant rien mesuré.** Retenir la signature plutôt que la règle :
*une commande de couverture qui sort en 0 sans imprimer de ligne `Total:` n'a pas mesuré la
couverture* — quelle que soit l'option qui l'a avalée.

`coverage-gate.php` lit le clover, rend le même nombre à la décimale (mesure appariée), et fait
échouer bruyamment un rapport absent, tronqué, ou qui n'a mesuré aucune ligne : `0/0` n'est pas
100 %, c'est une mesure absente.

### <a id="j-11"></a>J-11 — `--parallel` : trois causes successives sous le même symptôme

La restriction « un seul agent à la fois » a tenu du 2026-08-17 au 2026-08-22. Trois causes se sont
succédé sous le même symptôme, **et chacune a caché la suivante** :

1. **Les vues compilées** (TCK-322, 2026-08-17). Deux `--parallel` simultanés : l'un passait,
   l'autre **mourait au démarrage** sur `mkdir(): File exists`. Ce n'était pas ParaTest : le rappel
   `setUpProcess` de Laravel crée `storage/framework/views/test_<index worker>` dans le processus
   **parent**, là où le jeton composé de TCK-321 — posé dans `tests/bootstrap.php` — n'atteint
   jamais. Enracinées par exécution depuis (`Tests\Support\TestCompiledViews`). `--tmp-dir` ne
   corrigeait rien : ce répertoire n'est pas celui de ParaTest.
2. **La file de tâches Meilisearch** (TCK-334, 2026-08-20). La paire sur la suite entière rendait
   38 et 37 erreurs, *toutes* des `MeilisearchNotIdleException`, quand une seule exécution rendait
   0 échec en 108 s au même repos. Le diagnostic était juste ce jour-là — et il n'est plus
   reproductible, parce qu'entre-temps :
3. **ADR-0020 a cassé `--parallel` entièrement**, le 2026-08-21, et personne ne l'a mesuré. Pas
   sous simultanéité : **seul**, sur n'importe quel test touchant la base. Une paire rendait
   **2553 erreurs de chaque côté**. TROIS mécanismes nommaient ou créaient la base de test là où le
   dépôt croyait n'en avoir qu'un — le sien, celui de ParaTest qui recompose le nom, et
   `MigrateCommand` qui crée en silence toute base pgsql absente.

   Le plus coûteux des trois n'était pas celui qui cassait : `TestDatabase::ensureCreated()` était
   accrochée à `Tests\CreatesApplication`, **que `Tests\TestCase` n'emploie pas**. Elle n'a donc
   **jamais tourné dans un test**, et c'est `MigrateCommand` qui créait les bases en silence — sans
   horodatage, donc à jamais hors de portée du balayage des orphelines. **Mesuré le 2026-08-22 :
   130 bases orphelines, dont 0 horodatée, 1 926 Mo.**

   > *Un mécanisme d'isolation qui n'est jamais appelé n'échoue pas : un autre le couvre, plus mal,
   > et le vert reste vert.* Même enseignement que les trois ablations de `BaseFormRequest`.

**La mesure qui lève la restriction** — cinq paires de `php artisan test --parallel` simultanées sur
la suite ENTIÈRE, 8 cœurs, chacune partie machine au repos :

| Paire | `load average` au départ | Durée | A et B |
|---|---|---|---|
| 1 | 2,60 | 4 min 06 | `Tests: 2736, Assertions: 8791, Skipped: 2` · sortie **0** |
| 2 | 5,73 | 6 min 47 | idem · sortie **0** |
| 3 | 5,78 | 8 min 04 | idem · sortie **0** |
| 4 | 5,85 | 8 min 11 | idem · sortie **0** |
| 5 | 5,45 | 7 min 46 | idem · sortie **0** |

Cinq fois sur cinq, 0 échec des deux côtés, zéro `MeilisearchNotIdleException` sur dix exécutions.
⚠ Les durées croissent parce que les paires s'enchaînent et que la charge héritée ne retombe pas
entre elles — *le chiffre qui compte ici est le code de sortie, pas le chronomètre.*

**Ce que la barrière Meilisearch a changé au passage** (TCK-334) : elle abandonnait après 10 s
d'attente, quelle qu'en fût la raison. Elle abandonne désormais après 10 s **de silence du
serveur** — `GET /batches?limit=1`, champ `progress`. Aucun plafond n'est relevé : c'est la
*grandeur mesurée* qui a changé. Le chiffre qui l'ancre : le plus long batch **légitime** de
l'historique du serveur dure **8,24 s pour une seule tâche**, et pendant ces 8,2 s le compte de
tâches en attente reste FIGÉ — un détecteur de stagnation fondé sur le COMPTE aurait donc été
*pire* que le plafond qu'il remplaçait.

**L'historique du symptôme (D-44, 2026-08-15).** `waitForMeilisearch()` **abandonnait en silence**
au bout de 10 s — une boucle qui `return` sans lever, sans assertion, sans trace — pendant que la
suite s'infligeait elle-même un backlog de **3308 tâches d'indexation**. Le test enchaînait sur un
index à moitié construit et rougissait sur une assertion métier parfaitement juste, en accusant le
code applicatif. La suite lancée seule rendait 2056 passés / 0 échec ; lancée en concurrence,
12 échecs, puis 4 sur un ensemble **différent**, sans qu'un fichier ait changé. Union : 14 tests
distincts, tous Meilisearch, qui relancés seuls passaient 22/22.

*À lire deux fois : c'est le correctif D-44 qui a rendu le diagnostic de 2026-08-20 possible.* La
barrière lève désormais, compte les tâches en attente index par index, et nomme elle-même la cause
probable. **Le diagnostic était dans l'erreur.**

### <a id="j-12"></a>J-12 — `--parallel` en CI : un gain réel et inutilisable

Mesuré le 2026-08-18 sur le runner `ubuntu-latest`, `nproc` **4**, AMD EPYC 7763, load 1,05 au
départ :

| suite | durée | sortie |
|---|---|---|
| séquentielle | **206 s** | 0 · 2552 passés |
| `--parallel` | **83 s** | 0 · 2554 tests, 8069 assertions |

**Gain ×2,48**, bien au-dessus de la barre de ~1,5× que TCK-324 posait. **L'obstacle n'est pas le
gain** : une SEULE exécution de la suite porte à la fois les tests **et** le cliquet `--min=86`, et
PCOV agrège mal entre processus. Paralléliser cette exécution revient à abandonner le cliquet ;
l'ajouter en second passage coûte 83 s de plus, pas 123 s de moins, puisque la couverture reste le
chemin critique.

*Le gain est réel et inutilisable dans la forme actuelle de la CI* — ce n'est pas « ça ne vaut pas
le coup ». Ce qui changerait la réponse : sortir le cliquet du job de PR. Détail : ardoise **D-30**.

### <a id="j-13"></a>J-13 — Le seed, les médias, et les séquences PostgreSQL

`php artisan migrate:fresh --seed` mesuré sur PostgreSQL le 2026-08-21 : **262 s**, sortie 0,
836 biens / 305 utilisateurs / 4 agences, 0 erreur, et **aucune séquence désynchronisée** — vérifié
en insérant une ligne applicative dans 5 tables semées, parce que *la panne des séquences ne se voit
qu'au PREMIER insert suivant, pas au seed lui-même.*

`SEED_DOWNLOAD_MEDIA` vaut `false` des DEUX côtés (`.env.example` ET `.env.docker`) depuis TCK-301.
Il valait `true`, et décidait pour tout nouveau clone de **1000 à 2700 requêtes HTTP**. `true`
reste valable, mais c'est un choix : les échecs sont alors comptés, imprimés, et `db:seed` sort en
erreur au-delà de 10 % — *un jeu partiel ne se déclare plus complet.*

---

## Backend — `takussan-api/CLAUDE.md`

### <a id="j-20"></a>J-20 — `scopeFilter`, le doublon inerte, et `scopeWithSearch`, le doublon inférieur

**`scopeFilter` (TCK-307, 2026-08-17).** Le DSL maison `BaseModelTrait::scopeFilter(Builder, array)`
coexistait avec spatie sur les **mêmes** modèles — `AbstractModel` composait les deux traits — et une
version du `CLAUDE.md` le réservait « aux usages internes (jobs, commandes, services) ». Mesuré :
**zéro appelant** dans tout le dépôt, contre **46 `buildQuery()`** dans les seuls contrôleurs. Il
n'avait pas d'usage interne, il n'avait aucun usage — sauf le test qui le testait.

Ce qui coûtait n'était pas les dix-neuf lignes, c'était l'**ambiguïté** : deux mécanismes également
disponibles sur le même modèle ne se lisent pas « un vivant, un mort », ils se lisent « deux
conventions, choisis ». Qui prenait le mauvais écrivait du code qui **marchait** et qui sortait du
contrat de lecture — ni sparse fieldsets, ni `include=`, ni routage Scout, ni tri déclaré.

**`scopeWithSearch` (TCK-326, 2026-08-20).** Le second scope du même trait a subsisté à TCK-307 —
hors de son périmètre. Même motif, un cran plus coûteux : ce n'était pas un doublon inerte mais un
doublon **INFÉRIEUR**.

| Chemin | Ordre de pertinence | Sort |
|---|---|---|
| `BaseModelTrait::scopeWithSearch()` — le DSL maison | **perdu** (`whereIn`, aveu dans son propre docblock) | **supprimé** |
| `HasQueryBuilder` `filter[search]` — toute surface d'API | **restitué** (TCK-281) | seul survivant |

Monté sur les 68 modèles d'`AbstractModel`, également disponible, il rendait une recherche tolérante
aux fautes mais **classée par date** — exactement le défaut que TCK-281 a corrigé sur l'autre chemin.
Le docblock l'avertissait ; *l'appelant ne lit pas le docblock, il lit la liste des méthodes
disponibles.*

Ré-inventorié sur le dépôt entier avant suppression : **0 appelant** en `app/`, `routes/`,
`database/`, `bin/`, `config/`, **0** côté `takussan-web/`, **0** invocation dynamique
(`->scopes([…])`, `call_user_func`, `->{$méthode}`) — les 5 seuls appels vivaient dans
`tests/Feature/Search/ScoutSearchTest.php`, le test qui le testait. Son helper `isSearchable()`
n'avait qu'un appelant : le scope lui-même. `BaseModelTrait` est devenu vide et a été supprimé avec
eux ; `AbstractModel` = `Model` + `HasQueryBuilder`.

`scripts/check-filtering-single-mechanism.mjs` garde les deux suppressions **par FORME autant que
par nom** : le contrôle C refuse tout scope à paramètre `array` qui déroule des `where()` en boucle ;
le contrôle D refuse tout scope de `app/` qui entre par Scout (`::search(`) et recompose dans
Eloquent (`whereIn`/`whereRaw`/`keys`), **même renommé**. Prouvé par mutation, cf. l'en-tête de la
garde. ⚠ Elle ne voit **pas** le filtrage ad hoc en contrôleur ; il y en a, et certains sont
délibérés (TCK-281, « Hors périmètre »).

### <a id="j-21"></a>J-21 — Les abilities qui refusaient tout le monde sans le dire

**`BasePolicy` DÉSIGNE ses capacités, il ne les nomme plus** (TCK-297). Il concaténait
`$this->resource().'.view'` — et trois familles de chaînes ainsi produites n'existaient dans aucun
cas de `Capability` : `*.view` (l'enum n'en a aucun, sur aucun domaine), `properties.update` et
`leases.update|delete` (l'enum sépare `update_any`/`update_own`), et `media.*` en entier.

Or **une ability non définie ne lève pas, elle refuse** : ces abilities refusaient tout le monde sauf
le super-admin, **sans trace**.

Une policy déclare désormais `viewCapability()` / `createCapability()` / `updateCapability()` /
`deleteCapability()`, typées `?Capability` — la faute est devenue **inexprimable**. `null` signifie
« pas gardé par capacité », ce qui refuse : *lire n'est pas un privilège catalogué*, c'est le
périmètre d'agence qui le porte (principe non négociable n°2).

Deux gardes tiennent la propriété : `tests/Unit/Policies/BasePolicyCapabilityTest.php` (la liste des
sous-classes est **dérivée** de `app/Policies/`, pas recopiée) et
`tests/Unit/Authorization/CapabilityStringLiteralsTest.php`, qui tokenise `app/` et casse sur tout
littéral de forme `<domaine>.<verbe>` passé à `can()`/`authorize()` sans cas d'enum correspondant. Le
tokenizer n'est pas un raffinement : un `grep` sur la même recherche rend trois faux positifs (un
docblock, un commentaire de test, un nom de route Laravel).

**Les trois docblocks qui décrivaient encore spatie ont été corrigés** — `HasProfiles` (« Sister
trait of HasRoles »), `LeasePolicy` (« permission `leases.renew` (Spatie) ») et `bootstrap/app.php`
(« sole owner of the spatie team context »). Le package n'existe plus depuis TCK-278 ; si un
commentaire le mentionne encore ailleurs, il décrit un mécanisme supprimé.

### <a id="j-22"></a>J-22 — Un inventaire qui cherche des noms mesure les noms qu'il connaît

**TCK-306.** Le `CLAUDE.md` annonçait « 38 contrôleurs, 124 appels » d'autorisation ad hoc (au
2026-08-12) ; la re-mesure du 2026-08-17 en a trouvé **25 et 88** — surestimé d'un tiers.

Mais le grep qui les comptait cherchait `authorizeAccess`/`authorizeManage`, et la garde
`check-controller-authorization.mjs` — qui cherche une **forme** (`function authorize*`,
`ensureCan*`, `check*Access*`) et non deux noms — a trouvé **19 helpers de plus, sous 19 noms
différents** (`authorizeAdmin`, `authorizeLeaseManage`, `authorizeAttach`…) dans 15 autres
contrôleurs.

*Un inventaire qui cherche des noms mesure les noms qu'il connaît.* Ces 19-là sont hors périmètre de
TCK-306 et inscrits dans les exemptions justifiées de la garde : la dette est comptable, elle n'est
plus invisible.

**Deux pièges payés pendant la migration, à connaître avant d'en déplacer une de plus :**

1. **Vérifie sur quelle règle chaque appel tombait vraiment.** `DocumentController` et
   `DocumentVersionController` définissaient tous deux un `authorizeManage()`, sur le **même
   modèle**, avec des règles **différentes** — l'un le téléverseur seul, l'autre déléguant à la règle
   de lecture. Les mapper tous les deux sur `update` aurait rendu 403 là où l'endpoint répondait 200.
2. **Une policy jamais liée est ignorée, pas bruyante.** L'ability retombe sur le défaut de la Gate
   et refuse tout le monde sauf le super-admin, sans trace. Inscris-la dans
   `AppServiceProvider::bootGatesAndPolicies()` — la garde le vérifie.

### <a id="j-23"></a>J-23 — Une convention qui n'existe que dans un document n'a jamais rien freiné

Deux sections du `CLAUDE.md` backend ont énoncé une règle pendant des mois **en la voyant se dégrader
sous elles**. C'est le même enseignement, payé deux fois, et c'est la raison d'être des gardes qui
les tiennent aujourd'hui.

**Validation (TCK-305, ardoise D-32).** La section disait « deux conventions, et laquelle choisir »,
et tranchait déjà pour le code neuf. Mesuré le 2026-08-17 : **120 `$request->validate()` inline**
dans 58 contrôleurs, **511 champs de règles**, contre 74 FormRequest — et une **troisième** forme que
le compte ne voyait pas (`validator([...], [...])->validate()`).

**Pagination.** La section disait déjà « ces quatre clés, et elles seules ». Mesuré le 2026-08-17 :
**57 contrôleurs et 1 service** recopiaient la forme, avec `total` 88 fois, `current_page` 67,
`last_page` 51, `->perPage()` 40. Un tiers des endpoints émettait `total` sans `per_page`. La dette
grossissait à la vitesse à laquelle on écrit des contrôleurs : 44 fichiers au 2026-08-12, 58 quatre
jours plus tard.

*Une convention qui n'existe que dans un document est lue une fois, par ceux qui la respectaient
déjà.*

Deux symptômes de la pagination valent d'être retenus, parce qu'ils sont muets tous les deux :
`takussan-web/src/types/api.ts` déclarait `links` **obligatoire** quand 52 endpoints sur 57 ne
l'émettaient pas — *un type de réponse n'est vérifié par rien* ; et
`BaseTestCase::assertJsonStructurePaginated()` l'exigeait aussi, ce qui explique qu'**aucun test ne
l'appelait** : il aurait rougi sur presque toute l'API. `links` a été retiré des 5 endpoints qui
l'émettaient, après vérification qu'aucun code du front ne le lit.

### <a id="j-24"></a>J-24 — `BaseResource` : la garde couvre l'héritage, pas l'emploi

Étendre `BaseResource` ne veut pas dire employer ses cinq helpers, et la migration a été un **échange
de parent, rien d'autre** : 72 insertions, 72 suppressions, deux lignes par fichier, aucun corps de
`toArray()` touché.

C'est délibéré, et c'est ce qui rend l'opération sûre sur le point le plus cher du dépôt —
`BaseResource` n'offre **aucun helper de montant**, il ne peut donc pas en changer la représentation
(principe non négociable n°3 : XOF n'a pas de sous-unité).
`tests/Unit/Http/Resources/AmountRepresentationTest.php` fige ce point, et il a été vérifié par
ablation (un `× 100` glissé dans une ressource le fait rougir).

**Ce que TCK-327 a soldé.** Les dates sortaient de ces mêmes fichiers sous **trois chaînes
distinctes** — mesuré le 2026-08-20 : 138 lignes, 55 `toISOString()` (`…T12:34:56.000000Z`),
37 `toIso8601String()`, 28 `iso()` et 18 `toDateString()`. Le défaut n'était pas cosmétique :
`PlatformPayout::period_start`, casté `date`, sortait en `2026-08-17T00:00:00+00:00` quand
`PayoutResource` et `BankStatementResource` émettaient le **même champ, sur le même cast**, en
`2026-08-17`. Converti, décidé en ADR-0018, gardé par `check-resource-date-format.mjs`, figé par
`DateRepresentationTest.php`.

**Restent non gardés** : `enumValue`, `enumLabel` et `mediaUrl`. Même famille, mais chacun a son
propre coût de contrat, et aucun n'a encore été mesuré.

### <a id="j-25"></a>J-25 — 516 routes déplacées, prouvées par diff et non par relecture

Un namespace qui bouge et une route qui bouge **se ressemblent dans un diff**, et seule la seconde
casse les clients. Le déplacement a donc été prouvé par comparaison de `php artisan route:list`
avant/après : **516 routes, diff vide** sur la méthode, l'URI, le nom et les middlewares ; 24 actions
réécrites, toutes du seul préfixe de namespace.

*Un déplacement de code qui ne se compare pas se relit — et une relecture ne prouve rien sur
516 lignes.*

### <a id="j-26"></a>J-26 — `takussan:` contre `platform:`, et pourquoi l'alias survit

`takussan:create-super-admin` était le seul `takussan:` sur 16 commandes — un nom de dépôt, qui ne
partitionne rien puisque tout ce qui est ici lui appartient. Elle s'appelle désormais
**`platform:create-super-admin`** (TCK-309, ex-dette D-38), sous le même domaine que sa jumelle
`platform:grant-super-admin`. Les deux ne font d'ailleurs pas le même travail : la première **crée**
l'opérateur (user + 2FA + codes de secours), la seconde **promeut** un user existant.

⚠️ **L'ancien nom reste un alias déprécié, et ce n'est pas de la prudence** : `docs/features.md`
§2.1 le prescrit encore à l'installation d'un environnement, et ce document ne se modifie pas depuis
un ticket d'implémentation. *Renommer une commande qu'un document de référence prescrit, c'est
fabriquer une panne pour le jour de l'installation — et ce jour-là, personne ne pensera à `git log`.*

L'alias avertit à chaque invocation. Il se retire dans cet ordre : mettre `docs/features.md` à jour,
retirer `$aliases`, puis vider `ALIAS_DEPRECIES_TOLERES` dans la garde — qui **rougit si l'alias
disparaît sans qu'on l'y ait déclaré**.

### <a id="j-27"></a>J-27 — Trois classes de base de test, et une instance Meilisearch étrangère

**Il y en avait TROIS** : `TestCase` → `BaseTestCase` → `ApiTestCase`, en chaîne, sans qu'aucun
document ne dise laquelle étendre. `BaseTestCase` n'avait **pas d'usage propre** — elle portait
`actingAsRole()` et deux assertions JSON que rien ne réservait aux tests non-API. Le partage qui en
résultait ne suivait donc aucune règle, seulement l'ordre d'écriture : 49 classes d'un côté, 38 de
l'autre, la même chose des deux. Elle a été **fondue dans `Tests\TestCase` et supprimée**.

*Deux emplacements également plausibles ne restent pas deux : le suivant lit le désordre comme un
précédent, et la quatrième base arrive sans que personne n'ait rien décidé.* Une quatrième se
justifie par un quatrième **usage** — et elle se déclare alors dans `BASES_CANONIQUES`, sinon la CI
casse.

**L'instance Meilisearch était celle du `.env`, et c'était vrai avec deux conséquences que personne
n'avait relevées avant de les mesurer** (2026-08-22) :

1. le `.env` de cette machine visait le port **canonique** 7700, servi par une instance **native
   brew** dont `GET /indexes` rendait 12 index, **dont `documents` et `messages` sans aucun
   préfixe** — ils appartiennent à un autre projet. La suite partageait donc sa **file de tâches**
   avec un logiciel tiers. L'isolation par préfixe (`TestSearchIndex`) sépare les *documents* ; elle
   ne sépare pas la file, et c'est la file que la barrière surveille (TCK-334) ;
2. `GET :7700/version` → **1.36.0** quand le conteneur et la CI tiennent **1.16** : vingt versions
   mineures d'écart sur le moteur de recherche, décidées par personne.

`phpunit.xml` épingle désormais `MEILISEARCH_HOST` et `MEILISEARCH_KEY`, pour la même raison que
`DB_HOST`/`DB_PORT` : *une suite qui dépend du `.env` ne mesure pas le code, elle mesure la machine.*

---

## Frontend — `takussan-web/CLAUDE.md`

### <a id="j-40"></a>J-40 — Une garde morte pendant que `tsc` et `next build` restaient verts

Le scan i18n employait l'API compilateur de TypeScript. `typescript@7` — le portage Go, en
`dist-tag: latest` — ne l'exporte plus côté Node, et **la garde est morte le jour du bump, pendant
que `tsc --noEmit` et `next build` restaient verts tous les deux.**

Rebrancher sur un autre analyseur tiers aurait reproduit la même exposition un nom de paquet plus
loin. `scripts/check-i18n.mjs` embarque donc un lexeur TS/TSX écrit **dans le dépôt, sans
dépendance** (TCK-323, ardoise D-55). L'équivalence avec l'ancienne version est **mesurée**, pas
déduite : mêmes 3 542 occurrences sur les 409 fichiers concernés, une à une, et les 21 cas de
`i18n-scan.test.ts` inchangés.

**Sur le compte de la dette i18n (D-24) : les chiffres ne s'écrivent pas dans le `CLAUDE.md`.** Une
version antérieure annonçait « 82 fichiers sur 875 » et « 1376 clés fr/en », deux comptes faux — le
second comptait les nœuds de l'arbre JSON, pas les clés traduisibles. Le compte se prend à la
source : `node scripts/check-i18n.mjs --report`.

⚠️ **`useTranslations` dans un fichier n'est PAS un indicateur d'achèvement** : 18 fichiers
importent next-intl ET portent encore du texte en dur, jusqu'à 34 occurrences dans un seul
(`admin-agency/AgencyConfigForm.tsx`). *Un tableau de bord qui compterait les imports mentirait
exactement comme l'INDEX maintenu à la main* (cf. [J-07](#j-07)).

### <a id="j-41"></a>J-41 — Les deux plafonds de vitest, et pourquoi ils ne se rabaissent pas

**Le plafond par test : 20 s** (`vitest.config.ts`, TCK-312). Les 5000 ms précédents étaient le
*défaut de vitest*, jamais choisi pour cette suite : quatre tests de la console super-admin en
sortaient dès que la suite backend tournait en même temps. Aucun test ne dépasse **1000 ms au
repos**, mais les tests d'interaction `userEvent` ralentissent d'un facteur **12 à 17× sous
contention CPU** — le coût est en O(frappes), ~4,5 ms par caractère.

**Le délai propre des attentes : 3000 ms** (`vitest.setup.ts`, TCK-313). Il gouverne chaque
`waitFor` / `findBy*`, là où `testTimeout` gouverne le test entier. Les 1000 ms précédents étaient le
défaut de Testing Library. Au repos, 95 % des attentes tiennent en **150 ms** et la pire en
**467 ms** — mais cette même attente a été mesurée à **980 ms** quelques minutes plus tard, sur le
même code, parce que d'autres agents travaillaient : *la marge annoncée valait ce que la machine
faisait d'autre.*

**Ablation** : à 1000 ms, `Integrations` rougit 2/2 sous charge 287-331 avec un message qui accuse le
composant ; à 3000 ms, 38/38 sous la même charge. Le coût est **+2 s par test rouge** (une attente
qui ne sera jamais satisfaite brûle son plafond en entier) et **zéro sur une exécution verte**.

Le détail des mesures est dans le commentaire de `vitest.setup.ts` — le relever exige de les refaire.

### <a id="j-42"></a>J-42 — Le frontend a vécu sans aucune CI, 53 à 94 jours

Le frontend n'a eu **aucune CI** jusqu'au 2026-08-12 : une erreur ESLint bloquante, une erreur
TypeScript et un test en échec ont vécu sur `dev` pendant **53 à 94 jours** sans que rien ne les
signale.

`web-ci.yml` les attrape désormais — mais `npm run build` seul ne suffit toujours pas (il ne lance
pas ESLint sous Next 16, et il n'existe aucun script `typecheck`), et c'est pour ça que les trois
commandes sont listées séparément.

### <a id="j-43"></a>J-43 — `allowedDevOrigins` : la panne muette de Next 16

Servi sur `http://127.0.0.1:<port>`, le front rendait son HTML, affichait son CSS… et **React ne
s'hydratait jamais** : 13 × 403 sur `/_next/static/chunks/*`, WebSocket HMR en échec, et le
formulaire de connexion soumis en **GET natif** — mesuré le 2026-08-20, le mot de passe part alors
dans l'URL (`/auth/login?email=…&password=…`).

Next 16 bloque ses ressources de développement pour tout hôte absent d'`allowedDevOrigins`, dont la
valeur par défaut ne contient que `localhost` et `**.localhost`. `next.config.ts` déclare désormais
`allowedDevOrigins: ['127.0.0.1', '[::1]']` (TCK-328, ardoise D-57).

- **`[::1]` s'écrit avec ses crochets** : Next compare `new URL(origin).hostname`, qui rend
  `"[::1]"`. Écrit `'::1'`, l'entrée ne matche rien — mesuré.
- **Restreint à la boucle locale, délibérément.** Ni IP de LAN, ni joker : ces ressources n'ont pas
  à être atteignables depuis le réseau.
