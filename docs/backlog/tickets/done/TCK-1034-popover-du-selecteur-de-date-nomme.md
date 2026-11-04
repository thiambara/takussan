---
id: TCK-1034
title: "Le popover du sélecteur de date et d'heure porte le nom de son déclencheur"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, a11y, aria, ui, pistes]
---

## Contexte

Réf : **P68.05** du fichier de pistes, `retenu · autonome` (A4). Ouvert, le `PopoverContent` de
`ui/date-time-picker.tsx` rend `role="dialog"` sans `aria-label` ni `aria-labelledby` (axe
`aria-dialog-name`). Le composant reçoit pourtant un `aria-label`, qu'il ne pose que sur le
déclencheur ; et 5 de ses 6 appelants n'en passent aucun (mesure du mesureur), si bien que
recopier le seul `aria-label` laisserait la plupart des popovers sans nom.

## Objectif

Le dialogue du sélecteur porte toujours un nom accessible, sans texte neuf.

## Delta à produire

- [x] `ui/date-time-picker.tsx` : `aria-label` reçu posé sur le `PopoverContent` ; à défaut,
      `aria-labelledby` vers le déclencheur, dont l'`id` se replie sur un `useId()` quand
      l'appelant n'en passe pas.
- [x] Test : `src/components/ui/__tests__/date-time-picker.nom-du-dialogue.test.tsx`, qui ouvre
      le sélecteur et attend `getByRole('dialog', { name })`, avec et sans `aria-label`.

## Critères d'acceptation

- [x] AC1 — Avec `aria-label`, le dialogue porte ce nom.
- [x] AC2 — Sans `aria-label`, le dialogue porte le texte du déclencheur (placeholder ou date
      choisie).
- [x] AC3 — Aucune clé de traduction neuve ; l'`id` passé par l'appelant reste celui du
      déclencheur.

## Hypothèses (mode sans humain)

- Le nom du déclencheur suffit au dialogue : c'est lui que l'utilisateur vient d'activer, et la
  piste n'en demande pas d'autre.

## Hors périmètre

- Les autres popovers montés par `ui/popover.tsx`, dont `ui/date-picker.tsx`, que la piste n'a
  pas mesurés.

## Notes d'implémentation

- Avant correctif, le test trouve bien un `dialog` ouvert (`findByRole('dialog')`), mais aucun
  qui porte le nom attendu : c'est le nom qui manque, pas le montage.
- Ablation : correctif retiré → 2 rouges ; remis → 2 verts.
