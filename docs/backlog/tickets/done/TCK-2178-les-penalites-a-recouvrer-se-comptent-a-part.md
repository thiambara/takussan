---
id: TCK-2178
title: "Les pénalités à recouvrer se comptent à part, sur l'accueil de l'agence, le relevé et l'accueil du locataire"
status: done
phase: P2
family: full
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  adr:
    - "docs/adr/0057-instantanes-quotidiens-des-metriques-plateforme.md#amendement-du-2026-10-24--la-pénalité-de-retard-réglée-est-encaissée-les-pénalités-à-recouvrer-se-comptent-à-part"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-206--pénalités-de-retard-réglées-face-aux-lecteurs-de-largent"
tags: [api, web, tableau-de-bord, releve, pistes]
---

## Objectif

Une pénalité appliquée et non réglée se voit : un total « pénalités à recouvrer », à part de
l'*Impayé*, sur l'accueil de l'agence, le relevé du bailleur et l'accueil du locataire.

## Contexte

Réf : **P206.03** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : un total à part « pénalités à recouvrer » (somme des pénalités dues non réglées) sur l'accueil de l'agence, le relevé du bailleur et l'accueil du locataire ; la définition de l'Impayé ne change pas

- Un loyer `paid` dont la pénalité reste due sortait de l'*Impayé*, et la pénalité n'était
  sommée nulle part. La règle est écrite à ADR-0057, amendement du 2026-10-24, point 3.

## Hypothèses (mode sans humain)

- Le total suit `LeasePayment::lateFeeOutstanding` : `late_fee_amount > 0`, `late_fee_paid_at`
  nul, ni échéance `cancelled` ni restitution de caution. Il se lit sur tout l'historique pour les
  deux accueils, et sur les échéances de la période (`due_date`) pour le relevé, comme son impayé.
- Libellés : « Pénalités à recouvrer » (indice de la tuile Impayés de l'agence, ligne du panneau du
  relevé), « Pénalités de retard à recouvrer » (carte du locataire, ligne du PDF). Ils ne
  s'affichent que pour un montant non nul. Le wolof porte le texte français (pause du wolof).
- L'accueil de l'agence est au plafond de son budget de requêtes (29) : le total se lit dans la
  requête de l'impayé (`UNION ALL`), qui garde ses deux clés.

## Delta à produire

- [x] `CollectedPayments::lateFeesOutstanding()` et `LATE_FEE_OUTSTANDING_SQL`.
- [x] `PortfolioMetrics::overdue` rend aussi `late_fees_count` et `late_fees_amount`, même requête.
- [x] `dashboard/agency` (`finance.late_fees_outstanding_*`), `dashboard/tenant`
  (`payments.late_fees_outstanding_*`), `owner-statements` (`late_fees_outstanding`) et son PDF.
- [x] Front : indice de la tuile Impayés (`AgencyKpis`), carte du locataire, ligne du relevé.

## Critères d'acceptation

- [x] AC1 — Jeu : loyer payé à 5 000 de pénalité due, pénalité réglée de 3 000, échéance annulée à
  pénalité, caution rendue à pénalité → total 1 / 5 000 sur les trois lecteurs ; l'impayé reste 0.
- [x] AC2 — Le relevé d'un mois sans échéance n'en compte aucune ; le PDF imprime la ligne.
- [x] AC3 — Front : rien sans pénalité due ; le montant sinon.

## Hors périmètre

- `platform_metrics_daily`, que la décision ne vise pas.
- Les pénalités à recouvrer de l'accueil du bailleur (`dashboard/owner`), non citées.

## Notes d'implémentation

- Tests : `takussan-api/tests/Feature/Dashboard/PenalitesARecouvrerTest.php` (3 cas),
  `AgencyKpis.test.tsx` et `OwnerStatementPanel.test.tsx` (un cas chacun). La carte du locataire
  (page serveur sans test) n'est couverte que par le test de l'API.
- Avant correctif : 3 rouges (clés absentes). Ablation : `lateFeesOutstanding()` vidé → 3 rouges ;
  indice et ligne du front retirés → 2 rouges. Remis → verts.
- Le PDF se rend sous la locale de l'application (`en` dans un test sans requête) : l'assertion lit
  le libellé anglais.
