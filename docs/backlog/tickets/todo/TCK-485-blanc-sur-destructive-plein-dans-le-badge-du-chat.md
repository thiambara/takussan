---
id: TCK-485
title: "Le badge du chat pose du blanc sur `--destructive` plein : 2,45:1 en thème sombre"
status: todo
phase: P2
family: front
estimate: S
wave: 54
created: 2026-08-30
updated: 2026-11-16
depends_on: [TCK-480]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, dette]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai au calcul**, avec deux corrections. Rien n'a été fermé (`git log
--grep=TCK-485` : l'ouverture seule) ; jetons inchangés depuis TCK-480 (`--destructive` `#b70110`
`globals.css:127`, `#ff7f7d` `:826`).

- **Le ratio sombre est faux** : blanc sur `#ff7f7d` = **2,45:1**, pas 2,77 (même formule,
  `scripts/lib/contraste.mjs`, qui rend bien 2,89 pour l'ancien `#ff6467`). Le titre et l'en-tête de
  `check-destructive-contrast.mjs:70-73` portent le même chiffre faux.
- **Le couple sombre n'est rendu nulle part** : le widget est monté par `app/layout.tsx:188`, sous
  aucune des six portées `.dark` (`src/test/portees-sombres.ts`, cf. TCK-452).
- Le badge a quitté `ChatWidget.tsx` pour `components/chat-widget/CorpsDuWidget.tsx:329` et `:356`.
- Sept autres `bg-destructive` pleins portent du texte, tous en `text-background` /
  `text-primary-foreground` : **6,61:1** (clair) / **7,17:1** (sombre), conformes. La solution existe
  donc dans le dépôt, sans décision produit.

Reste : `text-white` → `text-background` aux deux badges ; couple inverse dans
`check-destructive-contrast.mjs` (et retrait du trou déclaré) ; ablation (AC3).

## Objectif utilisateur

Le compteur de messages non lus du chat doit se lire. C'est un chiffre à 11 px, gras, dans une
pastille de 20 px : s'il ne se lit pas, la pastille dit qu'il se passe quelque chose sans dire
quoi.

## Le défaut

`takussan-web/src/components/chat-widget/ChatWidget.tsx:215` et `:239` — deux pastilles
identiques (bureau et mobile) *(2026-11-16 : `components/chat-widget/CorpsDuWidget.tsx:329` et `:356`)* :

```
bg-destructive … text-white
```

L'encre n'est pas le jeton : elle est **posée dessus**. C'est le sens inverse de TCK-480, et
c'est pourquoi ce ticket existe séparément — le correctif de TCK-480 a amélioré le thème clair
et **légèrement dégradé le sombre** :

| thème | avant TCK-480 | après TCK-480 | seuil |
|---|---|---|---|
| clair (`#e7000b` → `#b70110`) | 4,77:1 | **6,94:1** | 4,5 |
| sombre (`#ff6467` → `#ff7f7d`) | **2,89:1** | **2,77:1** — *faux, recalculé le 2026-11-16 : **2,45:1*** | 4,5 |

⚠ **Le défaut est PRÉEXISTANT et il faut le dire ainsi** : le sombre était déjà à 2,89:1 avant
qu'on touche au jeton. TCK-480 lui a coûté 0,12 *(0,44 : 2,89 → 2,45, recalcul du 2026-11-16)*, en tenant AC1 sur le périmètre qui était le
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
  pastille dit, donc une décision produit, pas une décision de couleur. Elle est à 2,77:1 *(2,45:1)*, donc
  même ce seuil-là ne serait pas tenu en sombre.

*2026-11-16 : une quatrième issue est déjà la convention du dépôt — `text-background` (ou
`text-primary-foreground`) sur `bg-destructive` plein, 6,61:1 / 7,17:1, employée par
`commissions/gestes.tsx:399`, `admin/finances/argent/ReversementsAApprouver.tsx:178`,
`announcements/GlobalAnnouncementBanner.tsx:19`, `maintenance/MaintenanceBanner.tsx:80`,
`inventory/terrain/Pastilles.tsx:63`, et au survol `compare/CompareFloatingBar.tsx:622`,
`compare/CompareColonnes.tsx:379`.*

## Contrat de données

Aucun.

## Delta à produire

- [x] Trancher, et écrire la décision avec les deux ratios mesurés.
- [x] Chercher les autres `bg-destructive` PLEIN avant de corriger celui-ci : le relevé du
      2026-08-30 en donne **deux, tous deux dans ce fichier** — mais il partait d'un littéral,
      et une recette de variante ne s'y verrait pas. *(2026-11-16 : faux aujourd'hui — sept autres
      sites pleins, tous conformes ; liste ci-dessus.)*

## Critères d'acceptation

- [x] **AC1** — le texte de la pastille atteint 4,5:1 sur son fond réel, dans les **deux**
      thèmes, mesuré par calcul sur les couleurs RENDUES.
- [x] **AC2** — `node scripts/check-destructive-contrast.mjs` reste vert, et gagne le couple
      inverse : cette garde déclare aujourd'hui, dans « CE QU'ELLE NE VOIT PAS », qu'elle ne
      mesure pas le texte posé SUR le jeton. *Un trou déclaré reste un trou* — c'est la leçon
      que TCK-480 a payée sur `--destructive` lui-même.
- [x] **AC3** — ablation : rétablir le couple d'aujourd'hui fait rougir AC1 et AC2, changement
      prouvé par `md5` **avant** lecture du résultat.

## Hors périmètre

- La valeur du jeton, tranchée par TCK-480 sur des mesures que ce ticket ne rejoue pas.

## Notes d'implémentation

Mesuré en marge de TCK-480, pendant le recensement des littéraux : c'est le seul emploi de
`bg-destructive` **plein** du dépôt *(plus vrai au 2026-11-16 : sept autres, conformes)*, et il était invisible au périmètre du ticket parce que son
encre n'est pas le jeton. *Un recensement par littéraux trouve ce qui peint AVEC ; ce qui est
peint DESSUS demande de retourner la question.*

## Livré (2026-11-16)

- **Décision : `text-white` → `text-background`** aux deux pastilles de `CorpsDuWidget.tsx` (:329
  bureau, :356 mobile) — la convention des sept autres `bg-destructive` pleins. Ratios mesurés :
  **6,61:1** en clair (`#fcf9f3` sur `#b70110`), **7,17:1** en sombre (`#1f1812` sur `#ff7f7d`),
  contre 6,94 / **2,45:1** avant. Le jeton n'est pas touché.
- **Relevé des pleins porteurs d'encre : neuf sites**, dérivés du source par la garde (les deux
  pastilles + `gestes.tsx`, `ReversementsAApprouver.tsx`, `GlobalAnnouncementBanner.tsx`,
  `MaintenanceBanner.tsx`, `Pastilles.tsx`, et au survol `CompareColonnes.tsx`,
  `CompareFloatingBar.tsx`) ; tous ≥ 6,61:1.
- **AC1** — `ChatWidget.badge-contraste.tck-485.test.tsx` : rend le widget, lit les classes des
  DEUX pastilles dans le DOM, les résout contre `JETONS_CLAIR` et `JETONS_SOMBRE`
  (`src/test/contraste-wcag.ts`) et exige 4,5:1. Le widget n'est sous aucune portée `.dark`
  (`portees-sombres.ts`) mais sous `html.dark` au choix de l'utilisateur : le sombre est exigé.
- **AC2** — `check-destructive-contrast.mjs` gagne un **contrôle C** (texte SUR `bg-destructive`
  plein, variantes `hover:`/`group-hover:`/`dark:` appariées à leur `text-*`), le trou déclaré est
  retiré, et un C qui n'apparie rien rougit. ⚠ C lit **ligne par ligne**, pas par le lexeur
  `CHAINES` : celui-ci se désynchronise sur une apostrophe de commentaire et manquait
  `MaintenanceBanner.tsx` et `CompareColonnes.tsx`.
- **AC3** — ablation : `CorpsDuWidget.tsx` d'avant rétabli (md5 `9a9e4e8b…` vérifié avant
  lecture) → le test rougit (2 échecs, `2,45:1`), la garde rougit (2 constats, `:329` et `:356`) ;
  restauré par `cp`, md5 `fc98b7a4…` vérifié.

