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
| Données | 124 migrations · 38 factories · 11 seeders | — |
| Tests | ~307 fichiers · **~2050 tests, verts _au repos_** | ~143 fichiers · **~810 tests, verts _au repos_** |

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
php artisan test                    # ~2050 tests — exige une instance Meilisearch (cf. D-08), et se
                                    #   mesure MACHINE AU REPOS : sous charge, les tests de recherche
                                    #   rougissent au hasard, sur un ensemble différent à chaque
                                    #   exécution (cf. D-44). Un rouge Meilisearch se relance seul
                                    #   AVANT d'accuser le code.
php artisan test --filter=Foo
./vendor/bin/pint                   # ← AVANT CHAQUE COMMIT. Rien ne l'impose : c'est une
                                    #   violation d'un seul fichier qui a cassé la CI six semaines.
php artisan migrate
php artisan migrate:fresh --seed    # 38 seeders, ~450 biens. SANS médias par défaut :
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

Racine :

```bash
node scripts/check-env-parity.mjs   # .env.example et .env.docker déclarent-ils les mêmes clés ?
```

## Environnement de développement

`docker-compose.yml` sert **MySQL 8.0, Meilisearch, Redis et Mailpit**. Chaque service couvre une
divergence dev↔prod qui coûtait cher tant qu'elle n'était pas provisionnée — le raisonnement, service
par service, est dans l'en-tête du fichier.

> **Le moteur de base a été MESURÉ le 2026-08-13**, et il n'était pas celui qu'on croyait. Le
> compose et la CI tournaient sur `mariadb:11.4` parce qu'un commentaire affirmait que la prod
> sortait d'un `apt install mariadb-server` — commande que personne n'avait exécutée. Sur le
> serveur : `mysql-server 8.0.46`, `utf8mb4_0900_ai_ci`. Pas un écart de version, **le mauvais
> moteur**. `scripts/check-db-engine.mjs` garde désormais l'accord entre le compose, le job
> `migrations-mysql` et la valeur mesurée. *Ne jamais déduire l'état d'un environnement de la
> configuration — ni de la commande d'installation — qui le vise.*

**Les ports sont décalés d'un cran** (3307, 7701, 6380, 1026/8026) : les ports canoniques étaient
occupés par des installations natives brew et par un projet voisin. Le décalage rend les deux mondes
simultanés au lieu d'exiger qu'on démonte l'existant.

**`.env.docker` est l'environnement de développement, `.env.example` est le contrat des clés.**
`.env.example` ne reproduit **aucun** environnement existant : il livre `DB_CONNECTION=sqlite` quand
la production tourne sur MySQL 8, `SCOUT_DRIVER=collection` quand la CI et la production indexent sur
Meilisearch, et `CACHE_STORE=redis` sans que rien ne fournisse Redis. `.env.docker` aligne chaque
driver sur celui de la production. `scripts/check-env-parity.mjs` garde la parité des **clés** entre
les deux (jamais des valeurs — deux fichiers aux valeurs identiques n'auraient aucune raison d'être
deux).

`./dev.sh` ne force pas docker : il détecte si le `.env` vise les conteneurs du dépôt ou des services
natifs, **sonde ce que le `.env` déclare**, et nomme ce qui ne répond pas. Un service déclaré et
absent ne produit aucune erreur lisible — l'API démarre, et c'est la première requête qui meurt.

> **`./dev.sh doctor` nomme aussi le cas inverse, depuis TCK-301** : un `.env` qui vise le port
> CANONIQUE (3306 / 7700 / 6379 / 1025) alors que le dépôt publie le port décalé. Ce cas-là ne
> produit *aucun* rouge — les services répondent, ce sont ceux de brew — mais rien de ce que
> `docker-compose.yml` garantit ne s'applique alors : ni le moteur MySQL 8.0 mesuré en production,
> ni l'isolation de l'index Meilisearch, ni Mailpit. `takussan-api/.env` est ignoré par git : aucun
> fichier de ce dépôt ne peut corriger l'écart, seulement l'afficher (dette D-48).

## Workflow git

**`dev` est la branche d'intégration**, et c'est désormais aussi la branche par défaut du dépôt.
Toutes les PR la ciblent — 7 des 10 dernières mergées, plus de 24 au total. `master` est **figé au
2026-05-18, 31 commits derrière `dev`**, et ne contient même pas la chaîne de déploiement.

**La production n'a jamais été déployée.** Pas « plus depuis trois mois » — *jamais* : `deploy.yml`
ne se déclenchait que sur un push vers `master`, et `gh run list` montre qu'il n'a **pas tourné une
seule fois**. `api.takussan.com/up` rend 404 quand `preview.api.takussan.com/up` rend 200, sur le
même serveur (dette D-04, TCK-288).

> Une version de ce paragraphe écrivait « la production ne reçoit plus rien depuis trois mois ».
> Elle avait été déduite de la **configuration** du workflow, pas de son historique d'exécution :
> le YAML dit ce qui *devrait* se produire, `gh run list` dit ce qui *s'est* produit. La différence
> entre « le déploiement s'est arrêté » et « le déploiement n'a jamais commencé » change tout ce
> qu'on croit savoir de l'état du serveur. **Ne jamais déduire l'état d'un environnement de la
> configuration qui le vise.**

Messages de commit en français, préfixés du type conventionnel, citant le ticket quand il y en a un
(`feat(api): … (TCK-280)`). Ne jamais merger ni pousser sans demande explicite.

## Specs & backlog

**Sources de vérité fonctionnelles** (ne jamais dupliquer dans un ticket) :

- `docs/features.md` — spec fonctionnelle
- `docs/models-spec.md` — spec data/modèles *(périmée sur 16 modèles, cf. ardoise D-18)*

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

4. **Une migration se pense pour MySQL, jamais pour SQLite.** La suite de tests tourne sur SQLite
   (permissif), la production sur **MySQL 8.0** (strict) — mesuré, cf. plus haut. Les quatre
   familles de pièges sont ci-dessous.
   Le job `migrations-mysql` d'`api-ci.yml` rejoue désormais les migrations sur MySQL 8.0 —
   **l'aller en entier, le retour seulement au-dessus du cutover TCK-278** : le `down()` de la
   migration de cutover est délibérément irréversible, on ne peut donc pas descendre plus bas.
   Concrètement, **3 `down()` sur 124** sont exécutés, et ce sont les plus récents. Le job affiche
   le compte à chaque exécution. Il a suffi à trouver un `down()` cassé sur trois tables dès sa
   première (ardoise D-05) — mais ne pas le lire comme « les `down()` sont couverts ».

   Écrire un `down()` juste n'est pas une politesse : c'est le seul code dont on ait besoin le jour
   où un déploiement tourne mal, et **la suite de tests n'en exécute aucun**.

5. **Le front possède le texte affiché.** L'API émet des codes et des données ; les libellés passent
   par next-intl (`fr`/`en`/`wo`). *Tenu à 82 fichiers sur 875 : la règle est une intention, pas un
   état (dette D-24).*

### Migrations — les pièges MySQL que SQLite ne voit pas

1. **`DEFAULT` sur type restreint.** MySQL refuse `DEFAULT` sur `JSON`, `BLOB`, `TEXT`, `LONGTEXT`,
   `MEDIUMTEXT`, `TINYTEXT`, `GEOMETRY`, `POINT`.
   ```php
   ❌ $table->json('col')->default(json_encode([]));
   ✓ $table->json('col')->nullable();   // + $attributes = ['col' => '[]'] dans le Model
   ```

2. **`dropUnique`/`dropIndex` sur une colonne portant une FK.** MySQL refuse : l'index back la FK.
   ```php
   ❌ $table->dropUnique('table_col_unique');   // si col a une FK
   ✓ $table->dropForeign(['col']);
     $table->dropUnique('table_col_unique');    // … puis re-add la FK plus tard
   ```

3. **Nom d'index/FK auto-généré > 64 caractères** (limite MySQL). Laravel concatène
   `{table}_{col1}_{col2}_{suffix}`.
   ```php
   ✓ $table->index(['long_col_1', 'long_col_2'], 'short_explicit_name_idx');
   ✓ $table->foreignId('col')->constrained('table', 'id', 'short_fk_name');
   ```

4. **Pas d'`enum()`** — `string()` + contrôle applicatif (portable, et facile à faire évoluer).

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

## Où vont les fichiers

Tout document de conception va sous `docs/`, **jamais à la racine**. `docs/adr/` pour les décisions,
`docs/backlog/` pour les tickets, `docs/plans/` pour les plans d'implémentation, `docs/qa/` et
`docs/smoke-tests/` pour les campagnes. `docs/ardoise.md` porte les dettes.

**`AGENTS.md` ne duplique plus ce fichier** — il y renvoie. Deux fichiers d'instructions divergents à
la racine, c'est un mensonge qui attend son lecteur.
