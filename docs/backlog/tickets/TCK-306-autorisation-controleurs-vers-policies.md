---
id: TCK-306
title: "25 contrôleurs redéfinissent l'autorisation que 16 policies portent déjà"
status: todo
phase: P2
family: technique
estimate: L
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279, TCK-297]
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#packages-transversaux
tags: [back, securite, autorisation, policy, convention, refactor, dette]
---

## Objectif utilisateur

Qu'une règle d'autorisation existe en un seul exemplaire — pour qu'on puisse la corriger une fois
au lieu de la corriger dans 25 contrôleurs, ou de croire l'avoir corrigée partout.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16, dans `takussan-api/app/` :

- **16** policies sous `app/Policies/`.
- **25** contrôleurs définissent leur propre `authorizeAccess()` ou `authorizeManage()`.
- **88** appels à ces helpers, avec une logique copiée-collée entre contrôleurs.

> Chiffres re-mesurés le 2026-08-16. L'ardoise D-32 annonçait **38 contrôleurs et 124 appels** au
> 2026-08-12 — **surestimé d'un tiers**. La dette est réelle, son ampleur ne l'était pas.

`takussan-api/CLAUDE.md` tranche déjà pour le code neuf : la policy fait foi.

## Contraintes strictes (métier)

- **C'est le lot où une erreur ouvre une porte.** Une règle d'autorisation déplacée de travers ne
  produit pas un test rouge mais un accès accordé. Chaque helper migré doit être couvert par un test
  d'autorisation **avant** d'être déplacé — pas après.
- **L'agence est la frontière d'isolation** (principe n°2) : une capacité se juge pour un couple
  *(utilisateur, agence)*, et le profil actif se lit via `request()->activeProfile()`. Un helper de
  contrôleur qui capturait implicitement l'agence courante doit la rendre explicite en migrant.
- **Dépend de TCK-297.** Tant que `BasePolicy` résout des capacités inexistantes, migrer des règles
  vers les policies déplace du code fonctionnel vers une chaîne qui refuse tout le monde sauf le
  super-admin.
- **Dépend de TCK-279.** Les rôles personnalisés par agence redéplacent la résolution des
  capacités ; converger avant réécrirait du code que TCK-279 va bouger.
- La duplication d'autorisation PHP↔TS est déjà gardée (D-23) : vérifier que la garde reste verte,
  et qu'elle ne devient pas verte parce qu'elle ne voit plus rien.

## Delta à produire

- [ ] Inventorier les 25 contrôleurs et les 88 appels, et rattacher chacun à la policy qui devrait
      porter la règle
- [ ] Pour chaque règle, écrire le test d'autorisation qui la couvre **avant** de la déplacer
- [ ] Migrer contrôleur par contrôleur, tests verts à chaque étape
- [ ] Créer les policies manquantes pour les modèles qui n'en ont pas et en ont besoin
- [ ] Garde CI : la définition d'un `authorizeAccess()`/`authorizeManage()` dans un contrôleur fait
      échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — plus aucun contrôleur ne définit `authorizeAccess()` ni `authorizeManage()`
- [ ] AC2 — chaque règle migrée est couverte par un test qui **échouerait** si la règle disparaissait
      — vérifié par ablation, pas par lecture
- [ ] AC3 — aucun test d'autorisation n'a été assoupli ni supprimé pendant la migration
- [ ] AC4 — la garde de duplication PHP↔TS (D-23) reste verte et couvre toujours le même périmètre
- [ ] AC5 — réintroduire un helper d'autorisation dans un contrôleur fait échouer la CI

## Hors périmètre

- Les capacités inexistantes résolues par `BasePolicy` — TCK-297, dont ce ticket dépend.
- Les rôles personnalisés par agence — TCK-279, dont ce ticket dépend.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
