---
id: TCK-459
title: "Un raisonnement faux vit dans un ticket `done`, et il y sert à justifier de laisser un contraste à 1,05:1"
status: todo
phase: P2
family: technique
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [dette, accessibilite, tokens, documentation]
---

## Objectif utilisateur

Aucun aujourd'hui. Le ticket existe pour qu'un défaut d'accessibilité **déjà identifié et
délibérément toléré** ne devienne pas visible sans que personne s'en aperçoive.

## Contexte

[TCK-371](TCK-371-console-agence-accessibilite-et-mobile.md), **statut `done`**, écrit deux fois —
lignes 166 et 235 :

> « Le mode sombre reste hors périmètre et reste cassé : `bg-foreground` vaut `#fcf9f3` sous
> `.dark`, où le `text-white` de la barre mesure **1,05:1**. **Aucune classe `.dark` n'est jamais
> posée** (aucun `ThemeProvider`, aucun `prefers-color-scheme`), donc rien de tout cela n'est
> atteignable aujourd'hui. »

**La prémisse est fausse.** La classe est posée, en toutes lettres, sur trois composants livrés —
la liste se DÉRIVE, elle ne se recopie pas :

```
grep -rnE "['\"`]dark[ \"'`]" takussan-web/src --include='*.tsx'
```

Au 2026-08-28 : `layout/SuperAdminSidebar.tsx:224`, `layout/SuperAdminTopbar.tsx:49`, et
`layout/SuperAdminShell.tsx:80` — cette dernière étant un `<SheetContent className="dark …">`
rendu dans un **portail**, donc une portée qui atterrit au niveau du `body`, hors position d'arbre.

**L'angle mort est le même que celui payé par TCK-440** : on a cherché un *mécanisme*
(`ThemeProvider`, `prefers-color-scheme`) et pas *une classe littérale dans un `className`*.
*Chercher l'outil et pas le geste : on ne trouve alors que les usages sophistiqués.*

### La conclusion, elle, SURVIT — vérifié, et c'est ce qui rend le ticket subtil

`AppTopbar` — le composant qui porte le couple à 1,05:1 (`bg-foreground` au `<header>`,
`text-white` dessus, lignes 46/52/61/77) — n'est monté que par `layout/AppShell.tsx:58` et
`layout/AdminShell.tsx:22`. **Aucun des deux ne porte de portée `.dark`**, et aucune des trois
portées ne l'enveloppe. Le 1,05:1 est donc réellement inatteignable aujourd'hui.

> ⚠ **C'est exactement ce qui rend le défaut dangereux plutôt qu'anodin.** Le ticket a raison par
> accident : sa conclusion est vraie, son raisonnement ne la soutient pas. Un raisonnement faux qui
> conclut juste est le plus difficile à corriger — rien ne le contredit, donc rien ne le rejoue.

### Pourquoi ça ne peut pas rester dans un ticket `done`

1. **Un ticket clos est une source de citation, pas un brouillon.** Personne ne le relit ; tout le
   monde le cite. Le raisonnement y survit à l'implémentation qui l'a produit, et il servira à
   justifier la prochaine tolérance.
2. **La tolérance est PORTANTE.** Ce n'est pas une remarque de passage : c'est ce qui justifie de
   ne pas corriger un contraste de 1,05:1 — pratiquement du blanc sur blanc. Une décision de ne
   pas corriger doit reposer sur une raison vraie.
3. **Rien ne la garde.** Le jour où quelqu'un met `AppShell` ou `AdminShell` sous une portée
   `.dark` — exactement ce que `SuperAdminShell` a fait pour sa barre latérale, et par un portail
   de surcroît — le 1,05:1 devient visible, et **aucun test ne le dira**.

## Contrat de données

Sans objet.

## Direction UX / Artistique

Sans objet — sauf si l'issue retenue est de corriger le couple, auquel cas il rejoint l'arbitrage
de [TCK-452](TCK-452-theme-sombre-inatteignable.md) sur le statut de `.dark`.

## Contraintes strictes (métier)

- **Ne pas se contenter de corriger le texte.** Un ticket `done` re-rédigé reste un document ;
  ce qui manque est le mécanisme qui rend la tolérance vérifiable.
- La liste des portées `.dark` se **dérive**. Une correction qui écrirait « trois » reconduirait le
  défaut avec un chiffre de plus — c'est déjà arrivé une fois pendant TCK-440.
- Si la tolérance est maintenue, elle doit être **conditionnelle et vérifiée**, pas affirmée.

## Delta à produire

- [ ] Corriger la prémisse aux deux endroits de TCK-371, en disant ce que la vérification a
      manqué plutôt qu'en réécrivant l'histoire
- [ ] **Une garde ou un test qui lie la tolérance à sa condition** : `AppTopbar` (et tout
      composant portant un couple toléré) n'est sous aucune portée `.dark`. Le jour où il l'est,
      ça rougit.
- [ ] Décider du sort du couple à 1,05:1 : corrigé, ou toléré sous condition gardée
- [ ] Vérifier si d'autres tickets `done` portent la même prémisse — le balayage n'a couvert que
      les fichiers de code jusqu'ici

## Critères d'acceptation

- [ ] AC1 — la prémisse fausse n'apparaît plus dans TCK-371, et **ce que la vérification a manqué**
      y est écrit : elle cherchait un mécanisme, pas une classe littérale.
- [ ] AC2 — un contrôle échoue si `AppTopbar` se retrouve sous une portée `.dark`. L'ablation se
      fait en **plaçant réellement** le composant sous une telle portée, pas en simulant.
- [ ] AC3 — la liste des portées `.dark` employée par ce contrôle est **dérivée**, jamais écrite.
      Un test qui la recopierait passerait le jour où une quatrième portée apparaît — et il y en
      a déjà eu une par portail, que personne n'avait vue.
- [ ] AC4 — le balayage des tickets `done` portant la même prémisse est fait et son résultat
      consigné, y compris s'il est vide. Un balayage non fait et un balayage vide se ressemblent.

## Hors périmètre

- Le sort général du thème sombre — [TCK-452](TCK-452-theme-sombre-inatteignable.md).
- Le contraste de la pastille de contrat — [TCK-458](TCK-458-contraste-de-la-pastille-de-contrat.md).
- La double implémentation du calcul WCAG que TCK-371 signale par ailleurs (`src/test/contraste-wcag.ts`
  et son doublon) : réelle, mais c'est une autre dette.

## Notes d'implémentation

`spec_refs` est vide : ce ticket ne touche à aucun comportement produit décrit par une spec.

Le motif qu'il ferme a été rencontré **cinq fois pendant la vague 49**, dont deux fois dans les
textes écrits pour le corriger. Sa forme constante : *une garde, un test ou un raisonnement qui
boucle sur la liste qu'il prétend garder ne garde que lui-même.* Ici la liste était « les façons
d'activer un thème », et elle omettait la plus simple.

_(le reste à remplir par implementing-specs)_
