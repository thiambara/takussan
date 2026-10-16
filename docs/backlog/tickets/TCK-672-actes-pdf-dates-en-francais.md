---
id: TCK-672
title: "Les actes PDF (bail, état des lieux, quittances, facture) se rendent en français, dates comprises"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo
tags: [back, pdf, i18n, pistes]
---

## Contexte

Réf : **P06.03** du fichier de pistes, `validé` par le porteur (critère accordé : V6).

Les cinq gabarits d'actes (`pdf.leases.contract`, `pdf.inventories.report`, `pdf.receipts.rent`,
`pdf.receipts.booking`, `pdf.invoices.default`) n'ont aucun texte traduit, mais leurs dates passent
par `translatedFormat()`, qui suit la locale de la requête : la quittance d'un lecteur anglophone
portait « Quittance de loyer … October 2026 », celle d'un lecteur wolof « Oktoobar 2026 ».

## Décision du porteur

les actes restent en français : dates et titres forcés en fr ; reste : les trois lignes d'ADR qui posent que les actes restent en français, par le porteur

## Reste à faire

les trois lignes d'ADR qui posent que les actes restent en français, par le porteur

## Objectif

Un acte PDF se rend sous la locale `fr` quelle que soit la langue du lecteur. Les gabarits
traduits gardent la langue du lecteur.

## Delta à produire

- [x] `DocumentPdfService::ACTES_EN_FRANCAIS` : la liste des cinq gabarits d'actes.
- [x] `DocumentPdfService::render()` rend ces gabarits (et leur pied « Document généré le … »)
      sous `withLocale('fr')`, puis rend la locale d'origine à la requête.
- [x] Tests : `tests/Feature/Services/ActesPdfEnFrancaisTest.php`, le pilote PDF remplacé par un
      pilote qui garde le HTML reçu.

## Critères d'acceptation

- [x] AC1 — `GET /api/leases/{id}/receipts/{payment}/pdf` avec `Accept-Language: en`, pour une
      échéance d'octobre 2026 : le HTML porte « Octobre 2026 » et jamais « October ».
- [x] AC2 — Rendu de `pdf.receipts.rent` sous la locale `wo` : « Octobre 2026 », jamais
      « Oktoobar » ; après le rendu, la locale est toujours `wo`.
- [x] AC3 — `pdf.statements.owner` rendu sous `en` porte « Management statement » et non
      « Relevé de gérance ».

## Hypothèses (mode sans humain)

- « titres forcés en fr » : les titres passés par les appelants (`'État des lieux #'`,
  `'Réservation #'`, `'Quittance de loyer'`, `'Contrat de bail …'`, `'Facture'`/`'Avoir'`) sont
  déjà des littéraux français ; la seule partie d'un titre qui changeait de langue était le mois
  de la quittance (`translatedFormat('F Y')`), désormais rendu sous `fr`. Aucun titre n'est donc
  réécrit.
- Le forçage est porté par le service, seul point de passage des cinq gabarits (contrôleurs,
  `LeaseSignatureService`, `PaymentReceiptPdf`, lien de paiement public), plutôt que gabarit par
  gabarit.
- Les montants ne changent pas : `@currency` formate selon la devise (`Currency::locale()`), pas
  selon la locale de la requête.

## Hors périmètre

- Les lignes d'ADR (reste du porteur, ci-dessus).
- `<html lang="fr">` en dur dans `pdf.layouts.base` reste faux pour les deux gabarits traduits
  (relevé de gérance, devis) rendus en `en` ou `wo` ; non traité.
- Les valeurs d'énumération brutes imprimées par les actes (`payment_method`, type et statut d'état
  des lieux, `general_condition`) restent des codes anglais (`move_in`, `draft`) ; non traité.

## Notes d'implémentation

- Rouge avant correctif : AC1 et AC2 (le HTML portait « October 2026 » et « Oktoobar 2026 ») ;
  AC3 vert d'emblée (il garde la borne du forçage).
- Ablation : locale forcée retirée → AC1 et AC2 rouges ; `fr` forcé sur tous les gabarits → AC3
  rouge. Remis → 3 verts.
- Carbon met la majuscule au mois sous `fr` dans `translatedFormat('F Y')` : « Octobre 2026 », et
  le wolof rend « Oktoobar » capitalisé, d'où des assertions négatives insensibles à la casse.
