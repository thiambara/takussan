---
id: TCK-1889
title: "Au-delà de cinq photos de contestation ou pièces de devis, la sélection est refusée et dite"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [front, maintenance, uploads, pistes]
---

## Objectif utilisateur

Le demandeur qui conteste une intervention et le prestataire qui joint des pièces à un devis
apprennent qu'ils dépassent cinq fichiers, au lieu de voir la sixième pièce disparaître sans un mot.

## Contexte

Réf : **P195.02** du fichier de pistes, `validé (délégué)`.

La contestation coupait les photos à cinq à l'envoi (`photos.slice(0, PHOTOS_MAX)`), le devis
jetait la sixième pièce au choix (`.slice(0, MAX_ATTACHMENTS)`). L'API borne les deux à `max:5`
(`ContestMaintenanceResolutionRequest`, `SubmitQuoteRequest`).

## Décision du porteur (déléguée)

> refuser la sélection qui porterait le total au-delà de cinq, comme `MediaDropzone` (`MediaManager.tsx:549-551`) : rien n'est ajouté, et le message « Maximum {max} fichiers. » (texte de `max_files`, repris en clé du composant si l'espace de noms diffère, `wo` = texte français) s'affiche sous le champ, dans la contestation d'une intervention et dans le devis ; plus aucun `slice(0, 5)` silencieux ; test Vitest par composant : six fichiers choisis → message visible, et la mutation n'est jamais appelée avec cinq fichiers tronqués

## Hypothèses (mode sans humain)

- Contestation : le champ fichier remplace sa sélection à chaque choix (comportement natif). Une
  sélection de plus de cinq photos vide donc la sélection et le champ, puis affiche le message.
- Devis : les pièces s'ajoutent les unes aux autres. Une sélection dont les pièces acceptées
  porteraient le total au-delà de cinq est refusée entière, et celles déjà choisies restent. Les
  fichiers d'un type refusé ne comptent pas, puisqu'ils ne sont jamais ajoutés.
- Le message disparaît au choix suivant accepté, ou, dans le devis, au retrait d'une pièce.
- Clé `max_files` ajoutée sous `maintenance.intervention.resolution` et
  `maintenance.intervention.quote_form`, avec le texte de `media.max_files` en `fr` et en `en`, et
  le texte français en `wo`.

## Delta à produire

- [x] `MaintenanceResolutionResponse.tsx` : refus et message au choix ; plus de `slice` à l'envoi.
- [x] `QuoteSubmitForm.tsx` : refus et message au choix ; plus de `slice`.
- [x] Clés `max_files` dans `fr.json`, `en.json` et `wo.json`.
- [x] Tests Vitest : `MaintenanceResolutionResponse.borne-photos.test.tsx`, et deux cas ajoutés à
      `QuoteSubmitForm.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Contestation : six photos choisies → « Maximum 5 fichiers. » visible, et l'envoi part
      sans photo, jamais avec cinq photos tronquées.
- [x] AC2 — Contestation : cinq photos → aucun message, les cinq partent.
- [x] AC3 — Devis : six pièces choisies → message visible, aucune ajoutée.
- [x] AC4 — Devis : deux pièces après quatre → message, les quatre restent, la cinquième n'est pas
      ajoutée.

## Hors périmètre

- La taille et la réduction des pièces du devis (P195.07, renvoyée au porteur).

## Notes d'implémentation

- Ablation : les deux composants remis à leur version d'origine → 3 rouges (« Unable to find an
  accessible element with the role "alert" ») ; correctif remis → 7 verts dans les deux fichiers.
