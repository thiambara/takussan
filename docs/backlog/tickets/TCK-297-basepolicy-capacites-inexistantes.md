---
id: TCK-297
title: "BasePolicy résout des capacités qui n'existent pas — refus silencieux pour tous sauf super-admin"
status: done
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

## ⚠️ Deux corrections apportées à ce ticket pendant son implémentation

**1 — « Personne ne l'avait vu » était faux, et c'est une correction importante.** Le ticket laissait
entendre que le décalage était passé inaperçu. `tests/Feature/Authorization/BasePolicyTest.php`
existe depuis TCK-278 et le **documente comme comportement voulu**, nommément :
*« `properties.view` → no atomic case (denied) »* et *« only `update_own`/`update_any` exist, so the
generic ability is undefined (denied) »*. Le défaut n'était donc pas invisible : il était **connu,
testé, et accepté**. Ce qui manquait n'était pas le constat mais la garde — rien n'empêchait la
**prochaine** policy de refaire la même concaténation, et rien ne disait au lecteur de `BasePolicy`
que ses abilities étaient volontairement mortes.

**2 — L'arbitrage est tranché par la spec elle-même.** `features.md#22` liste « view » parmi les
permissions granulaires P0, ce qui plaidait pour compléter l'enum. Mais l'encadré qui ouvre cette
section dit : *« Si une ligne de ce tableau contredit le code, c'est le code qui a raison »* — le
**quoi** est tranché, seul le **comment** était périmé. Et le code est sans ambiguïté :
`Capability` n'a **aucun** cas `.view`, sur aucun de ses 12 domaines, et sépare `update_any` de
`update_own`. L'enum catalogue des **verbes privilégiés** ; lire une ressource ordinaire est gardé
par le périmètre d'agence et la propriété (principe non négociable n°2).

**Décision retenue : ne PAS compléter l'enum.** `BasePolicy` cesse de fabriquer des chaînes et
**désigne** des `Capability` typées ; une ability sans capacité déclarée refuse — ce qu'elle faisait
déjà. Le correctif est **behavior-preserving par construction**, et c'est délibéré : il rend
l'intention lisible et la faute inexprimable, il ne rouvre aucun accès.

## Delta à produire

- [x] Trancher pour les 3 policies — décision et son fondement écrits ci-dessus
- [x] `BasePolicy` réécrit : `?Capability` typées au lieu de `resource(): string`
- [x] `PropertyPolicy` (`PropertiesCreate`, `PropertiesDelete`), `LeasePolicy` (`LeasesCreate`),
      `MediaPolicy` (aucune — `media` n'est pas un domaine de l'enum)
- [x] Garde 1 — `tests/Unit/Policies/BasePolicyCapabilityTest.php`, liste des sous-classes
      **dérivée** de `app/Policies/`
- [x] Garde 2 — `tests/Unit/Authorization/CapabilityStringLiteralsTest.php`, scan par tokenizer
      de tout `app/`. **Aucun câblage `api-ci.yml` nécessaire** : la CI lance `php artisan test`,
      les deux gardes sont donc déjà exécutées — ajouter une étape dédiée serait une seconde
      source de vérité sur ce qui tourne
- [x] Garde prouvée **par mutation**, dans les deux sens (capacité fantôme → rouge ; même chaîne
      en commentaire → verte)
- [x] Tests sur `Lease`, `Property` et `Media` avec utilisateur non super-admin
- [x] `takussan-api/CLAUDE.md` — ⚠️ obsolète remplacé par la description du mécanisme actuel

## Critères d'acceptation

- [x] AC1 — aucune ability ne résout une capacité absente de `Capability` : `BasePolicy` ne
      construit plus de chaîne, il rend des `?Capability` typées
- [x] AC2 — la garde échoue si l'on réintroduit le décalage — **prouvé par mutation** :
      `can('leases.renew_typo')` dans du code → rouge avec `fichier:ligne`
- [x] AC3 — *(reformulé après arbitrage, cf. section ci-dessus)* la lecture n'est pas gardée par
      capacité ; un test prouve qu'une ability sans capacité refuse un non-super-admin, et qu'une
      ability avec capacité rend **exactement** ce que rend `MembershipCapabilityResolver`
- [x] AC4 — le bypass `super_admin` tient sur les **deux** chemins (appel direct de la policy et
      passage par la Gate), et un test le prouve des deux côtés
- [x] AC5 — *(ajouté)* la garde ignore les commentaires — prouvé par mutation inverse : la même
      chaîne fantôme placée en docblock laisse la garde verte

## Hors périmètre

- La refonte des rôles personnalisés par agence — TCK-279.
- Les 25 contrôleurs qui redéfinissent `authorizeAccess()`/`authorizeManage()` — TCK-306.

## Notes d'implémentation

**Le correctif porte sur le générateur, pas sur le symptôme.** TCK-278 avait déjà trouvé ce défaut
exact — `MediaPolicy::viewRaw` lisait `can('properties.update')` — et l'avait corrigé *à cet
endroit-là*, en laissant intacte la concaténation de `BasePolicy` qui le produisait. Le docblock de
`viewRaw` explique d'ailleurs le mécanisme mieux que ne le faisait `BasePolicy`. Corriger un site
d'appel sans corriger ce qui le fabrique laisse la porte ouverte au suivant.

**Deux surprises pendant l'implémentation, toutes deux issues de tests qui rougissent :**

1. `(new LeasePolicy)->view($superAdmin, $lease)` rendait **`true`** avant le correctif, alors que
   j'avais écrit l'assertion inverse. Raison : `BasePolicy` passait par `$user->can()`, donc par la
   Gate, donc par `Gate::before` — le bypass s'appliquait même sur une policy instanciée nue. Un
   `return false` naïf pour une capacité nulle aurait donc **retiré** ce bypass en appel direct,
   silencieusement. `allows()` court-circuite explicitement sur `isSuperAdmin()`, ce qui est aussi
   la convention déjà en place dans `PropertyPolicy::update` et `MediaPolicy::viewRaw`.

2. `tests/Feature/Authorization/BasePolicyTest.php` définit une policy de test qui déclarait
   `resource(): string`. Elle a été migrée vers les capacités typées ; ses assertions n'ont pas
   bougé d'un caractère, ce qui est la meilleure preuve disponible que le refactor préserve le
   comportement.

**Pourquoi un tokenizer et pas un `grep`.** La garde `CapabilityStringLiteralsTest` analyse `app/`
par `token_get_all()`. Un `grep` sur la même recherche rend trois occurrences de
`'properties.update'` : un docblock, un commentaire de test, et un **nom de route Laravel**. Les
trois sont inoffensives. Une garde qui les signale est une garde qu'on désactive dans la semaine —
et un test qui vérifie explicitement qu'elle ignore les commentaires empêche qu'on la « simplifie »
plus tard en regex.

**Deux gardes plutôt qu'une**, parce qu'elles couvrent des fautes différentes : le typage `?Capability`
rend la faute inexprimable **dans les policies**, le scan de littéraux la rattrape **partout
ailleurs** (`$user->can('leases.terminate')` est encore écrit à la main dans `LeasePolicy`). La
liste des sous-classes de `BasePolicy` est **dérivée** de `app/Policies/` et non recopiée.

**`takussan-api/CLAUDE.md` portait un ⚠️ qui décrivait le défaut comme un état de fait ; il est
remplacé par la description du mécanisme actuel** — la compétence impose de corriger ce fichier dans
la même PR quand il contredit le code.
