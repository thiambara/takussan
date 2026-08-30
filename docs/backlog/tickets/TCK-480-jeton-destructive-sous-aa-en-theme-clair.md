---
id: TCK-480
title: "Le jeton `--destructive` est sous AA en thème clair, partout où il porte du texte"
status: done
phase: P1
family: front
estimate: M
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-471, TCK-472]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, jeton, dette]
---

## Objectif utilisateur

Un libellé rouge — « Suspendre », « Rejeté », « Supprimer » — doit se lire. Aujourd'hui il se lit
mal partout à la fois, et pour une seule raison : le jeton lui-même.

## Le défaut — deux tickets l'ont rencontré séparément, c'est le même

Ni TCK-471 ni TCK-472 ne cherchaient ce défaut ; tous deux l'ont heurté en mesurant autre chose,
sur des écrans sans rapport. **C'est la signature d'un défaut de jeton et non d'un défaut d'écran.**

| relevé par | surface | ratio mesuré (thème clair) |
|---|---|---|
| TCK-472 | le ton `danger` de `StatusBadge`, sur ses **7** surfaces réelles | **3,41 – 3,99:1** |
| TCK-471 | la variante `destructive` de `ui/button.tsx`, sur carte claire | **~4,0:1** |
| TCK-471 | le bouton « Suspendre » de la fiche agence, **après** son correctif | **4,48:1** |

Valeurs du jeton, relevées au moteur de rendu (canvas CDP, 2026-08-30) : `#e7000b` en clair,
`#ff6467` en sombre.

⚠ **Le 4,48:1 de la dernière ligne est le plus instructif.** TCK-471 a fait passer ce bouton de
3,48 à 4,48:1 en corrigeant son conteneur — et il reste **sous les 4,5:1**. Un correctif d'écran
ne peut pas rattraper un jeton : il en approche, ce qui est pire, parce que le chiffre cesse
d'être manifestement faux.

⚠⚠ **En thème sombre, `#ff6467` passe.** Le défaut est unilatéral, et c'est le thème de tout le
monde qui le porte — exactement le motif de TCK-471.

## Ce qu'il faut trancher avant de coder

Le rouge d'erreur du DS est une **couleur de marque autant qu'un signal**. Les deux issues sont
légitimes et ce ticket ne préjuge pas :

- **assombrir `--destructive` en clair** jusqu'à 4,5:1 sur les surfaces qui portent du texte ;
- **dissocier** le jeton de fond du jeton d'encre (`--destructive` / `--destructive-ink`), ce que
  la palette fait déjà ailleurs.

*Relever un seuil sans regarder ce qui l'emploie, c'est repeindre 7 surfaces pour en réparer une.*

## Contrat de données

Aucun.

## Delta à produire

- [x] Trancher, et écrire la décision **avec le nombre de surfaces affectées**, mesuré.
- [x] Recenser tout ce qui peint du texte avec ce jeton — pas seulement `StatusBadge` et `Button`.
- [x] Vérifier que le thème sombre ne régresse pas : il passe aujourd'hui.

## Critères d'acceptation

- [x] **AC1** — tout texte peint avec `--destructive` atteint **4,5:1** sur la surface où il est
      réellement posé, dans les **deux** thèmes, mesuré par calcul sur les couleurs RENDUES.
- [x] **AC2** — le recensement ne part **pas** des importateurs du jeton : il part des littéraux
      (`text-destructive`, `bg-destructive`, `border-destructive`) et des recettes de variantes.
      *Un relevé qui part des importateurs ne voit que les usages corrects* — la leçon de TCK-472.
- [x] **AC3** — une garde refuse le retour sous seuil. `scripts/check-profile-badge-contrast.mjs`
      et `scripts/check-chart-contrast.mjs` portent déjà la formule et le patron ; l'étendre plutôt
      que d'en écrire une troisième, **ou dire pourquoi c'est impossible**.
- [x] **AC4** — ablation : rétablir la valeur d'aujourd'hui fait rougir AC1 **et** AC3, et le
      changement est prouvé par `md5` **avant** qu'on lise le résultat.
- [x] **AC5** — vérification à l'écran, thème clair, sur au moins un bouton et une pastille.
      *C'est une vérification à l'écran qui a trouvé le défaut de TCK-471 ; un ratio seul ne
      l'aurait pas vu.*

## Hors périmètre

- Les autres jetons de la palette, qui n'ont pas été mesurés ici et dont on ne préjuge pas.
- Le mode sombre utilisateur, qui n'existe toujours pas (aucun sélecteur n'est câblé).

## Notes d'implémentation

Relevé deux fois indépendamment pendant le lot de la vague 52, par TCK-471 et TCK-472, sur des
écrans sans rapport et en cherchant autre chose. Aucun des deux ne pouvait le corriger sans sortir
de son périmètre — et c'est bien un jeton, pas un écran.

### La décision : assombrir, et plafonner les aplats — les deux, pas l'un

Le ticket proposait deux issues (assombrir / dissocier fond et encre). **Ni l'une ni l'autre seule
ne suffisait**, et c'est le fait qui gouverne tout le reste.

- **Assombrir seul** aurait exigé, en thème sombre, un rose délavé (`#ffb3af`, chroma 0,089 contre
  0,191) pour tenir un aplat `/30`. Le jeton aurait payé le poids des aplats.
- **Dissocier** (`--destructive` / `--destructive-ink`) aurait demandé de renommer **236**
  occurrences de `text-destructive` dans 110 fichiers, et laissé toute nouvelle occurrence
  régresser en silence.

Retenu : le jeton descend en clair, monte très peu en sombre, et **aucun aplat porteur de
`text-destructive` ne dépasse `/10`** — 11 recettes corrigées. Le plafond a un sens opposé selon
le thème, ce qui n'était écrit nulle part : en clair l'encre est sombre, son aplat assombrit la
surface et *éloigne* les deux ; en sombre l'encre est claire, son aplat *rapproche*. Sur `--muted`
sombre, `/15` rend 4,16:1 quand `/10` rend 4,55:1.

|  | avant | après |
|---|---|---|
| jeton clair | `oklch(0.577 0.245 27.325)` = `#e7000b` | `#b70110` |
| jeton sombre | `oklch(0.704 0.191 22.216)` = `#ff6467` | `#ff7f7d` |
| ton `danger`, 7 surfaces réelles, clair | 3,40 – 4,01:1 | **4,93 – 5,77:1** |
| ton `danger`, 7 surfaces réelles, sombre | 3,97 – 5,29:1 | **4,55 – 5,51:1** |

### Trois choses que le ticket ne pouvait pas savoir

1. **Le thème sombre était fautif LUI AUSSI.** Le ticket écrivait « en thème sombre, `#ff6467`
   passe », et c'était vrai — sur les surfaces NUES, celles qu'on pense à mesurer. Il rendait
   3,39:1 sur son propre aplat `/30` et 4,10:1 sous le ton `danger` posé sur les lignes
   `bg-muted` de `kyc-queue.tsx` et `moderation.tsx`.
2. **Une garde qui hérite le jeu de surfaces d'une autre hérite son périmètre.** La première
   version de `check-destructive-contrast.mjs` ne mesurait que `--background` et `--card` — les
   surfaces de `check-profile-badge-contrast.mjs` — et **est passée au vert sur un jeu de valeurs
   qui laissait `danger` à 4,10:1**. C'est la liste des sept surfaces de
   `StatusBadge.contraste-tck-450.test.tsx` qui l'a rattrapée. `--muted` est désormais mesurée :
   elle majore les deux autres dans les deux thèmes.
3. **Un jeton irrésolvable ne produit pas un rouge, il produit un silence.** `--destructive` était
   le seul jeton non hexadécimal ; `src/test/contraste-wcag.ts` ET `check-heritage-encre.mjs` le
   déclaraient « compté et non mesuré », chacun avec un bon motif. Le trou déclaré portait
   précisément sur le jeton qui échouait. Il est converti en hexadécimal à la source, la
   conversion confrontée au relevé pris au moteur de rendu (`oklch(0.577 0.245 27.325)` → `#e7000b`
   et `oklch(0.704 0.191 22.216)` → `#ff6467`, exactement). Conséquences mesurées, toutes deux
   attendues : `check-heritage-encre.mjs` passe de 10 à 11 couples mesurés, et
   `surface-publique.contraste.test.ts` voit son cliquet d'irrésolvables tomber de 54 à 43 — onze
   fichiers sortis d'un coup, sans qu'une ligne n'y soit touchée. Le message du cliquet ne
   nommait qu'une cause de descente (« un fichier a été converti ») ; il en nomme deux désormais.

### AC3 — une garde sœur, et une formule extraite plutôt qu'une quatrième copie

L'AC demandait d'étendre une garde existante « ou de dire pourquoi c'est impossible ». Ni l'un ni
l'autre : `check-profile-badge-contrast.mjs` mesure une TABLE FIGÉE dans un composant, celle-ci
balaie UN JETON sur tout `src/` avec un jeu d'aplats dérivé du code et séparé par thème — l'étendre
lui aurait fait dire autre chose que son nom. Mais le fichier d'où elle vient portait déjà l'aveu
de TROIS implémentations du calcul WCAG ; **la formule est donc partie dans `scripts/lib/contraste.mjs`**
(patron de `scripts/lib/env-keys.mjs`), et `check-profile-badge-contrast.mjs` l'importe désormais.
Preuve de non-régression : sa sortie `--report` est identique au caractère près avant et après.

### AC5 — ce qui a été regardé, et ce qui ne l'a pas été

Les deux recettes (bouton `destructive`, pastille `danger`) ont été rendues **dans un vrai
navigateur** avec les jetons réels, sur `--card` et sur `bg-muted`, avant/après côte à côte. Le
libellé cesse d'être filant et le rouge reste un rouge. ⚠ **Ce n'est pas un écran de
l'application** : le serveur de développement n'a pas été lancé, aucune route n'a été parcourue.

### Deux défauts constatés au passage, NON corrigés ici

- `ChatWidget.tsx` pose `bg-destructive` PLEIN sous du `text-white` : **2,89:1 en thème sombre
  avant ce ticket, 2,77:1 après**. L'encre n'y est pas le jeton, elle est dessus — hors du
  périmètre d'AC1, défaut préexistant, et ce ticket le dégrade de 0,12. Voir TCK-485.
- Les aplats translucides au survol de `CalendarPage.tsx:280` et `BrandingBanner.tsx:46` (relevé
  de TCK-481) : voir TCK-486.
