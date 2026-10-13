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
0 erreur, `tsc --noEmit` propre, suite verte.

**Temps de référence de la suite backend : 470 à 610 s** (2026-08-22, ~2740 tests, 8 cœurs,
**machine au repos**). Sous charge, le facteur mesuré est d'environ ×11 : relever les trois moyennes
d'`uptime` et `sysctl -n hw.ncpu` à côté de tout chiffre, sans se fier à la moyenne à 1 minute
([les quatre références successives, qui ne se soustraient pas](docs/journal-des-corrections.md#j-09)).

**La couverture est gardée par un cliquet à 86 %** sur les lignes de `app/`, évalué par
`bin/coverage-gate.php` sur le clover (TCK-331 ; 86,9 % le 2026-08-22 — [historique](docs/journal-des-corrections.md#j-02)).

- ⚠️ **Ne pas resserrer le seuil sur une mesure locale** : Xdebug (local) et PCOV (CI) ne comptent
  pas les mêmes lignes exécutables. Le resserrement se décide sur un chiffre de CI.
- ⚠️ **`php artisan test --coverage --min=86` n'est PAS la forme de la CI et ne juge pas du
  cliquet** : *une commande de couverture qui sort en 0 sans imprimer de ligne `Total:` n'a pas
  mesuré la couverture* ([J-10](docs/journal-des-corrections.md#j-10)).

**`--parallel` est validé, y compris lancé par deux agents en même temps** (TCK-321, TCK-322,
TCK-334), mais c'est le **rituel de fin de branche**, machine au repos — deux exécutions demandent
16 cœurs à une machine qui en a 8. La boucle quotidienne reste `php bin/impacted-tests.php --run`.
Il n'est **pas** activé en CI, et c'est un résultat : une seule exécution y porte les tests **et** la
couverture, et PCOV agrège mal entre processus ([J-11](docs/journal-des-corrections.md#j-11), [J-12](docs/journal-des-corrections.md#j-12)).

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

Images et déploiement — **le runbook complet vit dans [`docs/infra/hebergement.md`](docs/infra/hebergement.md)**
(ADR-0028) :

```bash
deploy/takussan/smoke-api.sh image   # l'image de l'API, seule
deploy/takussan/smoke-api.sh pile    # la pile Compose de Dokploy, contre les services de docker-compose.yml
deploy/takussan/smoke-web.sh         # l'image du front (exige ./dev.sh api)
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

`docker-compose.yml` sert **PostgreSQL 17 (avec pgvector), Meilisearch, Redis et Mailpit** — le
pourquoi de chaque service est dans l'en-tête du fichier.

> **PostgreSQL 17 partout depuis le 2026-08-21, suite de tests comprise**
> ([ADR-0020](docs/adr/0020-postgresql-sur-tous-les-environnements.md)). Deux points gouvernent du
> code : l'image est `pgvector/pgvector:pg17` (l'extension doit être *disponible* avant qu'une table
> l'utilise — TCK-344), et la base est créée en `--encoding=UTF8 --locale=C`, collation
> **déterministe** dont dépend le sens de six contraintes d'unicité sur texte.
>
> ⚠️ **Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
> d'installation — qui le vise.** D'où la constante **`CIBLE` et non `PROD`** de
> `scripts/check-db-engine.mjs` : il n'existe aucune production PostgreSQL à mesurer (D-04).
> [Six semaines sur le mauvais moteur](docs/journal-des-corrections.md#j-04).

**Les ports sont décalés d'un cran** (5433, 7701, 6380, 1026/8026), pour cohabiter avec les services
brew natifs. `./dev.sh doctor` signale un `.env` qui vise encore le port canonique : ce cas ne
produit aucun rouge (ce sont les services brew qui répondent), mais plus rien de ce que
`docker-compose.yml` garantit ne s'applique — `takussan-api/.env` est ignoré par git, le dépôt ne
peut que l'afficher (D-48).

**`.env.docker` est l'environnement de développement, `.env.example` est le contrat des clés** —
il ne reproduit aucun environnement et ne démarre pas seul hors docker. `scripts/check-env-parity.mjs`
garde la parité des **clés** (jamais des valeurs), `scripts/check-webhook-env-keys.mjs` ce qu'elle ne
voit pas : une clé absente des DEUX fichiers (TCK-296).

> ⚠️ **Les drivers réellement déclarés par les environnements déployés vivent dans
> [`docs/infra/prod-drivers.json`](docs/infra/prod-drivers.json), et NULLE PART AILLEURS**
> ([J-05](docs/journal-des-corrections.md#j-05)) — régénéré depuis Dokploy depuis le 2026-09-14 (TCK-527) ; les *clés* de
> chaque environnement sont dans `docs/infra/hebergement.md`.

`./dev.sh` sonde ce que le `.env` déclare et nomme ce qui ne répond pas : sans lui, un service
déclaré et absent ne produit aucune erreur lisible — l'API démarre, et c'est la première requête
qui meurt.

## Workflow git

**`dev` est la branche d'intégration** et la branche par défaut du dépôt : toutes les PR la ciblent.

**`master` sert le site public** : un merge vers `master` déploie le front en production par
l'intégration Git Vercel ([ADR-0017](docs/adr/0017-deploiement-du-front-pilote-par-vercel.md),
[`docs/infra/frontend-deploiement.md`](docs/infra/frontend-deploiement.md)). Y pousser est une
**action sortante**, pas un rangement de branche. `master` est un ancêtre strict de `dev` : un
merge y est un *fast-forward*.

> ⚠️ **Depuis le 2026-09-13, [ADR-0028](docs/adr/0028-auto-hebergement-conteneurise-sur-le-vps.md)
> remplace ADR-0017 et la chaîne `deploy.yml` / `scripts/deploy.sh`** : l'API et le front tournent
> en conteneurs sur le VPS, sous Dokploy. Un push sur **`preview`** construit les images, les pousse
> sur GHCR et déploie la préproduction par `.github/workflows/images.yml` — vert seulement quand
> l'URL publique rend le commit dans `X-Build-Sha`. **`master` reste servie par Vercel jusqu'à la
> phase F du plan**, et cette phase se décide par une personne. Runbook et relevé :
> [`docs/infra/hebergement.md`](docs/infra/hebergement.md).

**L'API n'a jamais servi en production, et le front public l'appelle quand même.** Le bundle de
`www.takussan.com` porte `NEXT_PUBLIC_API_URL = https://api.takussan.com` (inliné à la compilation,
lisible dans les chunks servis) ; cet hôte pointe sur le VPS sans service derrière et **échoue sur
la poignée de main TLS** (re-mesuré le 2026-09-14, TCK-523). C'est l'objet de
[TCK-332](docs/backlog/tickets/TCK-332-front-public-appelle-une-api-absente.md) et de la phase F
(TCK-517). Relevé et commande : [`docs/infra/hebergement.md`](docs/infra/hebergement.md), « Ce qui
sert quoi ».

> ⚠️ **Une mesure sans sa date devient une croyance.** Ce paragraphe a été faux à plusieurs
> reprises, toujours dans le sens qui rassure ([J-06](docs/journal-des-corrections.md#j-06)). Le relevé daté de l'ancien
> serveur — `master`, les deux échecs de `deploy.yml`, le compte `takussan_pro` à un caractère
> près — est en [J-45](docs/journal-des-corrections.md#j-45).

Messages de commit en français, préfixés du type conventionnel, citant le ticket quand il y en a un
(`feat(api): … (TCK-280)`). Ne jamais merger ni pousser sans demande explicite.

**`preview` et `master` sont protégées depuis le 2026-09-14 (TCK-524)** — ce sont les branches qui
déploient. Mesuré : `gh api repos/thiambara/takussan/branches/preview/protection` → PR obligatoire
(zéro réviseur : le porteur est seul), **six checks requis**, `enforce_admins`, ni force-push ni
suppression ; même chose sur `master`. Un `git push origin HEAD:preview` direct est **refusé**
(`protected branch hook declined`), mesuré le jour même. Les six checks sont les jobs d'`api-ci`,
`web-ci` et `repo-ci` **rejoués en entier par `promotion-ci.yml` sur toute PR vers ces deux
branches** — préfixés `API /`, `Front /`, `Dépôt /`. Pourquoi un workflow de plus : un check requis
doit exister sur chaque PR, et les trois CI ne se déclenchent que sur leurs chemins (la promotion
#271 n'a pas joué `web-ci`) ; requis tels quels, ils auraient bloqué toute promotion qui ne les
déclenche pas tous. La liste se relit là, jamais ici :

```bash
gh api repos/thiambara/takussan/branches/preview/protection -q .required_status_checks.contexts
```

**Un arbre déjà éprouvé vert ne rejoue pas sa suite** ([ADR-0063](docs/adr/0063-attestation-de-ci-par-arbre.md),
TCK-636) : `lint-and-test` et `quality` déposent un artefact `ci-vert-<suite>-<clé>`, la clé étant
le `ls-tree` de ce que la suite **lit** ; le job `attestation` qui les précède les fait sauter
quand il le trouve, et nomme le run qui a attesté. Le push du merge sur `dev` et la promotion
sautent donc d'ordinaire ces deux jobs — sauté par `if:` vaut réussi pour un check requis. Toute
incertitude rejoue. Images, rollback des migrations et gardes tournent toujours.

⚠ **`dev` n'est PAS protégée, et c'est voulu** : le step « Régénérer la carte d'impact »
d'`api-ci.yml` (TCK-479), qui tourne **la nuit** depuis ADR-0063, y pousse un commit avec le `GITHUB_TOKEN`, ce qu'une protection avec
`enforce_admins` refuserait. La protéger demande d'abord une autre voie pour ce step (jeton
d'application, ou exception) — ticket à part si on la veut.

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
   `AgencyAdminProfile`, `ServiceProviderProfile`, `PlatformProfile` — le courtier a quitté le code,
   [ADR-0030](docs/adr/0030-le-courtier-quitte-le-code-et-la-base.md)), une enum
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
   de l'API existait pour compenser **n'existe plus** : ce que la suite éprouve est ce
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

### Migrations — les pièges PostgreSQL

**Les neuf pièges payés pendant la bascule vivent dans [`takussan-api/CLAUDE.md`](takussan-api/CLAUDE.md)**,
§ « Migrations », chargé dès qu'on travaille dans l'API. Les deux à ne jamais oublier : une erreur
SQL **abandonne la transaction entière** (pas de `try/catch` pour poursuivre — `insertOrIgnore`),
et `lower()` ne replie que l'ASCII sous `--locale=C` (passer par `App\Support\CaseInsensitive`).

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
