---
id: TCK-485
title: "Le badge du chat pose du blanc sur `--destructive` plein : 2,77:1 en thème sombre"
status: todo
phase: P2
family: front
estimate: S
wave: 54
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-480]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, dette]
---

## Objectif utilisateur

Le compteur de messages non lus du chat doit se lire. C'est un chiffre à 11 px, gras, dans une
pastille de 20 px : s'il ne se lit pas, la pastille dit qu'il se passe quelque chose sans dire
quoi.

## Le défaut

`takussan-web/src/components/chat-widget/ChatWidget.tsx:215` et `:239` — deux pastilles
identiques (bureau et mobile) :

```
bg-destructive … text-white
```

L'encre n'est pas le jeton : elle est **posée dessus**. C'est le sens inverse de TCK-480, et
c'est pourquoi ce ticket existe séparément — le correctif de TCK-480 a amélioré le thème clair
et **légèrement dégradé le sombre** :

| thème | avant TCK-480 | après TCK-480 | seuil |
|---|---|---|---|
| clair (`#e7000b` → `#b70110`) | 4,77:1 | **6,94:1** | 4,5 |
| sombre (`#ff6467` → `#ff7f7d`) | **2,89:1** | **2,77:1** | 4,5 |

⚠ **Le défaut est PRÉEXISTANT et il faut le dire ainsi** : le sombre était déjà à 2,89:1 avant
qu'on touche au jeton. TCK-480 lui a coûté 0,12, en tenant AC1 sur le périmètre qui était le
sien — *l'encre peinte AVEC le jeton*. Les deux directions ne se règlent pas ensemble : rendre
le jeton plus clair aide l'encre en sombre et nuit au blanc posé dessus.

## Ce qu'il faut trancher

Le couple « blanc sur rouge plein » n'a pas de solution par la valeur du jeton — les deux
directions se contredisent. Les issues plausibles, sans préjuger :

- une **encre propre à la pastille**, comme le DS le fait ailleurs (`--destructive-foreground`
  n'existe pas aujourd'hui : `grep -rn "destructive-foreground" takussan-web/src` → 0) ;
- un **fond différent en sombre** pour cette pastille, à l'image des variantes `dark:` que
  `MaintenancePriorityBadge` porte déjà ;
- **assumer le seuil non textuel** (3:1) en retirant le chiffre — ce serait changer ce que la
  pastille dit, donc une décision produit, pas une décision de couleur. Elle est à 2,77:1, donc
  même ce seuil-là ne serait pas tenu en sombre.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Trancher, et écrire la décision avec les deux ratios mesurés.
- [ ] Chercher les autres `bg-destructive` PLEIN avant de corriger celui-ci : le relevé du
      2026-08-30 en donne **deux, tous deux dans ce fichier** — mais il partait d'un littéral,
      et une recette de variante ne s'y verrait pas.

## Critères d'acceptation

- [ ] **AC1** — le texte de la pastille atteint 4,5:1 sur son fond réel, dans les **deux**
      thèmes, mesuré par calcul sur les couleurs RENDUES.
- [ ] **AC2** — `node scripts/check-destructive-contrast.mjs` reste vert, et gagne le couple
      inverse : cette garde déclare aujourd'hui, dans « CE QU'ELLE NE VOIT PAS », qu'elle ne
      mesure pas le texte posé SUR le jeton. *Un trou déclaré reste un trou* — c'est la leçon
      que TCK-480 a payée sur `--destructive` lui-même.
- [ ] **AC3** — ablation : rétablir le couple d'aujourd'hui fait rougir AC1 et AC2, changement
      prouvé par `md5` **avant** lecture du résultat.

## Hors périmètre

- La valeur du jeton, tranchée par TCK-480 sur des mesures que ce ticket ne rejoue pas.

## Notes d'implémentation

Mesuré en marge de TCK-480, pendant le recensement des littéraux : c'est le seul emploi de
`bg-destructive` **plein** du dépôt, et il était invisible au périmètre du ticket parce que son
encre n'est pas le jeton. *Un recensement par littéraux trouve ce qui peint AVEC ; ce qui est
peint DESSUS demande de retourner la question.*
