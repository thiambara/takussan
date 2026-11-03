---
id: TCK-471
title: "Le bouton « Déverifier » de la fiche agence est invisible : contraste 1,00:1"
status: done
phase: P1
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
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

- [x] Remplacer `bg-foreground text-background` par la forme `dark` sur la `<section>`, ou poser
      une encre explicite sur le bouton `outline` — **trancher, et écrire pourquoi**.
- [x] Vérifier les deux autres boutons du bandeau : ils ne doivent pas changer d'aspect.

### La décision : la classe `dark`, et non une encre explicite

`agency-detail.tsx:327` porte désormais
`dark … bg-background … text-foreground`, et le sous-titre `text-foreground/70`.

**Pourquoi la portée et non l'encre.** Poser `text-foreground` sur le seul bouton `outline` aurait
rendu ce ticket vert en laissant le piège armé : le conteneur aurait continué de retourner deux
propriétés sans retourner les jetons, et le prochain descendant qui repeint son fond serait tombé
dans le même trou. La classe `dark` **bascule la table de jetons pour tout le sous-arbre** — c'est
la forme déjà écrite par `SuperAdminSidebar.tsx:224` et `SuperAdminTopbar.tsx:49`, dont le docblock
dit l'essentiel : *« la classe `dark` n'est PAS le mode sombre de l'utilisateur : c'est une surface
sombre »*. Le rendu de la section est identique au pixel près (`--background` sous `.dark` vaut
exactement le `--foreground` clair, #1f1812, et réciproquement).

**Ce que la portée change aux deux voisins, et pourquoi c'est le point.** Ils passent aux jetons
sombres — ceux qui sont ACCORDÉS à une surface sombre. Aucun ne se dégrade, les deux s'améliorent
(relevé ci-dessous). *Vérifier* passe de `#a85332` à `#c87a52` : c'est un changement d'aspect, et
c'est celui que la variante `default` prévoit pour une surface sombre. `ConfirmActionDialog` passe
par un **portail** : la portée ne l'atteint pas, il reste clair — vérifié dans `ui/dialog.tsx:53`.

### ⚠ Ce que la re-mesure a contredit dans ce ticket

1. **« Ses deux voisins (*Vérifier*, *Suspendre*) sont lisibles » — FAUX pour *Suspendre*.**
   Mesuré sur l'application servie le 2026-08-30, AVANT correction : `#e7000b` sur `#331611`, soit
   **3,48:1**, sous le seuil AA. Le ticket ne pouvait pas le savoir : *personne ne mesure les
   voisins d'un bouton qu'il ne voit pas*. Après correction il monte à **4,48:1** — mieux, et
   toujours 0,02 sous le seuil. Ce n'est **pas** un défaut de ce bandeau : la variante `destructive`
   de `components/ui/button.tsx` rend ~4,0:1 sur une carte claire, partout dans le dépôt. Corriger
   la primitive partagée est un autre delta, hors du périmètre de ce ticket.

2. **« Un seul est un CONTENEUR » — vrai pour `bg-foreground`, faux pour le MOTIF.**
   Le relevé du ticket cherchait la chaîne `bg-foreground`. La garde cherche l'héritage, et trouve
   un **second** porteur qui n'écrit ni `bg-foreground` ni `text-background` :
   `components/profile/security/TwoFactorSection.tsx:212` — un `<div class="bg-warning/10 …
   text-warning">` contenant un `<button class="bg-warning/20 … text-xs">` sans encre à lui, soit
   **3,94:1** (mesuré le 2026-08-30). Hors périmètre de ce lot (`components/profile/` n'appartient
   pas à ce ticket) : il est **toléré nommément** dans `scripts/check-heritage-encre.mjs`, avec sa
   mesure et sa date, sous un cliquet à sens unique. Il lui faut son propre ticket.
   *Une classe utilitaire n'est dangereuse que là où elle est héritée — encore faut-il chercher
   l'héritage et pas la classe.*

3. Trois faux rouges du premier balayage, tous instructifs et tous fermés par l'auto-épreuve de la
   garde : `PropertyList.tsx` écrit `<Button variant="outline" className="bg-transparent
   text-primary-foreground">` — il **annule** le fond de sa variante et pose son encre, donc il est
   correct ; `FilterSidebar.tsx` pose `bg-primary` sur la piste d'un interrupteur qui **ne porte
   aucun texte**. Lire la recette d'une variante sans le `className` qui la surcharge, ou apparier
   une encre à ce qui n'affiche rien, produit un rouge qui n'apprend rien — et fait désarmer la
   garde.

## Critères d'acceptation

- [x] **AC1** — le contraste du libellé *Déverifier* sur son fond est **≥ 4,5:1** en thème clair,
      mesuré par calcul sur les couleurs RENDUES, jamais à l'œil.
- [x] **AC2** — les trois boutons du bandeau sont mesurés, pas seulement celui qui est en cause :
      un correctif qui réparerait l'un en cassant l'autre passerait un contrôle qui n'en regarde
      qu'un.
- [x] **AC3** — une garde refuse le motif, pas seulement cette occurrence : un conteneur qui pose
      `bg-foreground` avec `text-background` et contient un descendant tirant son fond d'une
      variante doit rougir. ⚠ Si la garde ne peut pas voir ça statiquement, le dire et se rabattre
      sur un test de rendu qui lit les couleurs calculées — mais **ne pas appeler « garde » un
      test qui n'assert que cette ligne-ci**.
- [x] **AC4** — ablation : rétablir `bg-foreground text-background` sur le conteneur fait rougir
      AC1 **et** AC3.
- [x] **AC5** — vérification à l'écran, thème clair, capture du bandeau entier. *C'est une
      vérification à l'écran qui a trouvé ce défaut ; un ratio seul ne l'aurait pas vu, puisque
      personne ne pense à mesurer un bouton qu'il ne voit pas.*

### AC1 + AC2 — le relevé, sur l'application SERVIE, 2026-08-30

`http://127.0.0.1:3000/super-admin/agencies/5`, compte `super@demo.takussan.sn`, thème clair
(aucune classe `.dark` sur `<html>`), Chrome 151 headless piloté en CDP direct. Les couleurs sont
celles que `getComputedStyle` rend, converties en sRGB **par le moteur** (un aplat `oklab(… / 0.1)`
ne se lit pas à la main), le fond composé ancêtre par ancêtre, le rapport calculé par la formule
WCAG 2.1 §1.4.3.

| bouton | variante | avant | après | |
|---|---|---|---|---|
| **Vérifier** | `default` | `#fcf9f3` sur `#a85332` — **5,06:1** | `#1f1812` sur `#c87a52` — **5,31:1** | ✓ |
| **Suspendre** | `destructive` | `#e7000b` sur `#331611` — **3,48:1** | `#ff6467` sur `#4c2723` — **4,48:1** | ⚠ cf. la contradiction n°1 |
| **Déverifier** | `outline` | `#fcf9f3` sur `#fcf9f3` — **1,00:1** | `#fcf9f3` sur `#29221c` — **14,91:1** | ✓ |
| titre `<h2>` | — | 16,69:1 | 16,69:1 | ✓ inchangé |
| sous-titre `<p>` | — | 8,70:1 | 8,70:1 | ✓ inchangé |

Le fond de la section vaut `#1f1812` avant **et** après : la portée `dark` ne change pas la surface,
elle change ce que les descendants lisent.

### AC3 — la garde, et ce qu'elle ne peut pas voir

`scripts/check-heritage-encre.mjs` — statique, sur les 870 `.tsx` de `takussan-web/src/`. Elle ne
cherche **aucune chaîne** : elle relève les CONTENEURS (un littéral de `className` qui pose à la
fois un `bg-<jeton>` et un `text-<jeton>`), puis dans leur sous-arbre les DESCENDANTS qui repeignent
leur fond sans poser d'encre — soit par un `className`, soit par une **variante de
`buttonVariants`** dont la recette est lue dans `components/ui/button.tsx` — et mesure l'encre du
conteneur sur le fond du descendant. Le motif est donc décidable statiquement, `<Button
variant="outline">` compris ; le repli sur un test de rendu n'a pas été nécessaire.

```
$ node scripts/check-heritage-encre.mjs
✓ Encre héritée : 10 couple(s) mesuré(s) ≥ 4.5:1 sur 299 conteneur(s) « bg + text »,
  minimum 5,80:1 — 1 couple(s) TOLÉRÉ(s), 84 jeton(s) non résolu(s), comptés et non mesurés.
```

Elle porte une **auto-épreuve** qui s'exécute à chaque invocation et refuse : un seuil abaissé à 3 ;
une variante `outline` qui ne pose plus « un fond sans encre » ; le motif de ce ticket s'il passait
le seuil ; une surface claire ordinaire (`bg-card text-card-foreground`) si elle était refusée ; **la
correction elle-même** (`dark bg-background text-foreground`) si elle rougissait ; un bouton qui
annule le fond de sa variante ; un élément sans texte ; et un sous-arbre qui déborde sa balise
fermante.

**Ses trous sont déclarés, pas tus** : `--destructive` est en `oklch(…)` dans `globals.css` et reste
**compté et non mesuré** (même politique que `src/test/contraste-wcag.ts`), tout comme les échelles
Tailwind brutes (`text-white`, `bg-stone-700`…) ; l'imbrication est lue au texte et non par un AST ;
`src/test/` et les `__tests__/` sont écartés parce qu'ils CITENT le motif pour prouver qu'il est
refusé.

Le complément de rendu — ce que la lecture de texte ne peut pas composer — est
`takussan-web/src/components/admin/super/__tests__/agency-detail-contrast.test.tsx` : il monte le
bandeau réel, remonte l'encre héritée ancêtre par ancêtre sur l'arbre RENDU, et porte son propre
banc (le motif reconstruit à la main DOIT rougir à 1,00:1 ; une surface claire ordinaire NE DOIT
PAS). 4 tests verts.

### AC4 — l'ablation, rejouée le 2026-08-30

`bg-foreground text-background` rétabli sur la `<section>` (et `text-background/70` sur le
sous-titre) par édition en place ; la modification est prouvée avant lecture du résultat :

```
md5 CORRIGÉ  : acd43d7badfc513b8ba439e76abd7511
md5 ABLATÉ   : 02ed0012b851b08a53109505a0b83fe2
```

| contrôle | ablaté |
|---|---|
| **AC3** `node scripts/check-heritage-encre.mjs` | **code 1** — `agency-detail.tsx · <section> bg-foreground text-background → <Button variant="outline"> → bg-background · encre #fcf9f3 sur fond #fcf9f3 = 1,00:1` |
| **AC1** `npx vitest run …/agency-detail-contrast.test.tsx` | **2 tests rouges sur 4** — *« un descendant repeint son fond et hérite une encre illisible »* |
| **AC1** mesure navigateur, application servie | *Déverifier* retombe à **1,00:1** |

Restauration par `cp` depuis le scratchpad (jamais par `git checkout` : l'arbre est partagé avec
sept autres agents), prouvée par `md5` → `acd43d7badfc513b8ba439e76abd7511`. Les deux contrôles
repassent au vert.

### AC5 — la vérification à l'écran

Bandeau entier, thème clair, `/super-admin/agencies/5`, capture du seul élément (`Page.captureScreenshot`
avec `clip` sur sa `boundingRect`). **Avant** : deux boutons lisibles et **une pastille blanche vide**
là où *Déverifier* devrait s'écrire — le libellé est là, de la couleur de son fond. **Après** : les
trois libellés se lisent.

    scratchpad/lot52/TCK-471/bandeau-avant.png   (état ablaté, 1152×92)
    scratchpad/lot52/TCK-471/bandeau-apres.png   (état corrigé, 1152×92)

*C'est bien l'écran qui tranche : le relevé « avant » du ticket ne mentionnait pas que Suspendre
était lui aussi sous le seuil, parce qu'on ne mesure pas les voisins d'un bouton qu'on ne voit pas.*

## Ce qui reste à faire, et qui n'appartient pas à ce ticket

1. **Brancher la garde dans la CI.** `scripts/check-heritage-encre.mjs` n'est **pas** appelée par
   `.github/workflows/repo-ci.yml`, qui énumère ses gardes une par une (fichier interdit à ce lot).
   Ajouter une étape `run: node scripts/check-heritage-encre.mjs --report`, à la suite de
   `check-profile-badge-contrast.mjs` (ligne 509). **Sans ce branchement, la garde existe et ne
   garde rien.**
2. **`TwoFactorSection.tsx` à 3,94:1** — cf. la contradiction n°2. Toléré nommément dans la garde.
3. **La variante `destructive` de `components/ui/button.tsx`**, ~4,0:1 sur carte claire et 4,48:1
   ici : sous le seuil AA partout où elle sert, et personne ne l'avait mesurée.

## Hors périmètre

- Le mode sombre utilisateur, qui **n'existe pas** : aucun sélecteur de thème n'est câblé, et
  `.dark` n'est posé aujourd'hui que sur deux surfaces super-admin (mesuré le 2026-08-29, cf. le
  relevé d'AC4 de TCK-450).
- Les 32 autres usages de `bg-foreground`, qui sont des feuilles.

## Notes d'implémentation

Trouvé par la vérification à l'écran de **TCK-450 AC4**, sur un écran ouvert pour une tout autre
raison — le contraste d'une pastille de statut. Le relevé complet, avec les valeurs mesurées, est
dans la section « Ce que l'AC4 a trouvé EN PLUS » de ce ticket.
