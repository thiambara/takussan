---
id: TCK-460
title: "Deux ombres recopient `--foreground` en décimal, et le remède évident les casserait sous `.dark`"
status: todo
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-28
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/design-guidelines.md
tags: [front, design-system, jetons, dark, garde]
---

## Objectif utilisateur

Aucun visible aujourd'hui. Le ticket existe pour que la fermeture d'un trou de garde ne casse pas
un écran.

## Contexte

Relevé pendant la revue adverse de [TCK-440](TCK-440-chrome-publique-en-palette-brute.md). Deux
fichiers du périmètre gardé écrivent une couleur à la main **à l'intérieur d'une valeur
arbitraire** :

```
src/components/property/cards/PropertyCardListing.tsx:40   shadow-[0_8px_24px_rgba(31,24,18,0.08)]
src/components/property/cards/PropertyCardStandard.tsx:61  shadow-[0_1px_4px_rgba(31,24,18,0.10)]
```

**`rgba(31, 24, 18)` EST `--foreground`** (`#1f1812`), recopié à la main en décimal. La garde
`check-super-admin-tokens.mjs` ne le voit pas : son contrôle D ne regardait que
`-[#hexadécimal]`, pas une couleur écrite en fonction **à l'intérieur** d'une valeur arbitraire.
Antérieur au lot, donc pas une régression.

## ⚠ Pourquoi le trou a été DÉCLARÉ et non fermé

Parce que **le remède évident repose un piège déjà payé dans ce dépôt.**

Remplacer `rgba(31,24,18,0.08)` par `--foreground` rendrait la garde verte — et **casserait
l'ombre sous `.dark`**, où `--foreground` vaut `#fcf9f3`. L'ombre deviendrait **claire** sur les
surfaces qui portent la classe, et ces surfaces existent : trois portées `.dark` sont posées dans
la console (`SuperAdminSidebar.tsx:224`, `SuperAdminTopbar.tsx:49`, `SuperAdminShell.tsx:80`, la
dernière par un portail).

C'est exactement le motif des **voiles** : un voile écrit `bg-black/50` et non `bg-foreground/50`
parce qu'un voile ne s'inverse pas avec le thème. **Une ombre non plus.**

> *Une ombre a besoin d'un jeton qui ne s'inverse pas, comme un voile.* Le jeton `--scrim` a été
> créé pour cette raison ; la question de ce ticket est de savoir s'il convient ici ou s'il en
> faut un second, distinct, pour les ombres.

## Ce que ce ticket doit décider

1. **Un jeton d'ombre non inversant** — `--scrim` réemployé, ou un `--shadow-color` propre ? Les
   deux ont des arguments : un voile et une ombre ne portent pas la même opacité ni le même rôle,
   mais **en créer un second qui vaut la même chose est une duplication** que la revue de TCK-440
   a déjà refusée pour les voiles.
2. **La fermeture du contrôle D**, dont la forme est déjà mesurée : élargir de `-\[#hex\]` à
   `-\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()`. Éprouvée sur 18 formes — **8
   rougissent** (les deux ombres vivantes comprises), **10 légitimes restent vertes**, **0 faux
   positif**, et l'indirection `var()` reste hors de portée comme la borne le veut.
3. Le sort des **quatre formes déjà déposées dans `EPREUVE` côté « non vues »** : les basculer est
   le diff qui rend la fermeture visible. *C'est le mécanisme qui empêche une fermeture de se
   défaire en silence* — mesuré ailleurs dans ce lot : retirer le corpus d'épreuve **puis** la
   branche de garde rend `exit 0`, sans que rien ne bronche.

## Critères d'acceptation

1. Les deux ombres passent par un jeton, et **une ablation prouve qu'elles ne s'inversent pas**
   sous `.dark` — c'est-à-dire que le correctif ne rejoue pas le piège qui a motivé ce ticket.
2. Le contrôle D est élargi, les quatre formes basculées en « attrapées », et l'ablation dans les
   deux sens : 8 rouges, 10 vertes, 0 faux positif.
3. La borne **déclarée** du contrôle décrit la borne **appliquée** — ni plus, ni moins. *Une borne
   déclarée qui ne décrit pas la borne appliquée est une garde qui se raconte une histoire.*
4. Preuve d'application de chaque ablation par **hachage du contenu** (`md5` du fichier ou
   `git diff | md5`) : ⚠ `git diff --numstat` ne distingue pas une substitution à nombre de lignes
   égal, et `grep -c` peut rendre 0 si le shell réinterprète le motif — les deux défauts ont été
   mesurés dans ce lot.

## Notes

Le périmètre à examiner n'est **pas** limité à ces deux fichiers : la garde ne voyait pas cette
forme, donc rien ne dit que les deux occurrences connues sont les seules. **Dériver.**

---

## Décision — étape 0 du lot, 2026-08-29

### 1. Un jeton PROPRE, `--shadow-color` — et non `--scrim` réemployé

La revue de TCK-440 a refusé un second jeton **qui aurait valu la même chose** que `--scrim`. Ce
n'est pas le cas ici, et c'est mesurable en une ligne :

```
globals.css:158   --scrim: #000000;          ← noir pur
--foreground      #1f1812                    ← brun chaud, la couleur des deux ombres actuelles
```

**Réemployer `--scrim` ne serait pas neutre : il changerait la couleur rendue**, d'un brun chaud
vers un noir pur, sur toute la palette Lin. Ce serait un changement de charte introduit sous
couvert d'une fermeture de garde — exactement ce que le refus de duplication cherchait à éviter,
dans l'autre sens.

**Forme retenue :** `--shadow-color: #1f1812` déclaré dans `:root`, **et redéclaré nulle part
ailleurs** — ni sous `.dark`, ni sous `@media (prefers-color-scheme)`. C'est cette absence qui
porte la propriété « ne s'inverse pas », et c'est elle que l'ablation de l'AC1 doit éprouver :
ajouter une redéfinition sous `.dark` doit faire rougir le test.

Le docblock du jeton doit dire **pourquoi il n'est pas `--scrim`** (la valeur diffère) et
**pourquoi il n'est pas `--foreground`** (il s'inverserait). Sans cette phrase, le prochain
lecteur refera l'un des deux gestes.

⚠ Le jeton porte la **couleur**, pas l'alpha : les appelants écrivent
`shadow-[0_8px_24px_var(--shadow-color)]`… ne convient pas — une couleur nue n'y porte pas
d'opacité. Employer la forme que Tailwind sait composer (`color-mix`, ou un second jeton
`--shadow-color-rgb` consommé en `rgb(var(--shadow-color-rgb)/0.08)`). **Mesurer laquelle rend
réellement l'ombre à l'écran avant de choisir** : c'est le point où ce correctif peut être vert
et invisible.

### 2. Le contrôle D est élargi à la forme déjà mesurée

`-\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()` — la borne éprouvée sur 18 formes
(8 rouges, 10 vertes, 0 faux positif). L'indirection `var()` **reste hors de portée**, et la borne
déclarée doit le dire (AC3).

### 3. Les quatre formes de `EPREUVE` basculent de « non vues » à « attrapées »

C'est ce diff qui rend la fermeture visible et l'empêche de se défaire en silence.

### 4. Le périmètre est DÉRIVÉ, pas recopié

Les deux occurrences connues ne sont pas présumées seules : la garde ne voyait pas cette forme.
Balayer `src/` **avec le motif élargi lui-même** avant de corriger, et écrire le compte trouvé.

---

## Correction de prémisse — mesuré le 2026-08-29

**Le § Contexte désigne `scripts/check-super-admin-tokens.mjs`. Ce n'est pas la garde qui portait
le trou, et la mesure le dit en une commande.**

| ce que le ticket affirmait | ce que la mesure rend |
|---|---|
| « la garde `check-super-admin-tokens.mjs` ne le voit pas : son contrôle D ne regardait que `-[#hexadécimal]` » | son contrôle D porte `(?:rgba?\|hsla?\|hwb\|lab\|lch\|oklab\|oklch\|color)\(` **depuis `10ec116d`** (revue adverse TCK-358→362), et son `EPREUVE` fige `['shadow-[0_0_40px_0_rgba(31,27,23,0.04)]', true]`. Rejoué sur les deux ombres vivantes : **attrapées toutes les deux.** |
| « deux fichiers du **périmètre gardé** » | `components/property` n'est dans **aucun** de ses trois espaces, ni dans la clôture d'imports de `/app` : `node scripts/check-super-admin-tokens.mjs --report` ne nomme ni `PropertyCardStandard` ni `PropertyCardListing`. **Elle ne lit pas ces fichiers.** |

**La garde qui portait réellement le trou est `scripts/check-public-chrome-tokens.mjs`** :
`components/property` est l'un de ses six répertoires, son contrôle D valait exactement
`-\[#[0-9a-fA-F]{3,8}\]`, et son en-tête **nommait déjà les deux fichiers ligne à ligne** sous
« T5 · les VALEURS ARBITRAIRES portant une FONCTION de couleur — **2 occurrences VIVANTES** », avec
la forme de fermeture que la « Décision — étape 0 » recopie mot pour mot. Les quatre formes
« déjà déposées dans `EPREUVE` côté non vues » sont les siennes.

*Deux gardes jumelles, dont l'une porte le nom que tout le monde cite* : la confusion n'a rien
coûté ici parce qu'elle a été mesurée avant d'être appliquée — mais élargir la borne de la garde
super-admin aurait été un diff vert, sans effet, et refermant le ticket sur un trou intact. **La
leçon est celle du dépôt, retournée vers un ticket : on ne déduit pas d'un nom quelle garde lit un
fichier, on le lui demande** (`--report`).

AC2 et AC3 ont donc été implémentés sur `check-public-chrome-tokens.mjs`. `check-super-admin-tokens.mjs`
reçoit deux formes d'`EPREUVE` — la forme d'arrivée et la forme concurrente écartée — et la note
disant que ce n'était pas son trou.
