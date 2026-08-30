---
id: TCK-477
title: "L'orchestrateur de dock délègue la safe-area iOS à un mécanisme qui n'a jamais existé"
status: todo
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-29
depends_on: [TCK-453]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, mobile, floating-dock, dette]
---

## Objectif utilisateur

Sur un iPhone à encoche, la barre d'action collée en bas d'un écran ne doit pas passer sous
l'indicateur d'accueil. Aujourd'hui rien ne garantit qu'elle ne le fasse pas — et pour la seule
barre qui existe, elle le faisait.

## Le défaut — une délégation vers le vide, ratifiée par un ticket clos

`src/components/floating-dock/useFloatingDockSlot.ts:69-72` :

```ts
if (self.corner === 'bottom-full') {
  // Full-width sticky bars hug the floor (the safe-area inset is the
  // consumer's responsibility — see `safe-area-bottom` on the existing
  // `PropertyMobileBottomBar`).
  return '0px';
}
```

L'orchestrateur renvoie `0px` et **délègue** l'encart de zone sûre au consommateur, en citant
`safe-area-bottom` comme preuve que les consommateurs le font. **Cette classe n'a jamais existé** :
ni dans `globals.css`, ni dans Tailwind, nulle part. Elle n'émettait aucune règle CSS.

⚠ **Trois endroits y croyaient, zéro l'implémentait**, et le troisième est le plus coûteux :

| endroit | ce qu'il en disait |
|---|---|
| `PropertyMobileBottomBar.tsx:73` | l'écrivait dans son `className` |
| `useFloatingDockSlot.ts:70` | la citait comme la preuve que la délégation tient |
| **`TCK-275`, statut `done`** | *« l'orchestrateur respecte `safe-area-inset-bottom` **comme le fait déjà** `PropertyMobileBottomBar` (`safe-area-bottom`) »* |

Un critère d'acceptation d'un ticket **clos** reposait donc sur un mécanisme inexistant. *Une
délégation ne vaut que ce que vaut la vérification que le délégataire l'honore — ici, aucune.*

## Ce que TCK-453 a déjà fait, et ce qui reste

La garde de TCK-453 a **trouvé** la classe morte (c'est sa première prise en service), et le
correctif du site d'appel y est livré. **La classe morte est donc close.**

Ce qui reste est le contrat : le prochain consommateur qui revendiquera `bottom-full` retombera
exactement dans le même trou, et rien ne le lui dira.

⚠ **Le rayon d'action est aujourd'hui de UN**, et c'est mesuré, pas supposé :
`grep -rn "bottom-full" src` ne rend qu'un seul consommateur (`PropertyMobileBottomBar`). Les deux
autres slots du dock — `ChatWidget` et `CompareFloatingBar` — revendiquent `bottom-right`, que
l'orchestrateur décale lui-même. **Ce ticket ne répare donc rien d'observable ; il ferme une
reprise.** À traiter comme tel, et non comme une urgence.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Trancher : l'encart de zone sûre reste-t-il la responsabilité du consommateur, ou
      l'orchestrateur le porte-t-il pour les slots `bottom-full` ? **Écrire la décision**, quelle
      qu'elle soit — c'est l'absence de décision écrite qui a produit le défaut.
- [ ] Si elle reste au consommateur : rendre l'exigence **vérifiable**, pas seulement écrite.

## Critères d'acceptation

- [ ] **AC1** — un slot `bottom-full` qui ne porte aucun encart de zone sûre fait rougir quelque
      chose : un test, une garde, ou un typage qui l'exige. *Un commentaire n'est pas une garde —
      c'est précisément ce qui a échoué ici.*
- [ ] **AC2** — le témoin légitime passe et **est compté** : un slot `bottom-right`, qui n'a pas
      besoin de l'encart, ne doit pas être refusé.
- [ ] **AC3** — ablation : retirer l'encart de `PropertyMobileBottomBar` fait rougir AC1, en
      nommant le fichier.
- [ ] **AC4** — la ligne de correction datée posée dans TCK-275 par TCK-453 est toujours là, et le
      commentaire de `useFloatingDockSlot.ts` ne cite plus de mécanisme inexistant.

## Hors périmètre

- La classe morte elle-même et son remplacement : livrés par TCK-453.
- Le comportement des slots `bottom-right`, qui n'a jamais dépendu de ce mécanisme.

## Notes d'implémentation

Trouvé par la garde de TCK-453 à sa mise en service, puis élargi par la session : la classe morte
était le symptôme, la délégation non vérifiée est la cause, et le ticket clos qui la ratifiait est
ce qui l'a rendue durable.
