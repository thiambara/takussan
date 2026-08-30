---
id: TCK-480
title: "Le jeton `--destructive` est sous AA en thème clair, partout où il porte du texte"
status: todo
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

- [ ] Trancher, et écrire la décision **avec le nombre de surfaces affectées**, mesuré.
- [ ] Recenser tout ce qui peint du texte avec ce jeton — pas seulement `StatusBadge` et `Button`.
- [ ] Vérifier que le thème sombre ne régresse pas : il passe aujourd'hui.

## Critères d'acceptation

- [ ] **AC1** — tout texte peint avec `--destructive` atteint **4,5:1** sur la surface où il est
      réellement posé, dans les **deux** thèmes, mesuré par calcul sur les couleurs RENDUES.
- [ ] **AC2** — le recensement ne part **pas** des importateurs du jeton : il part des littéraux
      (`text-destructive`, `bg-destructive`, `border-destructive`) et des recettes de variantes.
      *Un relevé qui part des importateurs ne voit que les usages corrects* — la leçon de TCK-472.
- [ ] **AC3** — une garde refuse le retour sous seuil. `scripts/check-profile-badge-contrast.mjs`
      et `scripts/check-chart-contrast.mjs` portent déjà la formule et le patron ; l'étendre plutôt
      que d'en écrire une troisième, **ou dire pourquoi c'est impossible**.
- [ ] **AC4** — ablation : rétablir la valeur d'aujourd'hui fait rougir AC1 **et** AC3, et le
      changement est prouvé par `md5` **avant** qu'on lise le résultat.
- [ ] **AC5** — vérification à l'écran, thème clair, sur au moins un bouton et une pastille.
      *C'est une vérification à l'écran qui a trouvé le défaut de TCK-471 ; un ratio seul ne
      l'aurait pas vu.*

## Hors périmètre

- Les autres jetons de la palette, qui n'ont pas été mesurés ici et dont on ne préjuge pas.
- Le mode sombre utilisateur, qui n'existe toujours pas (aucun sélecteur n'est câblé).

## Notes d'implémentation

Relevé deux fois indépendamment pendant le lot de la vague 52, par TCK-471 et TCK-472, sur des
écrans sans rapport et en cherchant autre chose. Aucun des deux ne pouvait le corriger sans sortir
de son périmètre — et c'est bien un jeton, pas un écran.
