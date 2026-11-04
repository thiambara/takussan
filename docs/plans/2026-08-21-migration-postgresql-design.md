# Migration MySQL 8.0 → PostgreSQL — design

- **Date** : 2026-08-21
- **Portée** : `takussan-api/` — schéma, code applicatif, suite de tests, CI, provisionnement
- **Statut** : design validé, plan d'implémentation à écrire
- **ADR à produire avant toute ligne de code** : `ADR-0020 — PostgreSQL sur tous les environnements, base de test comprise`

---

## Toutes les mesures de ce document

Prises le **2026-08-21**, sur la branche `dev` (`74eab7f3`). Chaque chiffre porte sa commande :
un chiffre recopié plus tard sans sa commande est une croyance, pas une mesure.

```bash
cd takussan-api
ls database/migrations | wc -l                                    # 134
grep -rn -e '->enum('        database/migrations | wc -l           # 0
grep -rn -e 'fullText'       database/migrations | wc -l           # 0
grep -rn -e 'storedAs' -e 'virtualAs' database/migrations | wc -l  # 0
grep -rn -e 'charset' -e 'collation' -e 'engine(' database/migrations | wc -l  # 0
grep -rn -e '->comment('     database/migrations | wc -l           # 0
grep -rn -e '->after('       database/migrations | wc -l           # 105  (ignoré par PG)
grep -rn -e '->change()'     database/migrations | wc -l           # 14
grep -rl -e '->json('        database/migrations | wc -l           # 56 fichiers
grep -rl -e 'DB::statement' -e 'DB::raw' database/migrations | wc -l  # 8 fichiers
grep -rl -e "'pgsql'"      database/migrations | wc -l           # 6  ← branchent DÉJÀ sur PostgreSQL

grep -rn -e whereRaw -e selectRaw -e orderByRaw -e havingRaw \
        -e groupByRaw -e 'DB::raw' -e 'DB::statement' -e 'DB::select' app/ | wc -l   # 82
grep -rl -e whereRaw -e selectRaw -e orderByRaw -e havingRaw \
        -e groupByRaw -e 'DB::raw' -e 'DB::statement' -e 'DB::select' app/ | wc -l   # 36 fichiers

grep -rn -e 'JSON_EXTRACT' -e 'JSON_UNQUOTE' -e 'JSON_CONTAINS' app/ | wc -l  # 3, un seul fichier
grep -rn -e whereJsonContains -e whereJsonLength app/ | wc -l                 # 0
grep -rn -e "'like'" -e '"like"' app/ | wc -l                                # 21

grep -n DB_CONNECTION phpunit.xml                    # sqlite  (ligne 27)
grep -n 'DB_CONNECTION' ../.github/workflows/api-ci.yml | head -1   # sqlite  (ligne 211)
```

> ⚠ `CLAUDE.md` annonce **124 migrations**. La mesure ci-dessus en compte **134**. Le document
> d'entrée est périmé sur ce point ; il est corrigé par ce chantier.

---

## 1. Pourquoi maintenant, et pourquoi pas plus tard

**L'API n'a jamais servi en production.** `https://api.takussan.com/up` → **404** quand
`https://preview.api.takussan.com/up` → **200** (dette **D-04**, TCK-288). `deploy.yml` a tourné
deux fois le 2026-08-15 et les deux exécutions ont échoué sur
`SQLSTATE[HY000] [1045] Access denied for user 'takussan_prod'@'localhost'`.

**Conséquence directe : il n'y a aucune donnée à migrer.** Pas de bascule à répéter, pas de fenêtre
d'indisponibilité, pas de rollback à éprouver. La migration se réduit à *schéma + seeders + code*.
Cette fenêtre ne se rouvrira pas : chaque semaine de production repoussera le chantier d'un cran de
difficulté.

**Bénéfice net non demandé : le chantier dénoue D-04.** Au lieu de réparer un compte MySQL
`takussan_prod` que personne n'a réussi à joindre — le journal de déploiement ne dit même pas de
quel côté est l'écart : secret périmé, compte absent, ou *grant* manquant se ressemblent tous dans
ce message — on provisionne un PostgreSQL neuf avec un compte qu'on crée. **TCK-288 redevient
exécutable.**

## 2. Le motif : PostgreSQL comme plateforme, pas comme drop-in

Quatre motifs retenus par le porteur du projet, de poids très inégal — et cette inégalité gouverne
tout le découpage :

| Motif | Fenêtre de tir | Verdict |
|---|---|---|
| **JSONB indexé** | **Maintenant, ou coûteux plus tard** — `json` → `jsonb` est un mot par colonne tant que les tables sont vides ; c'est un `ALTER` bloquant sur une table pleine | **Embarqué** (la déclaration de type seulement) |
| **pgvector** (chatbot, Laravel AI SDK) | Le schéma vient plus tard, **mais le provisionnement se décide maintenant** | **Embarqué** (contrainte de provisionnement seulement) |
| **Recherche PG** (`pg_trgm`/FTS) | N'importe quand | **Reporté** — révoque [ADR-0008](../../adr/0008-meilisearch-sur-tous-les-environnements.md) |
| **Géo / PostGIS** | N'importe quand | **Reporté** — n'existe pas encore dans le code |

**Ce qui décide n'est pas l'importance, c'est la fenêtre.** La recherche PG et la géo ne coûteront
pas un centime de plus dans six mois. `jsonb` et l'extension `vector`, si. Les emballer ensemble
ferait dépendre la seule chose urgente de trois choses qui ne le sont pas — et rendrait indécidable,
au premier test rouge, si c'est Postgres, la recherche ou la géo qui a cassé.

> **Note d'honnêteté sur la recherche.** pgvector + `pg_trgm` dans la même base, c'est de la
> recherche hybride sans second système à exploiter. C'est un argument réel contre Meilisearch —
> mais il devient bon *une fois que le chatbot existe*, pas avant. « Pas encore », pas « jamais ».

## 3. Ce qui n'est PAS le travail — et ce qui l'est

**Le porteur proposait initialement** : adapter les migrations à 100 % → basculer → migrer + seeder
→ lancer les tests pour détecter les régressions → corriger → revue finale.

Deux corrections mesurées, et la seconde est la plus coûteuse :

**(a) « Adapter les migrations à 100 % » n'est presque pas du travail.** 0 `enum`, 0 `fullText`,
0 `storedAs`, 0 `charset`, 0 `->comment()`. Les 105 `->after()` sont **ignorés silencieusement** par
la grammaire PostgreSQL — sans effet, sans erreur. Et **6 des 8 migrations à SQL brut
branchent déjà sur `'pgsql'`** (index uniques partiels) : quelqu'un a anticipé. Le schéma est déjà
portable.

**(b) « Puis on lance les tests » ne détecterait rien.** `phpunit.xml:27` force
`DB_CONNECTION=sqlite`, et `api-ci.yml:211` aussi. Les ~2320 tests resteraient verts **sur SQLite**
et ne diraient rien de Postgres.

> **Basculer la suite sur PostgreSQL n'est donc pas une étape du plan : c'est le plan.** Tout le
> reste en découle.

**Preuve concrète que la suite actuelle est aveugle** — `app/Services/Crm/PipelineStatsService.php:112` :

```php
$jsonHas = $driver === 'sqlite'
    ? "json_extract(properties, '$.attributes.pipeline_stage') IS NOT NULL"
    : "JSON_EXTRACT(properties, '$.attributes.pipeline_stage') IS NOT NULL";
// et l. 158 : JSON_UNQUOTE(JSON_EXTRACT(…))  ← n'existe pas en PostgreSQL
```

La branche `else` **casse** sur PostgreSQL, et elle n'est exercée par **aucun** test aujourd'hui.
C'est le plan initial en miniature : le rouge n'apparaîtrait qu'en production.

## 4. Décisions structurelles (contenu de l'ADR-0020)

### 4.1 La cible

| | Valeur | Motif |
|---|---|---|
| Moteur | **PostgreSQL 17** | pgvector packagé, largement supporté en managé. 18 existe ; 17 maximise les portes ouvertes côté hébergement. À reconfirmer au moment de figer l'image. |
| Image dev/CI | **`pgvector/pgvector:pg17`** | pas `postgres:17`. L'extension doit être *disponible* partout dès maintenant, même si aucune table ne l'utilise. |
| Extensions créées | **aucune tout de suite** | `vector`, `pg_trgm`, `citext` viennent avec leurs chantiers. Ce qui se décide ici, c'est que le provisionnement les *autorise*. |
| Colonnes JSON | **`json` → `jsonb`**, 56 fichiers | un mot pendant que les tables sont vides ; un `ALTER` bloquant après. |
| Port docker | **5433** | le dépôt décale tous ses ports d'un cran (3307 / 7701 / 6380 / 1026) pour cohabiter avec les installations brew. Même règle, même motif. |
| MySQL | **retiré**, pas conservé en option | cf. §4.3 |

### 4.2 La collation — la décision la plus lourde

La production mesurée le 2026-08-13 tourne en `utf8mb4_0900_ai_ci` : **insensible à la casse ET aux
accents**. PostgreSQL est sensible aux deux par défaut.

**Option écartée : reproduire le comportement MySQL** par une collation ICU non déterministe
(`locale='fr-FR-u-ks-level1'`). **PostgreSQL refuse `LIKE` sur une colonne à collation non
déterministe.** Le dépôt compte 21 `where(…, 'like', '%…%')` : ils tomberaient tous, sur une erreur
sans rapport avec le sujet. On échangerait un problème visible contre un problème obscur.

**Décision : collation déterministe par défaut. L'insensibilité redevient une règle métier
explicite, là où le domaine la demande.**

Ce n'est pas un renoncement — c'est la politique que le dépôt a **déjà** choisie sans la nommer :
`User::setEmailAttribute` normalise à l'écriture, la migration
`2026_05_05_213450_normalize_users_email_to_lowercase` a normalisé l'existant, et
`CustomerTagController.php:42` contourne déjà le problème à la lecture par
`Tag::whereRaw('LOWER(name) = ?')`. On généralise, on
documente, on teste.

**Ce que cette décision met à découvert — et c'est le danger n°1 du chantier.** Six contraintes
d'unicité portent sur du texte :

`users.email` · `users.username` · `properties.slug` · `agencies.slug` · `tags.name` · `tags.slug`

Sous MySQL `ai_ci`, `Dakar` et `dakar` violent l'unicité. Sous PostgreSQL, **non** : ce sont deux
lignes. **Une contrainte qui change de sens ne lève pas d'erreur — elle laisse passer un doublon en
silence**, et on le découvre six mois plus tard dans les données. Correctif attendu : normalisation
à l'écriture *plus* index unique sur expression (`LOWER(...)`), les deux, pas l'un ou l'autre.

C'est le point n°1 de la revue adverse finale.

### 4.3 La base de test devient la base de production

**C'est le gain principal du chantier, et il dépasse les quatre motifs.**

Aujourd'hui : tests sur SQLite `:memory:`, production sur MySQL 8 — **une divergence qui préexiste à
cette migration**. Le dépôt la paie déjà : le job CI `migrations-mysql` n'existe que pour ça, et il
n'attrape que le schéma, jamais le comportement.

Après : `phpunit.xml` force `pgsql`, exactement comme il force déjà `SCOUT_DRIVER=meilisearch` sans
repli ([ADR-0008](../../adr/0008-meilisearch-sur-tous-les-environnements.md)).

**SQLite est retiré, pas conservé « au cas où ».** Deux raisons :

1. *Le seul régime que personne n'éprouve est celui que tout le monde exécute* — c'est littéralement
   l'argument d'ADR-0008, appliqué à la base plutôt qu'au moteur de recherche.
2. Un double support obligerait chaque `whereRaw` à brancher sur **trois** drivers au lieu d'un —
   le contraire exact de ce que le chantier cherche.

**Coût assumé** : PostgreSQL devient un prérequis dur du développement. Mais Meilisearch l'est déjà,
et `docker-compose.yml` existe précisément pour ça ([ADR-0011](../../adr/0011-environnement-de-dev-conteneurise.md)).
On n'ajoute pas une classe de friction — on ajoute un conteneur à une pile qui en a déjà quatre.

## 5. Stratégie : mesurer d'abord, corriger par famille

Trois stratégies ont été pesées. Ce qui les sépare n'est pas la quantité de travail, c'est **où vit
la vérité du « c'est vert »**.

| | Stratégie | Verdict |
|---|---|---|
| **A** | **Mesurer d'abord** : basculer la suite sur PG, la liste des rouges *devient* le plan, puis corriger par famille | **Retenue** |
| B | Double filet transitoire : job CI « suite sur PG » toléré en échec, ramené à zéro, puis bascule | Écartée — **ce dépôt s'est déjà fait avoir là** : une violation Pint a bloqué la CI six semaines sans que personne ne le voie. Un job toléré en échec est un job que plus personne ne lit. |
| C | Le plan initial : migrations d'abord, tests ensuite | Écartée — c'est A avec l'ordre inversé et le filet débranché (§3) |

**Propriété décisive de A : la portée du chantier est mesurée avant d'être planifiée.** Personne ne
sait aujourd'hui si la bascule produit 12 tests rouges ou 400. Une exécution le dit. Estimer à la
place, c'est écrire un plan dont on ne pourra pas dire s'il a tenu.

## 6. La séquence

### Étape 0 · L'ADR

Règle du dépôt : décision structurelle → ADR **avant** l'implémentation. `ADR-0020` reprend le §4,
et **révoque le principe non négociable n°4 de `CLAUDE.md`** (« une migration se pense pour MySQL,
jamais pour SQLite ») en le remplaçant par son équivalent PostgreSQL.

### Commit 1 · LA MESURE — le commit qui porte tout le reste

**Contenu** : `docker-compose.yml` (service `postgres`, image `pgvector/pgvector:pg17`, port 5433,
volume neuf) · `.env.docker` · `.env.example` · `phpunit.xml` → `pgsql` · `./dev.sh doctor` qui
sonde PostgreSQL. **Aucun correctif applicatif. Aucune adaptation de migration.**

**Exécution** : `php artisan migrate:fresh`, puis la suite entière, **machine au repos**.

**Livrable** : `docs/plans/2026-08-21-inventaire-postgres.md`, portant

- (a) les 134 migrations passent-elles, et lesquelles échouent ;
- (b) **la liste des tests rouges, classée par famille** (§6, F1→F6) ;
- (c) le temps de suite, avec `uptime` et `sysctl -n hw.ncpu` relevés à côté — sans eux le chiffre
  ne voudra plus rien dire dans six mois ;
- (d) le rôle PostgreSQL a-t-il `CREATEDB` (prérequis de `--parallel`, cf. §7).

**Point de décision** : on ne planifie pas au-delà avant d'avoir (b). Liste courte → on déroule la
séquence ci-dessous. Liste énorme → on re-découpe avant de continuer.

### Commits 2..n · une famille par commit

Du plus mécanique au plus subtil. Suite entière rejouée à chaque commit.

| | Famille | Surface mesurée |
|---|---|---|
| **F1** | **Schéma** — ce que `migrate:fresh` refuse ; `json` → `jsonb` | 56 fichiers ; les 5 branches `pgsql` déjà écrites s'exécutent enfin pour de vrai |
| **F2** | **SQL brut** | 82 occurrences / 36 fichiers. `PipelineStatsService` (`JSON_UNQUOTE`) d'abord ; puis `UnifiedModerationService` — 33 occurrences, UNION de littéraux non typés, **le fichier le plus risqué du dépôt pour ce chantier** |
| **F3** | **Casse & accents** | 6 uniques texte (§4.2), 21 `LIKE`, et les **tris par texte** — qui changent l'ordre des listes, donc des assertions de tests qui n'ont rien à voir avec la base |
| **F4** | **Types de retour** | `pdo_pgsql` ≠ `pdo_mysql` sur les agrégats, décimaux et booléens. Change la forme des charges utiles JSON → **concerne aussi le front** |
| **F5** | **Séquences** | après les seeders (48 fichiers, ~450 biens) : tout `id` explicite laisse la séquence désynchronisée, et c'est le premier `INSERT` applicatif qui le découvre |
| **F6** | **`GROUP BY` strict** | PostgreSQL refuse les colonnes hors agrégat que SQLite tolérait |

### Commits suivants

1. **Seeders** — `migrate:fresh --seed` complet (48 fichiers de seeders), puis vérification des séquences.
2. **CI** — service PostgreSQL dans le job de tests · extension `pdo_pgsql` · `migrations-mysql` →
   `migrations-pgsql`, qui **change de raison d'être** : la suite tournant désormais sur PostgreSQL,
   ce job ne garde plus que la couverture des `down()` — **14** migrations au-dessus de la borne
   TCK-278, et non 3 comme l'écrit `CLAUDE.md` · `scripts/check-db-engine.mjs`
   recalé sur la nouvelle cible · cliquet de couverture **re-mesuré** (le seuil de 86 % peut bouger
   si du code spécifique à MySQL disparaît).
3. **Provisionnement** — `scripts/server-setup.sh` (paquet `postgresql-17-pgvector`),
   `.env.preview` / `.env.prod`, `deploy.yml`. **C'est ici que D-04 se dénoue** (§1).
4. **Documents** — `CLAUDE.md` (principe n°4, le tableau des pièges, le compte de migrations),
   `docs/models-spec.md`, `docs/infra/prod-drivers.json`, l'en-tête de `docker-compose.yml`,
   `docs/adr/README.md`.
5. **Revue adverse finale.**

## 7. Le filet — et les verts qui ne prouvent rien

- **Toute mesure, machine au repos**, `uptime` et `hw.ncpu` relevés à côté du chiffre. Sous charge,
  la même commande met **×11** (mesuré le 2026-08-16) : un temps pris sous charge décrit la machine,
  pas le dépôt.
- **Ne jamais confondre un rouge Meilisearch avec une régression PostgreSQL** (dette **D-44**).
  Relancer seul avant de conclure quoi que ce soit.
- **Ablation à chaque correctif** : le test rougirait-il *sans* le correctif ? Sinon il ne garde
  rien, et le vert est décoratif.
- **Le piège propre à ce chantier : un test qui passe sur PostgreSQL n'a pas forcément touché
  PostgreSQL.** `PipelineStatsService` le prouve (§3) : sa branche non-sqlite n'est exercée par
  rien. **F2 s'accompagne donc d'une vérification de couverture ciblée sur les 36 fichiers à SQL
  brut, lue dans le clover** — pas estimée, pas déduite d'un vert global.
- **`--parallel` sur PostgreSQL** : ParaTest crée N bases ; le rôle doit avoir `CREATEDB`. Vérifié
  au commit 1, pas à la fin.
- **Le front** : `npm run test` (~810 tests) ne touche pas la base, mais **F4 peut changer la forme
  des charges utiles** — les tests de contrat côté front sont concernés et doivent être rejoués.

## 8. Hors périmètre — délibérément

Quatre tickets **rédigés** pendant ce chantier, `depends_on` celui-ci, **non exécutés** :

| Ticket | Objet | Pourquoi pas maintenant |
|---|---|---|
| A | Index GIN + requêtes JSONB | rapporte **0** aujourd'hui : 0 `whereJsonContains` dans `app/` |
| B | pgvector + chatbot (Laravel AI SDK) | le schéma vient avec la fonctionnalité ; seul le provisionnement est acté ici |
| C | Recherche PostgreSQL remplaçant Meilisearch | révoque ADR-0008 : 7 modèles indexés, driver forcé en test, conteneur CI, appareil d'isolation D-44 / TCK-334. Chantier plus gros que celui-ci. |
| D | Géo / PostGIS | n'existe pas encore : `addresses.latitude/longitude` en `decimal(10,7)`, **0** calcul de distance dans les ~62 000 lignes de `app/` |

Aucun motif n'est perdu — ils sont en file, et aucun ne coûtera plus cher plus tard.

## 9. Les trois inconnues, nommées

1. **Le volume de tests rouges** — inconnu, et **délibérément non estimé**. Levé par le commit 1.
2. **Le ralentissement de la suite** — inconnu. SQLite `:memory:` → PostgreSQL réel. Touche
   `--parallel`, le cliquet de couverture et `bin/impacted-tests.php`, c'est-à-dire tout l'appareil
   que ce dépôt a construit autour du temps de suite. Mesuré au commit 1.
3. **L'hébergement** (VPS actuel vs managé) — doit autoriser `CREATE EXTENSION vector`, faute de
   quoi le motif pgvector se referme en silence. À trancher avant le provisionnement, pas
   maintenant.

## 10. Critères d'acceptation

Chaque critère est formulé pour qu'**une régression ne puisse pas le cocher** :

1. `php artisan migrate:fresh --seed` passe sur PostgreSQL 17, sortie 0.
2. La suite backend entière est verte **sur PostgreSQL**, machine au repos, et le rapport cite
   `uptime` + `hw.ncpu`. *(Un vert sur SQLite ne coche pas ce critère : SQLite n'est plus une
   connexion déclarée.)*
3. `grep -rn DB_CONNECTION phpunit.xml .github/workflows/api-ci.yml` ne rend plus **aucune**
   occurrence de `sqlite` ni de `mysql`.
4. Pour chacun des 36 fichiers à SQL brut, le clover montre les lignes concernées **exécutées**.
   *(Le vert global ne coche pas ce critère — cf. la branche morte de `PipelineStatsService`.)*
5. Les 6 contraintes d'unicité sur texte ont un test qui **échoue si on retire la normalisation**
   (ablation), en insérant une variante de casse et une variante accentuée.
6. `./dev.sh doctor` nomme un PostgreSQL absent, et nomme aussi un `.env` visant le port canonique
   5432 au lieu de 5433.
7. `ADR-0020` existe, `CLAUDE.md` ne prescrit plus MySQL, `scripts/check-db-engine.mjs` casse si le
   compose et la CI divergent de la cible.
8. Les quatre tickets hors périmètre existent, en `todo`, avec `depends_on` renseigné.
9. La revue adverse finale est passée, et ses constats sont soldés ou tracés.
