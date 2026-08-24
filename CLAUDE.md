# CLAUDE.md

Guide de travail pour Claude Code (claude.ai/code) et tout autre agent sur ce dépôt.

## Ce qu'est ce dépôt

Monorepo **Takussan** — plateforme de gestion immobilière (Sénégal, XOF, français/anglais/wolof).

- `takussan-api/` — Laravel 13, PHP ^8.4 (`config.platform.php` figé à 8.4.1)
- `takussan-web/` — Next.js 16.3.1, React 19, TypeScript 5, Tailwind CSS 4

## État courant

**Le projet n'est pas un squelette.** Cette précision ouvre le fichier parce que la version
précédente de ce document affirmait le contraire — *« skeleton vierge »*, *« scaffold vierge
(create-next-app) »* — **pendant 118 jours** et 308 commits. *Un document d'entrée qui ment coûte
plus cher que l'absence de document : on ne s'en méfie pas.*

Ce qui existe réellement — **ordres de grandeur**, non des comptes à tenir à jour :

| | `takussan-api/` | `takussan-web/` |
|---|---|---|
| Code | ~770 fichiers PHP · ~62 000 lignes dans `app/` | ~870 fichiers `.ts`/`.tsx` dans `src/` |
| Surface | ~535 routes · ~160 contrôleurs · 70 modèles | ~110 pages · ~30 route handlers BFF · 20 modules de server actions |
| Données | 135 migrations · 38 factories · 48 fichiers de seeders | — |
| Tests | ~380 fichiers · **~2740 tests, verts sur PostgreSQL** *(2026-08-22)* | ~190 fichiers · **~1330 tests, verts** *(2026-08-22)* |

> **Le compte exact se prend à la source**, jamais ici : `php artisan test`, `npm run test`,
> `find … | wc -l`. *Une précision qu'on ne peut pas tenir n'est pas de la rigueur, c'est une dette
> de rigueur* — [pourquoi ce tableau est arrondi](docs/journal-des-corrections.md#j-01).

**Le backlog est vidé, pas en cours.** Le compte ne s'écrit pas ici — il se prend :

```bash
node docs/backlog/check-backlog.mjs --report   # compte par statut + la liste des ouverts
```

> *Aucune liste maintenue à la main ne reste juste ; seule une liste dérivée le reste* —
> [l'INDEX était faux sur 80 % de ses entrées](docs/journal-des-corrections.md#j-07).

**Ce qui est vert.** Backend : Pint propre, suite entière verte sur PostgreSQL. Frontend : ESLint
0 erreur, `tsc --noEmit` propre, suite verte. Les trois régressions qui vivaient sur `dev` au
2026-08-12 — dont une violation Pint qui bloquait toute la CI depuis six semaines, Pint tournant
*avant* les tests — sont corrigées.

**Le temps de référence de la suite backend : 470 à 610 s**, deux mesures le 2026-08-22 (468 s puis
612 s) sur ~2740 tests / ~8800 assertions / 0 échec, 8 cœurs, machine au repos. **La fourchette est
le chiffre honnête.**

⚠️ **« Au repos » est une condition de la mesure, pas une formule de style : le facteur mesuré est
d'environ 11.** Un temps de suite pris sous charge ne dit rien du dépôt — il dit ce que la machine
faisait d'autre. **Relever les trois moyennes d'`uptime` et `sysctl -n hw.ncpu` à côté du chiffre**,
et ne pas se fier à la moyenne à 1 minute : elle retombe en premier.

> Les quatre références successives (313 s, 204-235 s, 648 s, 470-610 s), ce qu'elles mesuraient et
> pourquoi **elles ne se soustraient pas** : [J-09](docs/journal-des-corrections.md#j-09).

**La couverture est gardée par un cliquet à 86 %** sur les lignes de `app/`, évalué par
`bin/coverage-gate.php` sur le clover (TCK-331). Dernière mesure : **86,9 %** le 2026-08-22.
[L'historique des mesures et des resserrements](docs/journal-des-corrections.md#j-02).

⚠️ **Ne pas resserrer le seuil sur une mesure locale.** Xdebug (local) et PCOV (CI) ne comptent pas
les mêmes lignes exécutables : *resserrer un cliquet sur une mesure prise par un autre pilote, c'est
fabriquer un rouge de CI qui n'apprend rien.* Le resserrement se décide sur un chiffre de CI.

⚠️ **`php artisan test --coverage --min=86` n'est PAS la forme de la CI et ne juge pas du cliquet** —
deux défauts mesurés le rendent capable de dire « vert » sans avoir rien mesuré. Signature à
retenir : *une commande de couverture qui sort en 0 sans imprimer de ligne `Total:` n'a pas mesuré
la couverture.* [Le détail des deux défauts](docs/journal-des-corrections.md#j-10).

**`--parallel` est validé, et deux agents peuvent la lancer en même temps** (TCK-321, TCK-322,
TCK-334) — mesuré sur cinq paires simultanées sur la suite entière, 0 échec des deux côtés, cinq
fois sur cinq. ⚠ Ça n'en fait pas la commande du quotidien : deux exécutions parallèles demandent
16 cœurs à une machine qui en a 8. C'est le **rituel de fin de branche**, machine au repos ; pour la
boucle quotidienne, `php bin/impacted-tests.php --run`.

**`--parallel` n'est pas activé en CI, et c'est un résultat, pas un défaut** : le gain y est de
×2,48 (mesuré), mais une seule exécution porte les tests **et** la couverture, et PCOV agrège mal
entre processus. Le gain est réel et inutilisable dans la forme actuelle de la CI.

> [Les trois causes successives qui ont bloqué `--parallel`](docs/journal-des-corrections.md#j-11)
> — chacune masquait la suivante, et la dernière a montré qu'*un mécanisme d'isolation jamais
> appelé n'échoue pas : un autre le couvre, plus mal, et le vert reste vert.*
> [Le gain en CI et son obstacle](docs/journal-des-corrections.md#j-12).

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
php artisan test                    # ⚠ PostgreSQL, plus SQLite (ADR-0020) : `phpunit.xml` force
                                    #   `pgsql` SANS REPLI. `docker compose up -d postgres` est un
                                    #   prérequis dur, au même titre que Meilisearch. La base est
                                    #   créée PAR PROCESSUS (`Tests\Support\TestDatabase`).
                                    #   Référence : 470-610 s au repos (cf. § État courant).
php artisan test --filter=Foo
php artisan test --parallel         # RITUEL DE FIN DE BRANCHE, machine au repos — pas la boucle
                                    #   quotidienne. Deux agents peuvent la lancer en même temps
                                    #   (TCK-322, TCK-334). NON activée en CI : cf. § État courant.
php bin/impacted-tests.php --run    # ← LA commande du quotidien : ne lance que les tests que le
                                    #   diff touche, via tests/impact-map.json (carte dérivée d'un
                                    #   rapport de couverture, jamais éditée à la main). Mesuré par
                                    #   ablation : 4 classes en 16,7 s.
                                    #   ⚠ Un vert ici NE DIT RIEN de la suite : c'est une boucle de
                                    #   retour, pas une garde. La CI et le rituel de fin de branche
                                    #   jouent la suite entière, toujours.
XDEBUG_MODE=coverage php vendor/phpunit/phpunit/phpunit \
  --coverage-clover=storage/coverage/clover.xml
php bin/coverage-gate.php storage/coverage/clover.xml --min=86
                                    # le CLIQUET de la CI, dans sa forme EXACTE (TCK-302, TCK-331).
                                    #   Exige un pilote de couverture : PCOV en CI, Xdebug en local.
                                    #   ⚠ La VARIABLE D'ENVIRONNEMENT, pas `-d xdebug.mode=…`.
                                    #   Il lit le clover et fait ÉCHOUER bruyamment un rapport
                                    #   absent, tronqué, ou qui n'a mesuré aucune ligne : `0/0`
                                    #   n'est pas 100 %, c'est une mesure absente.
                                    #   ⚠⚠ NE PAS juger du cliquet avec `artisan test --coverage
                                    #   --min=86` : cf. § État courant et J-10.
./vendor/bin/pint                   # ← AVANT CHAQUE COMMIT. Rien ne l'impose : c'est une
                                    #   violation d'un seul fichier qui a cassé la CI six semaines.
php artisan migrate
php artisan migrate:fresh --seed    # 48 fichiers de seeders, ~260 s, ~840 biens. SANS médias par
                                    #   défaut (`SEED_DOWNLOAD_MEDIA=false` des deux côtés depuis
                                    #   TCK-301). Détail + vérification des séquences :
                                    #   docs/journal-des-corrections.md#j-13
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

> **Pourquoi une commande et pas une liste :** une liste de gardes écrite à la main est juste le
> jour où on l'écrit — c'est le défaut que la moitié d'entre elles existent pour attraper ailleurs.
> Chacune porte son motif et son histoire dans son propre en-tête ; c'est là qu'il faut lire.
> `.github/workflows/repo-ci.yml` les rejoue toutes à chaque PR.
> [Ce bloc a cité deux gardes sur douze](docs/journal-des-corrections.md#j-03).

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
> sur tous les environnements, **suite de tests comprise**. Deux points de l'ADR gouvernent du code :
>
> - L'image est `pgvector/pgvector:pg17` et non `postgres:17` — l'extension doit être *disponible*
>   partout dès maintenant, alors qu'aucune table ne l'utilise, sinon le motif se referme en silence
>   le jour du chatbot (TCK-344).
> - La base est créée en `--encoding=UTF8 --locale=C` : collation **déterministe**, décision la plus
>   lourde de l'ADR, dont dépend le sens de six contraintes d'unicité sur texte.
>
> ⚠️ **Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
> d'installation — qui le vise.** C'est pourquoi la constante de `scripts/check-db-engine.mjs`
> s'appelle **`CIBLE` et non `PROD`** : il n'existe **aucune** production PostgreSQL à mesurer
> (D-04). [Le dépôt a tourné six semaines sur le mauvais moteur pour l'avoir
> déduit](docs/journal-des-corrections.md#j-04).

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

> ⚠️ **Le relevé des drivers réellement déclarés par les environnements déployés vit dans
> [`docs/infra/prod-drivers.json`](docs/infra/prod-drivers.json), et NULLE PART AILLEURS** — il
> était recopié dans trois documents qui se contredisaient, dont un qui se contredisait lui-même.
> `CACHE_STORE=redis` n'est plus un écart avec la production depuis TCK-300.
> [Détail](docs/journal-des-corrections.md#j-05).

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
  ⚠ Ce journal ne disait **pas** de quel côté était l'écart — secret périmé, compte absent, *grant*
  manquant se ressemblent tous ici. **La mesure a été prise le 2026-08-24, en se connectant, et
  l'écart tient en un caractère :**

  ```
  $ grep DB_USERNAME /var/www/takussan/shared/.env      → takussan_prod   (13 caractères)
  $ mysql -N -e 'SELECT user, LENGTH(user) FROM mysql.user WHERE user LIKE "takussan%";'
    takussan_pre  12
    takussan_pro  12                                    ← le compte qui EXISTE
  $ mysql -N -e 'SHOW GRANTS FOR "takussan_pro"@"localhost";'
    GRANT ALL PRIVILEGES ON `takussan_prod`.* TO `takussan_pro`@`localhost`
  ```

  La base existe, les droits sont posés — au nom d'un compte que le `.env` n'écrit pas. *Deux
  identifiants qui diffèrent d'un caractère ne se vérifient pas en les relisant :* `LENGTH()` a
  tranché en une commande ce que huit jours de relecture n'avaient pas attrapé. Le détail, et ce
  que la bascule PostgreSQL y change, sont dans TCK-288.

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

> ⚠️ **Une mesure sans sa date devient une croyance.** Chaque affirmation ci-dessus porte sa
> commande et son 2026-08-20 : c'est ce qui permettra de savoir, la prochaine fois, ce qui est
> périmé plutôt que de le supposer juste. Ce paragraphe a été faux deux fois, de la même manière —
> [dont une fois DANS la correction qui l'énonçait](docs/journal-des-corrections.md#j-06).

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
> [Pourquoi : il était faux sur 80 % de ses entrées](docs/journal-des-corrections.md#j-07).

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

9. **`lower()` ne replie que l'ASCII — et c'est le piège qui a coûté le plus cher après coup.**
   `lower()` emprunte la collation de son argument, et la base est en `--locale=C` (ADR-0020) :
   `lower('CAFÉ')` rend **`cafÉ`**. Un index `LOWER(col)` posé pour refuser les variantes de casse
   laisse donc passer `CAFÉ` à côté de `Café` — ce qui était le cas des trois index de
   `2026_08_21_130000` pendant un jour, et de six requêtes applicatives.

   ```php
   ❌ ->whereRaw('LOWER(email) = ?', [strtolower($email)])      // ASCII des DEUX côtés
   ✓ ->whereRaw(CaseInsensitive::sql('email').' = ?', [CaseInsensitive::fold($email)])
   ```

   **`App\Support\CaseInsensitive` porte la forme, et ses deux méthodes vont par paire** :
   `sql()` rend `LOWER(col COLLATE "und-x-icu")`, `fold()` fait `mb_strtolower`. Replier d'un
   seul côté déplace le défaut au lieu de le corriger — `strtolower()` de PHP est ASCII-only
   exactement comme `lower()` nu ([ADR-0025](docs/adr/0025-repli-de-casse-par-collation-icu.md)).

   ⚠ **Une requête doit écrire EXACTEMENT l'expression de l'index, sinon elle ne l'emprunte pas** :
   mesuré sur 5000 lignes, `LOWER(name COLLATE "und-x-icu") = ?` rend un `Index Scan`, `LOWER(name)
   = ?` un `Seq Scan`. Index et requêtes bougent ensemble ou pas du tout.

   ⚠ Ça ne replie **pas** les accents, délibérément : `Café` ≠ `Cafe`, reconduction d'ADR-0020 §2.

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

> ⚠️ **Un répertoire mort n'est pas inerte : il absorbe les corrections.** `.agents/` a coexisté
> trois mois avec le canonique ; une correction juste y a été écrite et personne ne l'a lue.
> `scripts/check-skills-dir.mjs` refuse désormais toute compétence de ce dépôt hors du canonique,
> quel que soit le nom du répertoire — mais elle ne voit pas les compétences de fournisseur, et le
> motif s'est reproduit en 2026-08 sur `.claude/skills/`.
> [L'histoire des deux occurrences](docs/journal-des-corrections.md#j-08).

## Où vont les fichiers

Tout document de conception va sous `docs/`, **jamais à la racine**. `docs/adr/` pour les décisions,
`docs/backlog/` pour les tickets, `docs/plans/` pour les plans d'implémentation, `docs/qa/` et
`docs/smoke-tests/` pour les campagnes. `docs/ardoise.md` porte les dettes, et
[`docs/journal-des-corrections.md`](docs/journal-des-corrections.md) le **pourquoi** des
règles de ce fichier.

**Ce fichier porte la RÈGLE, le journal porte le RÉCIT.** Les renvois `#j-NN` ci-dessus
mènent à ce qu'une règle a coûté : ce qu'un document affirmait, ce que la mesure a rendu.
Une règle ne quitte jamais ce fichier — c'est ce qui empêche le journal de devenir un
répertoire mort ([J-08](docs/journal-des-corrections.md#j-08)). **L'ouvrir avant de
trancher** quand on s'apprête à resserrer un seuil, recopier un compte à la main, ou
déduire l'état d'un environnement d'un fichier de configuration.

**`AGENTS.md` ne duplique plus ce fichier** — il y renvoie. Deux fichiers d'instructions divergents à
la racine, c'est un mensonge qui attend son lecteur.
