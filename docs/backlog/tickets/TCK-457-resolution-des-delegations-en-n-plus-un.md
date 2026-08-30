---
id: TCK-457
title: "La résolution des délégations fait N requêtes là où une seule suffirait — et la sortie n'est PAS un cache"
status: done
phase: P3
family: back
estimate: M
wave: 49
created: 2026-08-28
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#2-agency
tags: [back, performance, autorisation, delegation]
---

## Objectif utilisateur

Aucun aujourd'hui. Ce ticket existe pour que la sortie soit **déjà choisie** le jour où
`MeCapabilityController` devient chaud — et pour que ce ne soit pas un cache.

## Contexte

Relevé pendant la revue adverse de [TCK-395](TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md). Le coût est
mesuré : **268 requêtes contre 224** pour balayer les 45 capacités, soit environ **+20 %**, la
branche délégation ajoutant un `SELECT` par capacité refusée.

⚠️ **La mémoïsation a été essayée en revue, et elle casse la sécurité.** Le relecteur a
implémenté le cache que le ticket refusait — statique, par `(user, agence, capacité)` — et joué
la classe : **4 des 10 cas passent au rouge**, et ce sont précisément ceux qui encodent les
propriétés de TCK-395 : *la borne suit le délégant après la création*, *chaque rôle délégable
accorde un droit mesurable*, *une délégation n'accorde que ce que le rôle délégué porte*, *une
délégation échue n'accorde plus rien*.

**Le dernier est celui qui tranche.** Une mémoïsation exigerait une histoire d'invalidation
couvrant : délégation créée, révoquée, expirée, **et** le rôle du délégant dépouillé. Chacun de
ces événements a quelque chose à quoi s'accrocher — mais **la FENÊTRE n'en a aucun : rien
n'émet d'événement quand l'horloge franchit `ends_at`.** Un TTL bornerait la péremption, or *une
fenêtre d'autorisation périmée est exactement ce que cette borne existe pour fermer.*

**Le contre-exemple est dans le dépôt.** `AgencyRoleCapabilityCache` fonctionne — adossé au
store et non à l'instance, indexé **par rôle** précisément parce que l'invalidation y est totale
et locale, portée par les hooks `saved`/`deleted` du modèle. *Ce cache-là a une histoire
d'invalidation écrite ; une mémoïsation de délégation n'en aurait pas.*

Mesure annexe, qui ferme une autre issue : `app(MembershipCapabilityResolver::class)` appelé deux
fois rend deux `spl_object_id` **différents** — l'instance est neuve à chaque appel, donc un
cache d'instance n'aurait de toute façon aucun effet.

## La sortie, si elle devient nécessaire

**Charger les délégations du couple `(user, agence)` en UNE requête par requête HTTP, et
résoudre en mémoire.** Même fraîcheur — la fenêtre est réévaluée à chaque requête HTTP, donc
aucune péremption n'est introduite — mais un `SELECT` au lieu de N.

*Ce n'est pas un cache : c'est un chargement groupé. La distinction est toute la sécurité de ce
ticket.*

## Critères d'acceptation

1. Le nombre de requêtes est **mesuré avant et après**, sur le même parcours (balayage des 45
   capacités), et les deux chiffres figurent dans le ticket.
2. Les **10 cas de `RoleDelegationCapabilityTest` restent verts** — c'est le critère qui
   distingue un chargement groupé d'une mémoïsation. Les quatre cas nommés ci-dessus sont ceux
   qu'il faut regarder en premier.
3. Une délégation révoquée, expirée, ou dont le délégant a été dépouillé de son rôle **cesse
   d'accorder dans la même requête HTTP suivante**, sans purge et sans TTL.
4. Ablation prouvée dans les deux sens, avec preuve d'application avant lecture du résultat.

## Notes

Ne pas ouvrir ce chantier sans mesure de charge réelle : le +20 % est un coût connu et accepté,
et [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) rappelle qu'aucune clé
étrangère n'est plus indexée automatiquement sous PostgreSQL — il est possible que le vrai gain
soit un index sur `agency_id`, à décider **par `EXPLAIN`** et non par principe.

---

## Mesures — 2026-08-29

### AC1 — le compte de requêtes, avant et après

Parcours : `GET /api/me/capabilities?agency_id=…`, balayage des 45 capacités, bénéficiaire dont
**aucun profil ne porte de capacité** (toutes les 45 traversent donc la branche délégation) et
porteur d'**une** délégation active. Compté par `DB::listen` dans
`RoleDelegationBulkResolutionTest`.

| | avant | après |
|---|---|---|
| requêtes totales | **401** | **296** (−26 %) |
| `SELECT` sur `role_delegations` | **45** | **1** |
| `SELECT` sur `agency_roles` | **45** | **1** |

⚠ **La seconde ligne n'était pas au programme du ticket, et sans elle le N+1 se serait
déplacé au lieu de disparaître.** `systemRoleAllows()` rechargeait le rôle système *par
délégation et par capacité* : le ticket ne comptait que le `SELECT` de délégation parce que la
mesure d'origine avait été prise **sans aucune ligne de délégation** — la boucle ne s'exécutait
pas. Le +20 % du contexte est donc le coût du cas *sans* délégation ; le cas *avec* coûtait le
double.

Ce qui reste : `resolveDirect()` est toujours appelé par capacité, sur le user comme sur le
délégant — c'est l'essentiel des 296. Le grouper demanderait de retenir un **verdict**,
c'est-à-dire le cache que ce ticket refuse.

### L'index d'`agency_id` : mesuré, et **il ne faut pas le poser** (renvoyé à TCK-349)

Deux constats, l'un dérivé du schéma, l'autre de `EXPLAIN` :

1. **L'index que la note supposait manquant existe déjà.**
   `2026_04_28_000000_create_role_delegations_table` pose `$table->index(['agency_id', 'status'])`
   → `role_delegations_agency_id_status_index`, `agency_id` en tête. Le rappel d'ADR-0020 vaut pour
   les FK *non* indexées ; celle-ci l'est.

2. **Et le planificateur ne s'en sert pas.** `EXPLAIN (ANALYZE, BUFFERS)` sur la requête de
   `delegationAllows()`, table temporaire de **200 000 lignes** (5 000 users × 200 agences, 25 %
   `active`), `ANALYZE` avant chaque plan :

   | configuration | plan retenu | temps | buffers |
   |---|---|---|---|
   | A — index du dépôt tels quels | `Bitmap Index Scan` sur **`(user_id, status)`** | 0,122 ms | 14 |
   | B — **sans** `(agency_id, status)` | `Bitmap Index Scan` sur `(user_id, status)` — **identique** | 0,124 ms | 14 |
   | C — avec `(user_id, agency_id, status)` | `Index Scan` | 0,096 ms | **6** |
   | D — témoin, aucun index utile | `Bitmap Index Scan` sur `(status, starts_at)`, 49 985 lignes rejetées | **23,6 ms** | 3 118 |

   A et B sont indiscernables : **l'index d'`agency_id` n'est pas emprunté par cette requête**, et
   le supprimer ne changerait rien. Le seul gain mesurable viendrait d'un index **`(user_id,
   agency_id, status)`** — et il vaut 0,026 ms et 8 buffers sur 200 000 lignes, contre une table
   qui en porte **0** aujourd'hui.

   *Le témoin D est ce qui rend les trois autres lisibles* : sans lui, on ne saurait pas si le banc
   mesure quelque chose. Il montre à quoi ressemble un vrai manque — ×190.

**Conclusion : aucun index n'est posé ici.** Ni celui qu'on supposait (il existe), ni celui que la
mesure désigne (il ne se justifie pas encore, et le poser sans mesure comparative en ferait un
second). La justification est déposée pour [TCK-349](TCK-349-index-des-cles-etrangeres-nues.md),
qui décidera avec les autres.

### Ce qui prouve que ce n'est pas un cache

Ablation F : `loadActiveDelegations()` mémoïsée statiquement par `(user, agence)` — le compte de
requêtes reste bon (296 / 1 / 1) et **5 cas passent au rouge**, dont 3 des 10 de
`RoleDelegationCapabilityTest`. C'est le résultat qui distingue les deux : *un chargement groupé et
une mémoïsation sont indiscernables au compteur de requêtes, et opposés au compteur de tests.*
