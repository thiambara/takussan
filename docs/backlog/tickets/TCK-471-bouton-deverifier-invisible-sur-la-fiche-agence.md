---
id: TCK-471
title: "Le bouton « Déverifier » de la fiche agence est invisible : contraste 1,00:1"
status: todo
phase: P1
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#super-admin
tags: [front, accessibilite, contraste, super-admin, dette]
---

## Objectif utilisateur

Un super-administrateur qui ouvre la fiche d'une agence doit **voir** les trois actions de
modération qui lui sont offertes. Aujourd'hui la troisième est illisible : son libellé est de la
même couleur que son fond.

## Le défaut, mesuré le 2026-08-29 sur l'application servie

`/super-admin/agencies/<id>`, bandeau « Actions de modération », bouton **Déverifier** :

```js
getComputedStyle(bouton).color            → rgb(252, 249, 243)   // #fcf9f3
getComputedStyle(bouton).backgroundColor  → rgb(252, 249, 243)   // #fcf9f3
```

**Contraste 1,00:1.** Le bouton occupe sa place, réagit au survol et se clique — mais son libellé
n'existe visuellement pas. Ses deux voisins (*Vérifier*, *Suspendre*) sont lisibles.

⚠ **Le défaut ne se voit qu'en thème CLAIR**, ce qui est le thème de tout le monde : sous une
portée `.dark` posée à la main, les jetons basculent et le libellé réapparaît. C'est pourquoi il a
survécu — la seule condition qui le révèle est la condition normale.

## La cause, remontée à la ligne

`takussan-web/src/components/admin/super/agency-detail.tsx:300` :

```tsx
<section className="… rounded-xl bg-foreground p-4 text-background">
```

Ce couple **retourne deux propriétés, il ne retourne pas les jetons.** Tout enfant qui tire son
fond d'une variante continue de lire la palette CLAIRE :

| variante du `Button` | d'où vient son encre | s'en sort ? |
|---|---|---|
| `default` | pose `text-primary-foreground` | ✓ |
| `destructive` | pose `text-destructive` | ✓ |
| **`outline`** | prend `bg-background`, **hérite** `text-background` de la section | **✗ #fcf9f3 sur #fcf9f3** |

La forme juste existe déjà dans le dépôt : `SuperAdminSidebar.tsx:224` et
`SuperAdminTopbar.tsx:49` écrivent la classe **`dark`**, qui bascule les jetons pour tout le
sous-arbre. Leur propre docblock le dit : *« La classe `dark` n'est PAS le mode sombre de
l'utilisateur : c'est une surface sombre. »*

## Ampleur — un seul site, et c'est mesuré

`bg-foreground` apparaît dans **33 fichiers**, mais un seul est un CONTENEUR qui impose
`text-background` à des enfants :

```
Navbar.tsx:314, :369        feuilles (un <a> qui porte les deux classes sur lui-même)
ContractTypeChip.tsx:69     feuille
agency-detail.tsx:300       ← CONTENEUR : le seul cas
```

*Une classe utilitaire n'est dangereuse que là où elle est héritée.*

## Contrat de données

Aucun.

## Delta à produire

- [ ] Remplacer `bg-foreground text-background` par la forme `dark` sur la `<section>`, ou poser
      une encre explicite sur le bouton `outline` — **trancher, et écrire pourquoi**.
- [ ] Vérifier les deux autres boutons du bandeau : ils ne doivent pas changer d'aspect.

## Critères d'acceptation

- [ ] **AC1** — le contraste du libellé *Déverifier* sur son fond est **≥ 4,5:1** en thème clair,
      mesuré par calcul sur les couleurs RENDUES, jamais à l'œil.
- [ ] **AC2** — les trois boutons du bandeau sont mesurés, pas seulement celui qui est en cause :
      un correctif qui réparerait l'un en cassant l'autre passerait un contrôle qui n'en regarde
      qu'un.
- [ ] **AC3** — une garde refuse le motif, pas seulement cette occurrence : un conteneur qui pose
      `bg-foreground` avec `text-background` et contient un descendant tirant son fond d'une
      variante doit rougir. ⚠ Si la garde ne peut pas voir ça statiquement, le dire et se rabattre
      sur un test de rendu qui lit les couleurs calculées — mais **ne pas appeler « garde » un
      test qui n'assert que cette ligne-ci**.
- [ ] **AC4** — ablation : rétablir `bg-foreground text-background` sur le conteneur fait rougir
      AC1 **et** AC3.
- [ ] **AC5** — vérification à l'écran, thème clair, capture du bandeau entier. *C'est une
      vérification à l'écran qui a trouvé ce défaut ; un ratio seul ne l'aurait pas vu, puisque
      personne ne pense à mesurer un bouton qu'il ne voit pas.*

## Hors périmètre

- Le mode sombre utilisateur, qui **n'existe pas** : aucun sélecteur de thème n'est câblé, et
  `.dark` n'est posé aujourd'hui que sur deux surfaces super-admin (mesuré le 2026-08-29, cf. le
  relevé d'AC4 de TCK-450).
- Les 32 autres usages de `bg-foreground`, qui sont des feuilles.

## Notes d'implémentation

Trouvé par la vérification à l'écran de **TCK-450 AC4**, sur un écran ouvert pour une tout autre
raison — le contraste d'une pastille de statut. Le relevé complet, avec les valeurs mesurées, est
dans la section « Ce que l'AC4 a trouvé EN PLUS » de ce ticket.
