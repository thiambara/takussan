---
id: TCK-1085
title: "Le combobox des agences de la console s'ouvre par sa saisie, sans déclencheur laissé sous `aria-hidden`"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, console, accessibilite, pistes]
---

## Contexte

Réf : **P68.06** du fichier de pistes, `validé` (V7). Liste ouverte, Base UI rend `aria-hidden`
tout ce qui est hors de la saisie et du popup ; `AgencyCombobox` portait un `Combobox.Trigger`
dans cette zone, qui gardait le focus sous Chrome (axe : `aria-hidden-focus`). `ui/combobox.tsx`
a déjà retiré son déclencheur pour la même raison.

## Décision du porteur

> aligner `AgencyCombobox` sur `ui/combobox.tsx` : retirer le `Combobox.Trigger`, ouvrir au clic dans la saisie (`openOnInputClick`), et vérifier que `Combobox.Clear` ne reste pas focusable sous `aria-hidden` (porteur, 2026-10-20)

## Objectif

Ouvrir le sélecteur d'agence ne laisse aucun élément focusable du champ sous le masquage.

## Delta à produire

- [x] `AgencyCombobox.tsx` : `Combobox.Trigger` remplacé par un chevron décoratif
      (`pointer-events-none`), la saisie ouvre la liste au clic (`openOnInputClick`, défaut de
      Base UI).
- [x] Clé `console.agencyCombobox.openAria` retirée des trois langues : plus rien ne la lit.
- [x] Test `AgencyCombobox.sans-masquage.test.tsx`.

## Critères d'acceptation

- [x] AC1 : le champ ne porte aucun bouton hors de l'effacement ; un clic dans la saisie ouvre la
      liste.
- [x] AC2 : liste ouverte avec une agence choisie, ni le focus ni aucun élément focusable du
      champ (`tabIndex >= 0`) n'a d'ancêtre `aria-hidden` ou `inert`.

## Hypothèses (mode sans humain)

- `Combobox.Clear` reste dans la zone masquée : Base UI 1.7 le rend en `tabindex="-1"` (mesuré
  sous jsdom), donc hors de l'ordre de tabulation. AC2 le garde ; le retirer quand la liste est
  ouverte n'est pas demandé.

## Hors périmètre

- Ce qu'un lecteur d'écran annonce réellement (non écouté).

## Notes d'implémentation

- Sous jsdom, Base UI déplace le focus dans la saisie même par le déclencheur : le rouge
  reproductible est la présence du déclencheur (AC1), pas le focus. Ablation (composant
  d'origine remis) : AC1 rouge (`[ 'Ouvrir la liste des agences' ]`), AC2 vert ; correctif remis :
  2 verts.
