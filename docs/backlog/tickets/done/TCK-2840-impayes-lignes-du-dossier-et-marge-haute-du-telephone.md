---
id: TCK-2840
title: "Impayés : lignes du dossier sans min-h-11 au bureau, marge haute du téléphone à 20 px au lieu de 36"
status: done
phase: P1
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2822]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [front, fidelite, impayes, audit-ux, app]
---

## Objectif utilisateur

L'écran Impayés tombe sur la maquette validée par le porteur le 2026-11-14 : le dossier ne s'étire pas plus bas que
dessiné, et le contenu du téléphone commence là où la maquette le pose.

## Origine

Regel de TCK-2822 (2026-11-14) : la comparaison du produit (HEAD 928e9c810) à la référence regelée laisse deux écarts
qui n'entrent dans aucune des trois exceptions d'ADR-0106 § 2. Ils sont nommés dans `ecarts_ouverts` de
`docs/qa/audit-ux-2026-11/fidelite/TCK-2660.json`. Décision du chef d'équipe le 2026-11-14 : un ticket de suite pour les deux.
Preuves : `takussan-web/.fidelite/TCK-2660-20261114/` (`cmp-a-2-bureau-1280`, `cmp-a-1-telephone`, `cmp-a-2-telephone`).

## Delta à produire

1. **Lignes clés du dossier** (`components/admin/finances/impayes/DossierDImpaye.tsx`, `LigneCle`, l. 125) : retirer
   `min-h-11`. Les lignes ne sont pas interactives : au bureau 1280, elles mesurent 39,6 px contre 33,4 à la maquette
   (`py-2`), soit +6,2 px par ligne (+26 px cumulés sur les quatre tranches d'« Ancienneté du dû »). Si une ligne
   devient interactive au téléphone, garder `min-h-11` à ce seul cas.
2. **Marge haute du contenu au téléphone** : le total dû est à y 92 contre 76 à la maquette (`main` à y 56 des deux
   côtés, aucun nœud entre les deux) — 36 px au lieu de 20. Établir la cause (page ou coque) avant de corriger. Si
   elle vient de la coque commune à `/app`, le dire et ne corriger que si le chef d'équipe l'accepte.

## Critères d'acceptation

- [x] AC1 — Au bureau 1280, dossier tel qu'ouvert (`?tab=impayes`, 3ᵉ rangée), les lignes d'« Ancienneté du dû »
  mesurent 33,4 px (±1) et « Ancienneté du dû » n'a plus d'écart de y venu de la hauteur des lignes.
  *Preuve (2026-11-14) : `.fidelite/TCK-2840-20261114/prod-a-2-bureau-1280.json` — tranches à 33,4 px (39,6 au regel) ;
  test `impayes/__tests__/marges.tck-2840.test.tsx` (rouge avant le correctif).*
- [x] AC2 — Au téléphone (390), « 33 715 000 F » (ou le total de la base) est à y 76 (±2) sur a-1 et a-2 ; « Par
  locataire » et la 1re carte n'ont plus le décalage de +16 à +18 px.
  *Preuve : total à y 76 sur a-1 et a-2, « Par locataire » à 172 (maquette 172), plus d'écart de y sur le rôle « 1re
  carte » (`cmp-a-1-telephone/rapport.md`). Cause : la page — `pt-4` du `TabsContent` « impayes » d'`AdminFinancesTabs`
  (12 + 16 + 8 = 36), retiré au téléphone ; la coque n'est pas touchée.*
- [x] AC3 — La fiche TCK-2660 ne porte plus d'`ecarts_ouverts` renvoyant à TCK-2840 ; les comparaisons à 390 et 1280
  y sont refaites et datées.
  *Preuve : `ecarts_ouverts` vide ; `comparaisons.suite_tck_2840_2026_11_14` (a-1 et a-2 à 390, a-1 et a-2 à 1280).*
- [x] AC4 — Les lignes du dossier restent lisibles à 390 et 1024 (aucun débord, `scrollWidth − innerWidth = 0`).
  *Preuve : `debord-a-2-bureau-1024.json` et `-1280` (dossier ouvert) : 0, aucune ligne ne déborde ; à 390 (liste) : 0 —
  le dossier n'est monté qu'au bureau.*

## Hors périmètre

- La maquette et les références (regelées par TCK-2822).
- Les autres écarts de la fiche TCK-2660, déjà acceptés ou ignorés.
