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
- **Le temps de suite.** Voir §2 : la seule exécution complète disponible ici a été prise sous
  charge. La mesure au repos est faite séparément.
- **Que `--parallel` tient sur la suite entière.** Le droit `CREATEDB` est vérifié ; le
  comportement ne l'est pas. TCK-334 (la file Meilisearch) reste ouverte de toute façon.
- **Quoi que ce soit de la production.** Elle n'existe pas (D-04). La cible PostgreSQL est
  *décidée*, jamais relevée sur un serveur — c'est pourquoi la constante de `check-db-engine.mjs`
  s'appelle `CIBLE` et non `PROD`.
