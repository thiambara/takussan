---
id: TCK-477
title: "L'orchestrateur de dock délègue la safe-area iOS à un mécanisme qui n'a jamais existé"
status: review
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
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

- [x] Trancher : l'encart de zone sûre reste-t-il la responsabilité du consommateur, ou
      l'orchestrateur le porte-t-il pour les slots `bottom-full` ? **Écrire la décision**, quelle
      qu'elle soit — c'est l'absence de décision écrite qui a produit le défaut.
- [x] Si elle reste au consommateur : rendre l'exigence **vérifiable**, pas seulement écrite.

## Critères d'acceptation

- [x] **AC1** — un slot `bottom-full` qui ne porte aucun encart de zone sûre fait rougir quelque
      chose : un test, une garde, ou un typage qui l'exige. *Un commentaire n'est pas une garde —
      c'est précisément ce qui a échoué ici.*
- [x] **AC2** — le témoin légitime passe et **est compté** : un slot `bottom-right`, qui n'a pas
      besoin de l'encart, ne doit pas être refusé.
- [x] **AC3** — ablation : retirer l'encart de `PropertyMobileBottomBar` fait rougir AC1, en
      nommant le fichier.
- [x] **AC4** — la ligne de correction datée posée dans TCK-275 par TCK-453 est toujours là, et le
      commentaire de `useFloatingDockSlot.ts` ne cite plus de mécanisme inexistant.

## Hors périmètre

- La classe morte elle-même et son remplacement : livrés par TCK-453.
- Le comportement des slots `bottom-right`, qui n'a jamais dépendu de ce mécanisme.

## Notes d'implémentation

Trouvé par la garde de TCK-453 à sa mise en service, puis élargi par la session : la classe morte
était le symptôme, la délégation non vérifiée est la cause, et le ticket clos qui la ratifiait est
ce qui l'a rendue durable.

---

## Ce qui a été livré — 2026-08-30

### LA DÉCISION : l'encart reste au CONSOMMATEUR, et cesse d'être délégué à sa bonne volonté

Elle est écrite **dans le code**, au-dessus de `FloatingDockSlotConfig`
(`takussan-web/src/components/floating-dock/types.ts`), et non seulement ici : c'est le fichier
que lira le prochain implémenteur, et le ticket n'a pas vocation à être son point d'entrée.

Trois motifs, dont deux sont des mesures et non des opinions :

1. **`bottom` est le mauvais levier.** L'orchestrateur ne rend qu'une position. Décoller une barre
   pleine largeur du sol de la hauteur de l'encoche ouvrirait une bande transparente sous un
   élément qui a un fond et une bordure haute. L'encart correct est un rembourrage *intérieur*.
2. **Le dock possède la position, pas le balisage** — décision de TCK-275, écrite en tête de
   `FloatingDockProvider`. Il ne rend aucun DOM : il ne peut pas poser un rembourrage sur un
   élément qu'il ne dessine pas.
3. **La composition dépend du consommateur, et la forme naïve est un piège MESURÉ** (TCK-453) :
   `padding-bottom: env(safe-area-inset-bottom)` seul *remplace* le `py-3` de la barre au lieu de
   s'y ajouter, et vaut `0px` sans encoche — iOS corrigé en faisant perdre 12 px à tout le reste.
   Seul le consommateur connaît son propre rembourrage.

### AC1 — la voie retenue est le TYPAGE, et voici pourquoi c'est la seule qui agisse au bon moment

Les trois voies ouvertes par le ticket ne coûtent pas la même chose au même endroit. Un test ou
une garde parlent **après** — au moment où l'on relit un rouge de CI ; le type parle **pendant**,
à la frappe où le défaut naît. Or le défaut d'origine n'est pas qu'on ait mal appliqué l'encart :
c'est qu'on ait pu écrire `corner: 'bottom-full'` sans que rien ne demande quoi que ce soit.

`FloatingDockSlotConfig` est donc devenue une **union discriminée** :

```ts
export type SafeAreaInsetExpression = `${string}env(safe-area-inset-bottom)${string}`;

| (Base & { corner: 'bottom-right'; safeAreaInset?: never })
| (Base & { corner: 'bottom-full';  safeAreaInset: SafeAreaInsetExpression })
```

Le type de motif ne demande pas une *promesse* mais la **valeur elle-même**, et `tsc` en vérifie
la forme. Mesuré : `{ corner: 'bottom-full', height: 70 }` → `TS2345 property 'safeAreaInset' is
missing` ; `safeAreaInset: '0.75rem'` → `TS2322` ; une variable de type `string` → `TS2322`
également. *Un champ booléen `safeAreaHandled: true` aurait exigé une déclaration ; celui-ci exige
la chose.*

**Et le hook rend cette valeur telle quelle sous `paddingBottom`.** Le passe-plat est voulu : sa
valeur n'est pas le calcul — il n'y en a aucun — c'est le **couplage**. Le consommateur n'a aucune
raison d'écrire l'expression deux fois, donc *déclarer* et *appliquer* deviennent un seul geste, et
l'écart entre les deux — qui EST le défaut d'origine — n'a plus d'endroit où se loger.

> ⚠ La forme de retour reste **additive** : `bottom` est inchangé, `paddingBottom` est
> `undefined` pour un `bottom-right`. `ChatWidget` et `CompareFloatingBar` sont hors du périmètre
> de ce lot et n'ont pas été touchés — ce qui est aussi la bonne contrainte de conception.

### Ce que le type ne peut PAS tenir, et qui est tenu ailleurs

Aucun type ne sait si un `paddingBottom` rendu est posé sur un élément ou jeté. C'est très
exactement l'écart d'origine — la barre *déclarait* l'intention (`safe-area-bottom` dans son
`className`) et n'appliquait rien. D'où
`takussan-web/src/components/floating-dock/__tests__/safe-area-contract.test.ts` : un contrôle
**statique** (il lit les sources, il ne rend rien) qui exige de tout consommateur `bottom-full`
qu'il relise `paddingBottom` **hors de l'appel**, et nomme fichier + ligne sinon.

Il vit dans vitest plutôt que dans `scripts/check-*.mjs` pour une raison opérationnelle :
les gardes de `scripts/` sont énumérées une à une dans `repo-ci.yml`, et *un contrôle vert qu'on
ne rejoue pas est un contrôle qui n'existe pas* (TCK-453, AC5). `web-ci.yml` rejoue déjà vitest sur
toute PR touchant `takussan-web/**` : la garde est câblée du premier jour, sans dépendre d'une
étape à poser dans un fichier qui appartient à quelqu'un d'autre.

### L'ABLATION A TROUVÉ UN DÉFAUT — et c'est le meilleur argument de ce ticket

La première version du contrôle cherchait `paddingBottom` dans le texte brut du fichier. **Elle est
passée au VERT sur une barre dont l'encart avait été retiré** : le mot survivait dans un
*commentaire* de cette même barre.

*Une garde satisfaite par un commentaire, dans le ticket dont la phrase d'ouverture est « un
commentaire n'est pas une garde ».* Troisième exemplaire du même piège après les deux de TCK-453
(la prose de docblock, et le commentaire de ligne). Il n'a pas été deviné : il a été **mesuré**,
parce que l'ablation a été jouée avant de lire le résultat.

Remède : `blanchit()` efface commentaires et littéraux de chaîne en **préservant longueurs et
lignes**, et il est gardé par sa propre famille de six cas d'épreuve à plancher égal (patron
TCK-453). Son imprécision connue — l'apostrophe de texte JSX — est déclarée dans l'en-tête avec
sa direction : le blanchiment n'*efface* que, il n'ajoute jamais, donc il peut produire un faux
**rouge**, jamais un faux vert.

### Les ablations, chacune prouvée par empreinte AVANT lecture du résultat

| ce qu'on démonte | md5 avant → démonté → restauré | résultat |
|---|---|---|
| **A — `safeAreaInset` retiré de la configuration** | `58921ad4…` → `52ddae24…` → `58921ad4…` | **rouge `tsc`** : `PropertyMobileBottomBar.tsx(69,57): error TS2345 … 'safeAreaInset' is missing` |
| **B — l'encart déclaré n'est plus appliqué** (`style={{ bottom }}`) | `58921ad4…` → `9dd8ab28…` → `58921ad4…` | **rouge vitest**, nommant `…/PropertyMobileBottomBar.tsx:69` |
| **B rejouée sur la PREMIÈRE version du contrôle** | même empreinte | **VERT à tort** — le défaut ci-dessus, satisfait par un commentaire |

La restauration se fait par `cp` depuis une copie hors dépôt, jamais par `git checkout`, et se
prouve par la même empreinte.

Deux auto-épreuves n'ont pas besoin d'être jouées à la main, et c'est leur intérêt :

- les deux `@ts-expect-error` du fichier de test **se retournent** si le type cessait de refuser —
  `tsc` signalerait alors une directive inutilisée, et `npx tsc --noEmit` sortirait rouge ;
- le témoin `bottom-right` du même fichier ne porte **aucune** directive : il doit compiler tel
  quel. Si l'exigence de `bottom-full` débordait sur lui, `tsc` rougirait aussi (AC2).

### AC2 — le témoin est compté, pas seulement affirmé

Le contrôle relève **1** site `bottom-full` (`PropertyMobileBottomBar`) et **3** sites
`bottom-right` (`ChatWidget` bureau + mobile, `CompareFloatingBar`), et porte un **plancher** par
coin : un relevé vide passerait tout le reste « par construction », qui est le défaut exact que
TCK-453 a payé sur sa version retirée. Un appel dont le `corner` n'est pas un littéral est
**refusé**, jamais sauté : *une mesure absente n'est pas une mesure verte.*

### Ce que la re-mesure a contredit dans l'énoncé du ticket

- **Le commentaire de `useFloatingDockSlot.ts:69-72` ne citait DÉJÀ PLUS `safe-area-bottom` comme
  mécanisme** : TCK-453 l'avait corrigé et y avait ajouté une note datée. Le bloc cité par ce
  ticket décrit l'état d'avant le 2026-08-29. AC4(b) était donc à moitié acquis à l'ouverture ; ce
  qui restait — la délégation elle-même, non vérifiée — est ce qui a été traité.
- **`PropertyMobileBottomBar` portait bien un encart réel** au moment de l'implémentation :
  `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`, livré par TCK-453. Le ticket ne réparait donc
  rien d'observable, comme il l'annonçait lui-même.
- Le reste tient : `grep -rn "bottom-full" src` ne rend toujours **qu'un seul** consommateur, et la
  ligne de correction datée de TCK-275 est **toujours en place** (AC4 (a), vérifié en lecture
  seule).

### Un effet de bord à traiter hors de ce ticket

La barre applique désormais son encart par `style={{ bottom, paddingBottom }}` et **non plus** par
la classe `pb-[calc(…)]` — un style en ligne l'emporte sur toute classe, ce qui supprime au passage
la dépendance à l'ordre *longhand après shorthand* dans la feuille compilée. Conséquence : la note
datée de TCK-453 dans **TCK-275** (« la barre porte désormais `pb-[calc(0.75rem+env(…))]` ») décrit
un mécanisme qui a changé d'un cran. Ce fichier est en lecture seule pour cette implémentation ;
la ligne à y ajouter est remontée à la session.

### Vérifications

```
npx vitest run src/components/floating-dock   → 2 fichiers, 21 tests, 0 échec
npx tsc --noEmit                              → 0 ligne de sortie (arbre entier)
npx eslint <périmètre>                        → 0 erreur
node takussan-web/scripts/check-classes-emises.mjs
                                              → ✓ 1528 classes de 923 fichiers, toutes émises
```

La suite front entière n'a pas été jouée : sept autres agents écrivaient dans `src/` au même
moment, et un temps comme un rouge pris sous cette charge décriraient la machine, pas le dépôt.
