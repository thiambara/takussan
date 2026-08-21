# Inventaire mesuré de la bascule PostgreSQL

**Date : 2026-08-21.** Livrable de la tâche 4 du
[plan](../superpowers/plans/2026-08-21-migration-postgresql.md) — celle qui ne corrige rien et
produit le plan de travail des suivantes.

> **Pourquoi ce document existe.** La spec interdisait d'estimer le volume de rouges : *« Toute
> estimation écrite ici serait une croyance présentée comme un plan. »* Ce fichier porte le chiffre
> réel, et surtout **ce que le chiffre a appris** — qui n'est pas ce qu'on attendait.

---

## 1. Les migrations

```bash
php artisan migrate:fresh    # sortie 0
```

**Les 134 migrations passent sur PostgreSQL 17 après UN SEUL correctif** — 92 tables créées.

Le correctif : `GROUP_CONCAT(id)` → `string_agg(id::text, ',')` dans
`2026_05_05_213450_normalize_users_email_to_lowercase`. Le `::text` est obligatoire ; sans lui,
PostgreSQL rend « function string_agg(bigint, unknown) does not exist » sans dire qu'il manque une
conversion.

**C'est la confirmation de ce que la spec avançait** : le schéma était déjà portable, et l'effort
que le plan initial voulait y mettre — « adapter les migrations à 100 % » — n'avait pas d'objet.
Mesuré avant la bascule : 0 `enum`, 0 `fullText`, 0 `storedAs`, 0 `charset`, 0 `->comment()`, et 6
des 8 migrations à SQL brut branchaient **déjà** sur `'pgsql'`.

## 2. La suite de tests

Première exécution complète sur PostgreSQL, **avant tout correctif applicatif** :

```
Tests:  17 failed, 2 skipped, 2644 passed (8535 assertions)
```

**17 rouges sur 2663 — 0,6 %.**

⚠ **Le temps de cette exécution (668 s) ne vaut rien et n'est pas retenu** : `load average` 9,16 sur
8 cœurs au départ, la reconnaissance à 9 agents tournant en même temps. *Un temps mesuré sous charge
décrit la machine, pas le dépôt.* Le temps de référence est pris séparément, machine au repos.

### Les 17 rouges se ramènent à QUATRE causes racines

Aucune n'est du DDL. Aucune n'est du SQL exotique.

| | Cause | Tests | Ce que ça révélait |
|---|---|---|---|
| 1 | `lockForUpdate()` sur un agrégat (`SQLSTATE[0A000]`) | 11 | 4 sites. Le verrou ne fermait **aucune** des courses qu'il visait — verrouiller les lignes existantes ne voit pas un INSERT concurrent. MySQL le faisait par un verrou d'intervalle, effet de bord jamais écrit ici. |
| 2 | La table `notifications` n'existe pas (`42P01`, puis cascade `25P02`) | 4 | **29 classes de notification écrivaient dans le vide, en production aussi.** L'exception était avalée ; SQLite et MySQL laissaient continuer. |
| 3 | `ORDER BY properties_count is ambiguous` (`42702`) | 1 | Deux colonnes homonymes — une vraie colonne dénormalisée et l'alias d'un `withCount`. Le moteur choisissait, en silence. |
| 4 | Trois défauts isolés (`22001`, unique-catch, id en dur) | 1+ | Une longueur de `VARCHAR` non appliquée par SQLite, une exception attendue dans le cas nominal, un identifiant écrit en dur dans une clé de cache. |

**Détail complet et raisonnement** : commit `42ca9ce0`.

### Le résultat qui n'était pas prévisible

**Trois des quatre causes ne sont pas des défauts de la migration : ce sont des défauts que la
migration a RÉVÉLÉS.** Ils vivaient dans le dépôt, invisibles pour ~2300 assertions vertes :

- les 29 notifications perdues étaient perdues **en production** aussi ;
- le verrou de concurrence ne verrouillait rien d'utile, et le test le disait dans son propre
  commentaire (« SQLite does not emit a literal FOR UPDATE clause ») ;
- le tri `sort=-properties_count` portait sur une colonne que personne n'avait décidée.

*Un moteur qui refuse de continuer après une erreur transforme un échec silencieux en échec
bruyant.* C'est le gain de ce chantier, et il dépasse largement les quatre motifs qui l'ont
déclenché.

## 3. Ce que la suite ne pouvait PAS voir

Deux défauts trouvés par une reconnaissance en lecture seule
([`2026-08-21-recon-postgres.md`](2026-08-21-recon-postgres.md), 9 agents, 331 occurrences), parce
qu'**aucun des deux ne fait rougir un test** :

- **69 colonnes `json` au lieu de `jsonb`.** ADR-0020 l'avait décidé ; le code ne l'appliquait pas
  encore. Le motif est plus dur que « pouvoir indexer » : le type `json` n'a **aucun opérateur
  d'égalité** en PostgreSQL — `DISTINCT`, `GROUP BY` et `UNION` y sont impossibles. Aucune de ces
  colonnes ne porte d'index, d'unique ni de défaut : conversion mécanique, et la fenêtre se referme
  au premier chargement.
- **Un nom d'index de 64 caractères exactement.** MySQL plafonne à 64, PostgreSQL à 63 — et
  PostgreSQL ne refuse pas, il **tronque avec un simple NOTICE**. L'index aurait vécu sous un nom
  que Laravel ne calcule jamais, et un `dropIndex()` futur aurait échoué sur un index
  « introuvable » qui est pourtant là. Seul nom > 63 sur 142 déclarations.

## 4. Les seeders

```bash
SEED_DOWNLOAD_MEDIA=false php artisan migrate:fresh --seed   # sortie 0, 262 s
```

836 biens · 305 utilisateurs · 4 agences · **0 erreur**.

**La vérification qui compte pour les séquences n'est pas celle-là.** Un `--seed` vert ne prouve
rien : sur PostgreSQL, un `id` explicite n'avance pas la séquence, et la panne survient au **premier
insert applicatif suivant**. Éprouvé en créant une ligne dans cinq tables semées :

```
users (id=306) · agencies (id=5) · properties (id=837) · customers (id=565) · tags (id=23)
→ aucune violation de clé primaire
```

Les seeders du dépôt n'insèrent donc pas d'`id` explicite. **Rien à corriger sur cette famille** —
ce qui ne se savait pas avant de le mesurer.

## 5. `--parallel` : le prérequis est là

```sql
SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname='takussan';
→ takussan|t|t
```

⚠ Et une correction d'honnêteté au passage : `docker/pgsql-init.sql` prétendait **accorder**
`CREATEDB`. C'est faux — `POSTGRES_USER` fait du rôle le superutilisateur, le droit était déjà là.
La ligne est conservée (elle rend l'exigence explicite et survivra au jour où l'image change), mais
son commentaire le dit maintenant.

## 6. Ce que cette mesure NE dit pas

- **Qu'un test vert a emprunté le chemin PostgreSQL.** `PipelineStatsService` en est la preuve : sa
  branche « sinon MySQL » n'était exercée par *rien*, et elle aurait cassé en production. Un vert
  global ne prouve pas la couverture d'un chemin ; seul le clover le dit.
- ~~Le temps de suite~~ — **mesuré depuis, et le chiffre compte** (voir §7).
- **Que `--parallel` tient sur la suite entière.** Le droit `CREATEDB` est vérifié ; le
  comportement ne l'est pas. TCK-334 (la file Meilisearch) reste ouverte de toute façon.
- **Quoi que ce soit de la production.** Elle n'existe pas (D-04). La cible PostgreSQL est
  *décidée*, jamais relevée sur un serveur — c'est pourquoi la constante de `check-db-engine.mjs`
  s'appelle `CIBLE` et non `PROD`.

---

## 7. Le temps de suite, machine au repos — et il a doublé

```
2026-08-21 · 8 cœurs · load average 2,93 au départ, 4,63 à l'arrivée
php artisan test → 648 s (10 min 49)
                   335,70 s user + 29,66 s system, 56 % CPU
Tests: 2668 passés, 0 ÉCHEC, 2 ignorés · 8616 assertions
```

> Une mesure intermédiaire, prise une passe plus tôt au même repos, rendait 622 s pour 2658 passés
> et **3 échoués** — les trois derniers défauts, tous corrigés depuis. Les deux chiffres décrivent
> des arbres différents : ils ne se comparent pas, et c'est celui-ci qui fait référence.

**Référence SQLite : 204-235 s au repos (2026-08-16).** Le rapport est donc d'environ **×2,8**.

C'était le risque n°2 nommé par la spec, et il s'est réalisé. Ce que ça touche :

- **`bin/impacted-tests.php` devient plus utile, pas moins** — c'est la boucle du quotidien, et
  l'écart qu'elle évite vient de doubler.
- **Le rituel de fin de branche coûte 10 minutes au lieu de 4.** C'est le prix de la propriété que
  ce chantier achète : *ce que la suite éprouve est ce que la production exécutera.*
- **Le cliquet de couverture** ajoutait +36 % sur SQLite. À remesurer sur cette base-là.
- **La CI** : le job dépassera visiblement son temps antérieur. C'est attendu, et documenté ici pour
  qu'on ne cherche pas une régression là où il n'y en a pas.

**La piste si ce coût devient insupportable** — et elle n'a PAS été empruntée, faute de nécessité
démontrée : `CREATE DATABASE … TEMPLATE`, c'est-à-dire migrer une base modèle une seule fois puis la
cloner par processus, au lieu de rejouer les 135 migrations dans chacun. *On ne l'optimise pas
avant d'avoir mesuré que ça gêne.*

---

## 8. Le cliquet de couverture, et ce que le clover a dit d'autre

```bash
XDEBUG_MODE=coverage php vendor/phpunit/phpunit/phpunit --coverage-clover=storage/coverage/clover.xml
php bin/coverage-gate.php storage/coverage/clover.xml --min=86
```

**86,8 %** (21 893 / 25 218 lignes exécutables) — contre 86,16 % avant le chantier. Le cliquet à
86 % tient, avec plus de marge qu'avant. Durée : **1414 s (23 min 34)** sous Xdebug.

⚠ Le seuil **n'est pas resserré** : ce chiffre est pris sous Xdebug en local, quand la CI mesure
sous PCOV. Les deux pilotes ne comptent pas exactement les mêmes lignes exécutables. Resserrer le
cliquet sur une mesure prise par un autre pilote, c'est fabriquer un rouge de CI qui n'apprend rien.

### Le critère d'acceptation n°4, et il n'est tenu qu'à 34/36

Le critère exigeait que le clover montre des lignes **réellement exécutées** dans chacun des
36 fichiers portant du SQL brut — *un vert global ne prouve pas qu'un chemin a été emprunté*, et
`PipelineStatsService` en était la démonstration.

Résultat : **34 fichiers sur 36** ont des lignes exécutées.
`PipelineStatsService` passe à **74/93 (80 %)** et `UnifiedModerationService` à **184/192 (96 %)** —
les deux fichiers les plus risqués du chantier sont donc bien exercés.

**Deux ne le sont pas du tout**, et ce sont des fichiers VIVANTS, pas du code mort :

| Fichier | Appelant | SQL brut |
|---|---|---|
| `app/Services/Model/SearchService.php` | `app/Jobs/SendSavedSearchAlerts.php` (tâche planifiée) | haversine — `acos`/`cos`/`radians`/`sin` sur `latitude`/`longitude` en `decimal(10,7)` |
| `app/Sorts/MaintenancePrioritySort.php` | `MaintenanceRequest` — atteint par `sort=priority` | `CASE priority WHEN … END` |

La suite ne pouvait donc RIEN prouver de leur compatibilité. Faute de test, les deux fragments ont
été **exécutés directement contre PostgreSQL** :

```sql
-- haversine sur des colonnes numeric : PostgreSQL applique bien la conversion implicite
SELECT count(*) FROM addresses WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  AND (6371 * acos(cos(radians(14.7)) * cos(radians(latitude))
     * cos(radians(longitude) - radians(-17.4)) + sin(radians(14.7)) * sin(radians(latitude)))) <= 50;
-- → s'exécute, pas d'erreur

SELECT count(*) FROM (SELECT id FROM maintenance_requests
  ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3
                         WHEN 'low' THEN 4 ELSE 5 END asc) t;
-- → s'exécute, pas d'erreur
```

**C'est une vérification plus faible qu'un test, et il faut le dire ainsi** : elle prouve que le SQL
est accepté, pas que le code qui le construit se comporte correctement. *Deux fichiers vivants
portant du SQL brut sans un seul test qui les traverse, c'est une dette antérieure à cette
migration — qui l'a seulement rendue visible.*
