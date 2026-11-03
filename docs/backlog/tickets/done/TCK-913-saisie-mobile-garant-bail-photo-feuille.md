---
id: TCK-913
title: "Saisie au téléphone : garant en tel:, montants du bail au clavier numérique, « Prendre une photo », feuille en dvh"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations"
tags: [front, mobile, pistes]
---

## Contexte

Réf : **P08.10** du fichier de pistes (angle 8, parcours sur téléphone), `validé` (V7 accordé).

Re-mesuré sur `pre-dev` = `f41284c32` :

- `leases/GuarantorSection.tsx` : téléphone du garant affiché en texte, saisi dans un `FormInput`
  sans `type` ;
- `leases/CreateLeaseForm.tsx` : loyer, prix de vente, caution et jour de paiement en
  `type="number"` sans `inputMode` ;
- `ui/sheet.tsx:102` : `max-h-[90vh]` ;
- `(public)/properties/[slug]`, `agencies/[slug]`, `agents/[slug]` : aucun `loading.tsx` ;
- `MediaDropzone` (photos du bien, `StepPhotos.tsx`, et de l'état des lieux, `InventoryDetail.tsx`)
  sans `capture`.

## Décision du porteur

validé — selon la piste

## Objectif utilisateur

Au téléphone, l'agent appelle le garant d'un appui, tape les montants du bail au clavier numérique,
prend la photo d'une pièce ou d'un bien sans passer par la galerie, et voit le bas d'une feuille.

## Delta à produire

- [x] Garant : lien `tel:` à l'affichage, `PhoneInput` (indicatif en préfixe, valeur E.164) à la
  saisie.
- [x] Bail : loyer, prix de vente et caution par `FormAmountInput` (devise du formulaire) ; jour de
  paiement en `inputMode="numeric"`.
- [x] `ui/sheet.tsx` : `max-h-[90dvh]`.
- [x] `MediaDropzone` : prop `camera`, second bouton « Prendre une photo »
  (`capture="environment"`), masqué sous pointeur fin ; posé sur les photos du bien et de l'état
  des lieux. Clé `media.take_photo` en fr/en, `wo` en français.

## Critères d'acceptation

- [x] AC1 — Le téléphone d'un garant est un lien `tel:` ; son champ est `type="tel"`, indicatif
  `+221` affiché.
- [x] AC2 — Loyer et caution portent `inputmode="numeric"` (XOF), ne sont plus des
  `type="number"`, et « 250000 » se relit « 250 000 ».
- [x] AC3 — La feuille du haut et du bas se plafonne en `dvh`.
- [x] AC4 — Avec `camera`, un champ « Prendre une photo » porte `capture="environment"`, sans
  `multiple`, et remet la photo prise comme la zone.

## Hors périmètre — reste

- **Les squelettes de chargement des fiches publiques** (bien, agence, agent). Un `loading.tsx`
  sous `[slug]` ouvre une frontière de suspension sur la page : la réponse part avant `notFound()`,
  et une fiche introuvable sort en **200**, soft-404 mesuré par ablation par TCK-335 (voir l'en-tête
  de `properties/(liste)/loading.tsx`). Le squelette demande donc une autre forme (un `<Suspense>`
  sous la page, après la décision de 404), à choisir : il reste à faire.

## Hypothèses

- Le bouton photo ne s'affiche que sous pointeur grossier (`pointer-fine:hidden`) : sur un
  ordinateur, `capture` est ignoré et il doublerait la zone.
- Il ne prend qu'une photo par appui (sans `multiple`) : c'est ce que fait l'appareil photo.

## Notes d'implémentation

- **Reproduction** : `leases/__tests__/saisie-mobile.tck-913.test.tsx` et
  `media/__tests__/prendre-une-photo.tck-913.test.tsx` → 8 rouges sur 9 (le neuvième garde
  l'absence du bouton sans `camera`).
- **Ablation** : les six composants remis à `pre-dev`, clé gardée → les 8 mêmes rouges ; correctif
  rétabli → 9 verts, et 603 verts dans `media`, `leases`, `inventory`, `property-form`, `ui` et
  `forms`.
- **Piège** : le montant relu est groupé par une espace fine insécable en français ; le test la lit
  par `\s`.
