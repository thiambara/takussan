---
id: TCK-297
title: "BasePolicy résout des capacités qui n'existent pas — refus silencieux pour tous sauf super-admin"
status: todo
phase: P1
family: bug
estimate: S
wave: 37
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: [TCK-306]
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#packages-transversaux
tags: [back, securite, autorisation, rbac, policy, dette]
---

## Objectif utilisateur

Qu'une autorisation refusée le soit pour une raison métier écrite quelque part — et non parce que
la chaîne policy → gate → capacité se termine sur un nom que personne n'a déclaré.

## Contrat de données

`BasePolicy` résout ses cinq abilities CRUD par `$user->can("{$this->resource()}.{$action}")`.
`AppServiceProvider:447` ne définit de gate que pour les **44 cas déclarés** de
`App\Models\Enums\Capability`. Toute chaîne qui ne tombe pas sur l'un de ces 44 cas retourne
`false`, sauf pour un super-admin via le `Gate::before` de la ligne 378.

Mesuré le 2026-08-16 — trois policies héritent de `BasePolicy` :

| Policy | `resource()` | Redéfinit | Retombe sur `BasePolicy` | Capacité correspondante |
|---|---|---|---|---|
| `PropertyPolicy` | `properties` | `update` | `viewAny`, `view`, `create`, `delete` | `.create` ✅ `.delete` ✅ · **`.view` ❌** |
| `LeasePolicy` | `leases` | *rien* | les cinq | `.create` ✅ · **`.view` `.update` `.delete` ❌** |
| `MediaPolicy` | `media` | `view`, `delete` | `viewAny`, `create`, `update` | **`media.` n'est pas un préfixe de `Capability`** |

## Contraintes strictes (métier)

- **Ce n'est aujourd'hui pas un bug vivant, et le ticket ne doit pas le présenter comme tel.** Les
  15 sites d'appel de `authorize()`/`can()` sur les abilities CRUD ont été inventoriés : aucun
  n'atteint une ability cassée. `LeasePolicy` n'est jamais invoquée sur une ability CRUD ;
  `PropertyPolicy` ne l'est que sur `update`, qu'elle redéfinit ; `MediaController:141` autorise sur
  la **cible** de l'attachement, donc sur `PropertyPolicy`/`AgencyPolicy`, jamais sur `MediaPolicy`.
- **C'est un piège latent, et c'est ce qui le rend coûteux.** Le jour où quelqu'un écrit
  `$this->authorize('view', $lease)` — la ligne la plus naturelle du monde — la requête refuse tout
  le monde sauf le super-admin, sans exception, sans trace, et le diagnostic part du mauvais côté.
- La correction doit être **une garde, pas seulement un correctif** : le principe non négociable
  n°1 du dépôt définit la table de vérité en code, et rien ne vérifie aujourd'hui que les abilities
  déclarées par les policies existent dans `Capability`.
- **Ne pas ajouter les capacités manquantes à `Capability` par réflexe.** `Capability` est une table
  de vérité produit de 44 cas, pas un sac à noms : ajouter `leases.view` est une décision
  d'autorisation, pas une correction de typo. Les deux sorties possibles (compléter l'enum, ou
  faire porter la règle par les policies concrètes) sont à arbitrer dans le ticket.

## Delta à produire

- [ ] Trancher, pour chacune des 3 policies, entre compléter `Capability` et redéfinir l'ability
      dans la policy concrète — et écrire la décision dans le ticket
- [ ] Corriger `BasePolicy` et/ou les policies concernées selon l'arbitrage
- [ ] Garde : test/commande qui échoue si une policy déclare une ability dont la capacité résolue
      n'est pas un cas de `Capability` — branchée dans `api-ci.yml`
- [ ] Prouver la garde **par ablation** : la casser sur une ability, vérifier le rouge, réparer
- [ ] Tests : `viewAny`/`view`/`update`/`delete` sur `Lease`, `Property` et `Media`, avec un
      utilisateur **non** super-admin, pour chacun des profils concernés

## Critères d'acceptation

- [ ] AC1 — aucune ability atteignable ne résout une capacité absente de `Capability`
- [ ] AC2 — la garde CI échoue si l'on réintroduit le décalage sur une seule ability
- [ ] AC3 — un test non-super-admin passe sur `authorize('view', $lease)` et sur
      `authorize('viewAny', Media::class)` — les deux chemins qui refusaient tout le monde
- [ ] AC4 — le `Gate::before` super-admin reste le seul contournement, et un test le prouve

## Hors périmètre

- La refonte des rôles personnalisés par agence — TCK-279.
- Les 25 contrôleurs qui redéfinissent `authorizeAccess()`/`authorizeManage()` — TCK-306.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
