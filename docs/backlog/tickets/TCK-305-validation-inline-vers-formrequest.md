---
id: TCK-305
title: "120 validations inline contre 65 FormRequest — deux conventions sur le même geste"
status: todo
phase: P2
family: technique
estimate: L
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, validation, convention, refactor, dette]
---

## Objectif utilisateur

Qu'une règle de validation se trouve toujours au même endroit — pour qu'une contrainte métier
puisse être revue, testée et modifiée sans avoir d'abord à chercher laquelle des deux conventions
l'endpoint a retenue.

## Contrat de données

Aucun modèle nouveau. Mesuré le 2026-08-16, dans `takussan-api/app/` :

- **120** appels à `$request->validate()` — validation inline dans le contrôleur.
- **65** classes sous `app/Http/Requests/` qui étendent un `FormRequest`.

`BaseFormRequest` et les patterns de validation existent depuis TCK-051 (`done`), et
`takussan-api/CLAUDE.md` tranche pour le code neuf. L'existant n'a jamais convergé.

> Chiffres re-mesurés le 2026-08-16. L'ardoise D-32 annonçait « 120 vs 69 » au 2026-08-12 : le
> premier compte est identique, le second diffère par la méthode de comptage (fichiers de
> `app/Http/Requests/` étendant `FormRequest`). L'ordre de grandeur tient.

## Contraintes strictes (métier)

- **La validation porte des règles métier, pas seulement de la forme.** Chaque migration inline →
  FormRequest doit préserver le comportement exact : mêmes règles, mêmes messages, mêmes codes de
  réponse. Un test qui passe avant et après ne suffit pas à le prouver si aucun test ne couvrait la
  règle — vérifier la couverture de chaque règle **avant** de la déplacer.
- L'autorisation ne se glisse pas dans le `authorize()` du FormRequest par commodité : la règle
  d'autorisation appartient aux policies (principes n°1 et n°2, et TCK-306).
- **Ne pas convertir 120 sites en un commit.** Découper par domaine, tests verts à chaque étape.
- Convergence sans garde = dette qui revient.

## Delta à produire

- [ ] Inventorier les 120 sites et les grouper par domaine
- [ ] Pour chaque site, vérifier qu'un test couvre les règles **avant** de les déplacer ; en écrire
      un si ce n'est pas le cas
- [ ] Converger domaine par domaine vers `BaseFormRequest`
- [ ] Garde CI : `$request->validate()` dans un contrôleur fait échouer le build
- [ ] Prouver la garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — plus aucun `$request->validate()` dans `app/Http/Controllers/`
- [ ] AC2 — chaque règle déplacée est couverte par un test qui échouerait si la règle disparaissait
- [ ] AC3 — la suite backend reste verte, sans assertion assouplie
- [ ] AC4 — aucune règle d'autorisation n'a migré vers `authorize()` d'un FormRequest
- [ ] AC5 — réintroduire une validation inline fait échouer la CI

## Hors périmètre

- L'autorisation dans les contrôleurs — TCK-306.
- Les messages d'erreur traduits : l'API émet des codes, le front possède le texte (principe n°5).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
