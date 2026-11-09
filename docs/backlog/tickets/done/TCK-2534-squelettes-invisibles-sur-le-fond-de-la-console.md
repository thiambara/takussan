---
id: TCK-2534
title: Les squelettes de chargement sont invisibles sur le fond de la console super-admin
status: done
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [front, super-admin, design-system, loading-state, audit-ux]
---

## Objectif utilisateur

Pendant qu'une liste de la console super-admin se charge, l'opérateur voit que quelque chose
arrive — au lieu d'un grand vide qu'il prend pour une liste vide ou un écran cassé.

## Constat (mesuré)

Relevé par la revue adverse de TCK-2520 (2026-11-09), sur `/super-admin/boosts/agences`, la
requête de la liste suspendue par un `initScript` du navigateur : cinq `div.animate-pulse` sont
bien présents dans le DOM, mais leur fond est **rgb(241, 236, 224)** — exactement celui de `main`.
L'écran montre ~280 px vides pendant tout le chargement.

La cause est dans deux fichiers partagés, et le défaut est **antérieur** à TCK-2520 : il vaut pour
tous les onglets de la console qui affichent un état de chargement directement sur le fond.

- `takussan-web/src/components/ui/skeleton.tsx` — `Skeleton` est `animate-pulse rounded-md bg-muted` ;
- `takussan-web/src/components/layout/SuperAdminShell.tsx` — la coque et sa zone `main` sont
  `bg-muted` (`--muted: #f1ece0` en clair, `#3a2e23` en sombre) ;
- `takussan-web/src/components/console/DataState.tsx` rend ces `Skeleton` pour l'état de
  chargement (utilisé par les listes de la console, dont `DataTable`).

Même couleur que le fond : le squelette n'a aucun contraste, en thème clair comme en sombre.

## Delta à produire

- Donner au squelette un contraste visible sur le fond de la console, sans le perdre sur les fonds
  `--card` et `--background` où il est déjà lisible (le site public et `/app` ne doivent pas
  changer d'apparence) — par exemple un fond de squelette qui se distingue de `--muted`, ou un
  état de chargement des listes de console posé sur une surface `--card`.
- Recenser les écrans de `/super-admin/*` qui rendent un état de chargement directement sur le fond
  de la coque, et vérifier chacun.

## Critères d'acceptation

- [ ] AC1 — Sur `/super-admin/boosts/agences`, requête de liste suspendue : les squelettes se
  distinguent du fond de `main`, en thème clair ET sombre (couleurs calculées différentes, relevées
  au navigateur, 390×844 et 1440×900).
- [ ] AC2 — Un écran du site public et un écran de `/app` qui affichent des squelettes gardent leur
  apparence (relevé avant/après).

## Hors périmètre

- Le contenu des états vide et erreur, déjà lisibles (revue de TCK-2520).

## Notes d'implémentation

**Mesuré le 2026-11-09 (agent console, vague 2)** — `/super-admin/boosts/agences`, requête de la liste
suspendue par un `initScript` (`fetch` des `agency-spotlights` jamais résolu), couleurs calculées au
navigateur, contraste WCAG squelette / fond de `main` :

| | fond de `main` | avant (`--muted`) | après | rapport avant → après |
|---|---|---|---|---|
| clair, 1440 × 900 et 390 × 844 | rgb(241, 236, 224) | rgb(241, 236, 224) | rgb(217, 212, 201) | 1,00 → 1,25 |
| sombre (`.dark`), 390 × 844 | rgb(58, 46, 35) | rgb(58, 46, 35) | rgb(75, 64, 53) | 1,00 → 1,31 |

(« avant » rejoué sur la même page en reposant `--skeleton: var(--muted)` sur `main`, ce qui rend
exactement l'ancien `bg-muted`.)

- **Correctif** : `Skeleton` lit `bg-[var(--skeleton,var(--muted))]` ; seule la zone `main` de
  `SuperAdminShell` pose `--skeleton: color-mix(in oklab, var(--foreground) 10%, var(--muted))`,
  mélangé SUR `main` pour suivre le thème (plus sombre en clair, plus clair en sombre). Ailleurs la
  variable est absente : le squelette garde `--muted`.
- **AC2** : sondes au navigateur sur `/app` (`main` `bg-background`) et `/fr/agents`, clair et sombre :
  ancienne classe et nouvelle rendent la même couleur (rgb(241, 236, 224) / rgb(58, 46, 35)), `--skeleton`
  absente.
- **Recensement — corrigé après la revue adverse.** La première version de cette note affirmait que
  tous les écrans passaient par `DataState` : **faux**. Trois squelettes « maison »
  (`div animate-pulse bg-muted`) ne lisaient pas `--skeleton` et restaient invisibles sur `main`.
  Relevé exact par `grep -rn "animate-pulse" src/app/(super-admin) src/components/admin*
  src/components/super-admin src/components/layout/SuperAdmin*` (hors tests) :

  | Fichier | Écran | Avant | Après |
  |---|---|---|---|
  | `src/app/(super-admin)/super-admin/properties/page.tsx:82` | `/super-admin/properties`, 6 lignes `h-12` | 1,00 | `<Skeleton>`, 1,25 clair / 1,31 sombre |
  | `src/app/(super-admin)/super-admin/agencies/page.tsx:246` | `/super-admin/agencies`, 4 cartes `h-32` | 1,00 | `<Skeleton>`, 1,25 / 1,31 |
  | `src/components/admin/super/integrations.tsx:175` | boîte « Éditer » de `/super-admin/integrations` | 1,18 / 1,21 | `<Skeleton>`, inchangé : 1,18 / 1,21 |

  Après correction, le même `grep` ne rend plus rien. Les trois mesurés au navigateur, requête suspendue
  par `initScript` (`/api/super-admin-properties`, `/api/super-admin/agencies`,
  `/api/super-admin/integrations/{id}/schema`), à 1440 × 900 et 390 × 844, clair et sombre, sans
  débordement horizontal. La boîte d'intégration est rendue en portail HORS de `main` : `--skeleton` y est
  absente et le squelette garde `--muted` sur le fond blanc de la boîte. Il y était déjà lisible ; le
  passage à `<Skeleton>` ne l'a pas changé (couleur identique, mesurée).
  Ailleurs : `DataState` est monté par ~40 écrans de `/super-admin/*`, sous `main`, et hérite du
  correctif — y compris dans une carte `bg-card` (rgb(241, 236, 224) → rgb(217, 212, 201) sur blanc).
  `DataTable` ne rend aucun squelette lui-même. Les autres `animate-pulse` du dépôt (`PropertyRow`,
  `MediaManager`, boîtes de paiement…) ne sont montés par aucun écran de la console.
- `check-super-admin-tokens.mjs` vert (aucune couleur littérale : `var()` et `color-mix` de jetons).
- Garde : `src/components/ui/__tests__/skeleton.surface.tck-2534.test.tsx` (branchement seulement,
  jsdom ne calcule pas les couleurs) ; trois ablations rouges (squelette remis en `bg-muted`,
  `--skeleton` retirée de la coque, `--skeleton` posée à `var(--muted)`).
- Garde du recensement : `src/components/ui/__tests__/skeleton.recensement.tck-2534.test.ts`, deux
  assertions sur le source (commentaires retirés). (1) Aucun `animate-pulse` sur les surfaces de la
  console, avec une assertion de non-vacuité sur les trois fichiers fautifs. Ablation : le `div` maison
  remis dans `properties/page.tsx` → rouge, nommant ce fichier. (2) `--skeleton:` n'est posée que par
  `SuperAdminShell.tsx`, partout dans `src/` : ni `AppShell`, ni le site public, ni une feuille de style.
  Ablation : `[--skeleton:var(--primary)]` ajoutée au `main` d'`AppShell` → rouge, nommant
  `AppShell.tsx`. Les deux fichiers restaurés par `cp` (md5 8dfa713e…, 29cf39c9…).
