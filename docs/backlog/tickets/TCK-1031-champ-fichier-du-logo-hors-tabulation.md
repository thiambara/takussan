---
id: TCK-1031
title: "Le champ fichier masqué du logo d'agence sort de l'ordre de tabulation"
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
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, a11y, agency, pistes]
---

## Contexte

Réf : **P68.03** du fichier de pistes, `retenu · autonome` (A4). Dans `AgencyConfigForm`,
l'`input type="file"` `#agency-logo` est en `sr-only`, sans nom et sans `tabIndex={-1}` ; le
bouton visible qui l'ouvre le suit. Au clavier, on tombe d'abord sur un contrôle sans nom (axe :
`label`, « critical », sur `/app/agency`).

## Objectif

Seul le bouton « logo » est atteint au clavier ; le champ fichier reste un relais technique.

## Delta à produire

- [x] `AgencyConfigForm.tsx` : `tabIndex={-1}` et `aria-hidden="true"` sur `#agency-logo`.
- [x] Test : aucun `input[type=file]` du formulaire n'est à la fois focusable et exposé sans nom.

## Critères d'acceptation

- [x] AC1 — `#agency-logo` porte `tabIndex=-1` et `aria-hidden="true"`.
- [x] AC2 — Le bouton visible ouvre toujours le sélecteur (il appelle `click()` sur l'`input`).
- [x] AC3 — Ablation : sans les deux attributs, le test rougit.

## Hypothèses (mode sans humain)

- L'option retenue est la première de la piste (attributs sur l'`input`) : elle ne change ni le
  rendu ni le texte, alors qu'un `<label>` stylé en bouton changerait le composant du bouton.

## Hors périmètre

- Les autres champs fichier masqués de l'application.

## Notes d'implémentation

- Avant correctif, `#agency-logo` est focusable et sans nom : le test rougit sur lui.
- Ablation : les deux attributs retirés → le premier test rouge ; remis → vert. Le second test
  (le bouton appelle `click()` sur l'`input`) est vert dans les deux cas : il garde le geste, pas
  le défaut. `src/components/admin-agency` reste vert (8 fichiers).
