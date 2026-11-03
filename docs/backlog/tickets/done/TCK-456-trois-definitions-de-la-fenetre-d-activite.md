---
id: TCK-456
title: "Trois définitions divergentes de la fenêtre d'activité d'une délégation, qu'aucune garde ne lie"
status: done
phase: P2
family: back
estimate: S
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
tags: [back, autorisation, delegation, dette, garde]
---

## Objectif utilisateur

Aucun — c'est une dette de cohérence interne. Elle ne se voit pas depuis le produit, et c'est
précisément ce qui la rend coûteuse le jour où l'une des trois définitions bouge.

## Contexte

Relevé pendant la revue adverse de [TCK-395](TCK-395-delegation-role-delegue-sans-rapport-avec-les-capacites.md). La « fenêtre
d'activité » d'une délégation de rôle est définie **trois fois**, à trois endroits, et rien ne
garantit que les trois disent la même chose :

- `scopeActive`
- `hasActiveAgencyDelegation`
- `delegationAllows`

**Aucune garde ne les lie.**

⚠️ **Aucune urgence, et la raison est mesurée** : la seule des trois qui **autorise** est
`delegationAllows`, et elle est gardée par les bornes de TCK-395 ; `scopeActive` n'a **aucun
appelant**. Le risque n'est donc pas aujourd'hui — il est le jour où quelqu'un corrige l'une des
trois en croyant les corriger toutes, ou branche `scopeActive` sur un chemin d'autorisation.

*Trois définitions d'une même règle ne divergent pas le jour où on les écrit : elles divergent le
jour où on en modifie une.*

## Critères d'acceptation

1. Les trois définitions sont **rapprochées et comparées terme à terme** — bornes incluses ou
   exclues, traitement de `NULL`, fuseau — et l'écart, s'il existe, est **écrit** avant d'être
   corrigé.
2. Soit elles convergent vers une source unique, soit un test lie les trois et **rougit** quand
   l'une diverge. ⚠ Un test qui ne ferait qu'appeler les trois sur le même cas nominal ne garde
   rien : il faut le cas **aux bornes**, celui où une inclusion stricte et une inclusion large ne
   répondent pas pareil.
3. Le sort de `scopeActive` est tranché : branché, ou **supprimé**. Un scope sans appelant est
   une définition qui attend d'être choisie par erreur.
4. Ablation prouvée dans les deux sens, avec preuve d'application avant lecture du résultat.

## Notes

À traiter avec [TCK-457](TCK-457-resolution-des-delegations-en-n-plus-un.md), relevé dans la même
revue et sur le même mécanisme.

---

## Décision — étape 0 du lot, 2026-08-29

### L'écart, écrit avant d'être corrigé (AC1, premier versant)

Relevé terme à terme sur les trois corps, le 2026-08-29 :

| | statut | `starts_at` | `ends_at` **NULL** | borne `ends_at` |
|---|---|---|---|---|
| `RoleDelegation::scopeActive()` | `Active` | `NULL OR <= now()` | **rejetée** | `>= now()` — **incluse** |
| `HasProfiles::hasActiveAgencyDelegation()` | `Active` | **non testé** | **acceptée** | `> now()` — **exclue** |
| `MembershipCapabilityResolver::delegationAllows()` | `Active` | **non testé** | **acceptée** | `> now()` — **exclue** |

**Les deux dernières sont identiques ; `scopeActive` diverge sur les trois axes à la fois** — et
sur `ends_at IS NULL` elle dit *l'inverse* des deux autres. Le docblock de `delegationAllows`
nomme déjà une partie de l'écart (TCK-395) ; il ne mentionne pas `starts_at`.

### Le sort de `scopeActive` (AC3) : **BRANCHÉ**, et il devient la source unique

Supprimer un scope juste parce qu'il n'a pas d'appelant laisserait deux définitions au lieu de
trois — l'AC2 demande *une* source, pas *moins de sources*.

**Forme retenue :** le corps de `scopeActive()` devient **exactement la fenêtre qui autorise
aujourd'hui** (`status = Active` ET (`ends_at IS NULL` OU `ends_at > now()`)), et les deux autres
méthodes l'appellent au lieu de réécrire la clause.

**Deux propriétés font que c'est le choix le moins risqué, et il faut les tenir :**

1. **Le changement est neutre pour l'autorisation, par construction.** C'est la définition
   *permissive* qui gagne — celle qui autorise déjà — donc aucun droit ne s'ouvre ni ne se ferme.
   Prendre la fenêtre de `scopeActive` aurait, elle, **retiré** des droits en silence à toute
   délégation sans fin. *Une convergence qui change qui peut faire quoi n'est pas une convergence,
   c'est une décision d'autorisation déguisée en refactorisation.*
2. **La clause `starts_at` est ABANDONNÉE, et c'est délibéré.** Une délégation qui n'a pas commencé
   porte le statut `Scheduled`, pas `Active` (`scopeScheduled`, `scopeReadyToActivate`) : le test de
   statut la couvre déjà. Une ligne `Active` avec un `starts_at` futur serait un défaut de
   `RoleDelegationService`, **à garder là**, et non une fenêtre à rattraper ici. La rattraper ici
   masquerait le défaut au lieu de l'attraper.

⚠ **Vérifier par exécution que `scopeActive` n'a réellement aucun appelant — `app/` ET `tests/` ET
`database/`.** Le ticket l'affirme sur `app/` seulement. Un appelant de test qui dépendrait de
l'ancienne sémantique rougirait, et c'est le rouge qu'il faut lire, pas contourner.

### Le test qui lie les trois (AC2)

Aux **bornes**, et nulle part ailleurs — le cas nominal ne discrimine rien :

- `ends_at = NULL` → les trois doivent répondre **pareil** (aujourd'hui : 2 oui, 1 non) ;
- `ends_at = now()` exactement → inclusion stricte contre inclusion large ;
- une ligne `Active` avec `starts_at` futur → aujourd'hui, `scopeActive` seule la rejette.

Ce test doit **rougir si l'une des trois est modifiée seule**. L'ablation se fait donc dans les
deux sens : rétablir l'ancienne clause de `scopeActive` doit le faire rougir.

---

## Réalisation — 2026-08-29

### AC1 — l'écart, RE-mesuré terme à terme (et un axe que la décision ne pouvait pas voir)

Le tableau de la décision est confirmé sur les trois corps. **Une quatrième colonne lui manquait :
la joignabilité.**

| axe | `scopeActive` | `hasActiveAgencyDelegation` | `delegationAllows` | atteignable ? |
|---|---|---|---|---|
| statut | `Active` | `Active` | `Active` | oui |
| `starts_at` | `NULL OR <= now()` | non testé | non testé | **oui** — colonne nullable |
| `ends_at IS NULL` | rejetée | acceptée | acceptée | **NON** |
| borne `ends_at` | `>= now()` (incluse) | `> now()` (exclue) | `> now()` (exclue) | oui |

⚠ **`role_delegations.ends_at` est NOT NULL** — `$table->dateTime('ends_at')`, sans `->nullable()`,
depuis la migration de création (vérifié en base : `information_schema.columns.is_nullable = 'NO'`).
L'axe sur lequel les trois définitions se contredisaient le plus franchement — l'une disait
l'inverse des deux autres — **ne peut être porté par aucune ligne**, et les trois branches
`whereNull('ends_at')` du dépôt sont mortes.

*Une divergence inatteignable n'est pas une divergence corrigée : c'est une divergence que le
schéma cache.* Elle est donc gardée autrement —
`test_la_borne_ends_at_null_reste_inatteignable_par_le_schema` rougit le jour où la colonne devient
nullable, et dit d'ajouter la borne.

### AC3 — `scopeActive` : **branché**, source unique

Vérifié **par exécution** qu'il n'avait aucun appelant, dans `app/` **et** `tests/` **et**
`database/` (`grep -rn 'RoleDelegation::active\|->active(...' …` → aucune correspondance ; les
`->active()` du dépôt portent sur `Lease`, `PlatformProfile`, `ServiceProviderProfile`). Aucun test
ne dépendait donc de l'ancienne sémantique — aucun rouge à lire.

Son corps est devenu **exactement la fenêtre qui autorisait déjà** : `status = Active` ET
(`ends_at IS NULL` OU `ends_at > now()`). Les deux autres l'appellent. Le changement est **neutre
pour l'autorisation** : les deux méthodes qui décident n'ont pas changé de verdict d'une seule
ligne, seul le scope sans appelant a bougé.

La clause `starts_at` est abandonnée, et sa contrepartie est désormais **gardée** :
`test_le_statut_couvre_ce_que_la_clause_starts_at_couvrait` prouve qu'un `starts_at` futur produit
`Scheduled` dans `RoleDelegationService::create()`. Sans ce cas, l'abandon reposait sur une lecture
de code.

### AC2 — le test qui lie les trois

`tests/Feature/Api/Permissions/RoleDelegationActivityWindowTest.php`, **aux bornes uniquement**.
Le temps est **gelé** (`freezeTime()`) : sans gel, `ends_at = now()` glisse dans le passé entre
l'écriture et la lecture, les trois se remettent d'accord sur « non », et le cas resterait vert en
ne mesurant rien.

| borne | attendu | avant | après |
|---|---|---|---|
| `ends_at = now()` exactement | non ×3 | scope **oui**, autres non → 🔴 | 🟢 |
| `Active` + `starts_at` futur | oui ×3 | scope **non**, autres oui → 🔴 | 🟢 |
| `ends_at = now() − 1 s` | non ×3 | 🟢 | 🟢 |
| `ends_at = now() + 1 s` | oui ×3 | 🟢 | 🟢 |

Les deux dernières ne discriminent rien à elles seules — elles sont là pour que les deux premières
soient honnêtes : sans le voisin ouvert, une définition qui répondrait « non » à tout passerait la
borne 1 ; sans le voisin fermé, une qui répondrait « oui » à tout passerait la borne 2.

### AC4 — ablations, dans les deux sens

Chaque ablation est prouvée appliquée par **hachage du contenu** avant lecture du résultat.

| # | ablation | md5 après | résultat |
|---|---|---|---|
| A | ancienne clause de `scopeActive` rétablie | `88f66128…` | **2 rouges** / 4 verts |
| B | `hasActiveAgencyDelegation` réécrit sa clause, borne **incluse** | `71266d34…` | **1 rouge** / 5 verts |
| C | `delegationAllows` réécrit sa clause, borne **incluse** | `5dfe1197…` | **1 rouge** / 5 verts |
| D | `RoleDelegationService::create()` naît toujours `Active` | `75b466e9…` | **1 rouge** |

A est le sens « rétablir l'ancien » qu'exige la décision ; B et C sont le sens « faire diverger
l'une des trois seule », celui pour lequel la garde existe.

### ⚠ Correction de la décision ci-dessus — mesuré pendant l'implémentation

**L'axe que la décision présentait comme le plus grave n'est porté par aucune ligne.**

```
database/migrations/2026_04_28_000000_create_role_delegations_table.php:18
    $table->dateTime('ends_at');          ← PAS de ->nullable()
information_schema.columns → role_delegations.ends_at  is_nullable = NO
                             role_delegations.starts_at is_nullable = YES
```

La décision écrivait : *« sur `ends_at IS NULL` elle dit l'inverse des deux autres »*. C'est vrai
du **code** et faux de la **base** : les branches `whereNull('ends_at')` des deux méthodes
permissives sont mortes, et le rejet de `scopeActive` ne rejetait rien.

**Ce que ça change, et ce que ça ne change pas.** La convergence reste juste, et la sémantique
retenue reste la bonne. Ce qui tombe, c'est l'argument de gravité : les trois définitions ne
divergeaient réellement que sur la **borne** (`>=` contre `>`) et sur `starts_at`. *Une divergence
qu'aucune donnée ne peut atteindre est une divergence qui attend un `->nullable()`, pas un bogue
d'aujourd'hui.*

Elle est gardée pour ce qu'elle est : un cas rougit **si la colonne devient nullable**.

*La décision d'étape 0 avait lu les trois corps sans interroger le schéma — c'est-à-dire qu'elle a
déduit l'état de la base du code qui la lit, exactement le geste que le `CLAUDE.md` interdit.*
