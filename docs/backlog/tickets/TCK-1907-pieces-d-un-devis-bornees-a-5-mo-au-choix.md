---
id: TCK-1907
title: "Les pièces d'un devis de plus de 5 Mo sont écartées au choix, nommées avec le plafond"
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
tags: [front, maintenance, i18n, pistes]
---

## Objectif utilisateur

Le prestataire qui joint à son devis une pièce trop lourde l'apprend au moment où il la choisit,
avec son nom et le plafond, au lieu d'un refus de tout le devis après la saisie des lignes.

## Contexte

Réf : **P195.07** du fichier de pistes, `validé (délégué)`. `SubmitQuoteRequest` refuse toute
pièce de plus de 5 Mo (`'attachments.*' => [..., 'max:5120']`) ; `QuoteSubmitForm.pickFiles` ne
jugeait que le type.

## Décision du porteur (déléguée)

> refuser avant l'envoi, dans `pickFiles`, toute pièce de plus de 5 Mo (PDF comme image), sans aucune réduction (TCK-542 : une pièce justificative part telle quelle), avec un message qui nomme les fichiers écartés et le plafond de 5 Mo, sur le modèle de `file_type_refused` et du refus de taille de `KycUploader` et `DocumentUploadDialog` ; clé neuve en `fr` et `en`, le `wo` portant le texte français ; test Vitest : une pièce de 6 Mo est écartée avec ce message et n'entre pas dans l'envoi, et la garde `reduire-photo.branchement` reste verte

## Hypothèses (mode sans humain)

- Le plafond est inclusif, comme `max:5120` de Laravel : une pièce de 5 Mo exactement passe.
- Une pièce trop lourde ne compte pas dans la borne des cinq pièces (elle n'est pas ajoutée).
- Texte : « Fichier trop lourd ({max} Mo au plus) : {files} » / « File too large ({max} MB max): {files} » ; le `wo` porte le français (wolof en pause).

## Delta à produire

- [x] `QuoteSubmitForm` : `MAX_ATTACHMENT_BYTES` (5 Mo), pièces au-delà écartées dans `pickFiles` et nommées par `file_too_large`.
- [x] Clé `maintenance.intervention.quote_form.file_too_large` en `fr`, `en` et `wo`.
- [x] Tests Vitest dans `QuoteSubmitForm.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Un PDF et une image de 6 Mo sont écartés, nommés avec « 5 Mo », et ne figurent pas parmi les pièces choisies ; une petite pièce choisie avec eux reste.
- [x] AC2 — La pièce écartée n'entre pas dans l'envoi : `mutateAsync` ne reçoit que la petite.
- [x] AC3 — Une pièce de 5 Mo exactement est gardée, sans alerte.
- [x] AC4 — `reduire-photo.branchement.test.ts` reste vert : le devis ne réduit rien.

## Hors périmètre

- Toute réduction des images d'un devis (TCK-542).

## Notes d'implémentation

- Ablation : filtre de taille retiré → AC1 et AC2 rouges (aucune alerte, la pièce de 6 Mo part) ; remis → vert.
- Le test d'envoi simule `DatePicker` par un champ simple (le calendrier ne se pilote pas dans jsdom), et remet `mutateAsync` à zéro avant chaque test : sans cela, il compte les appels d'un test précédent.
