---
id: TCK-1285
title: "Signalement public d'un avis : le motif est l'un des sept codes du front"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-145--champs-écartés-par-validated-reste-de-langle-114"
tags: [api, avis, moderation, validation, pistes]
---

## Contexte

Réf : **P145.02** du fichier de pistes, `retenu · autonome` (A1).

`POST /api/public/reviews/{review}/report` accepte comme motif toute chaîne de 500 caractères au
plus (`ReportPublicReviewRequest`), et `ReviewReportService` la range telle quelle dans
`metadata.reports`. L'unique appelant, `ReviewReportButton` (TCK-597), n'envoie que l'un de sept
codes ; le signalement d'une annonce passe, lui, par `Rule::in`.

Mesuré avant correctif (`pre-dev` a2398e474, test de garde ci-dessous) : `reason = "Texte libre"`
→ 200, l'avis compte un signalement.

## Objectif

Un motif hors des sept codes est refusé en 422, et rien n'est écrit.

## Delta à produire

- [x] `ReportPublicReviewRequest::REASONS` (les sept codes de `REVIEW_REPORT_REASONS`) et
      `Rule::in(self::REASONS)` sur `reason`.
- [x] Test : `PublicReportTest::test_a_reason_outside_the_list_is_refused` (texte libre → 422,
      aucun signalement ; chacun des sept codes → 200).
- [x] Les tests qui envoyaient un texte libre à la route publique (`PublicReportTest`,
      `ReviewAggregateTest`) envoient un code.

## Critères d'acceptation

- [x] AC1 — `reason = "Texte libre"` → 422 `reason`, `reported_count` inchangé, pas de
      `metadata.reports`.
- [x] AC2 — Les sept codes du front rendent 200.

## Hors périmètre

- La route authentifiée `POST /api/reviews/{review}/report` (`ReportReviewRequest`), qui accepte
  aussi un texte libre et dont les tests en envoient : la Piste ne vise que la route publique.
- Une garde qui comparerait la constante de l'API à `REVIEW_REPORT_REASONS` du front.

## Hypothèses

- Les signalements déjà rangés en texte libre restent tels quels (aucune réécriture de données).

## Notes d'implémentation

- Ablation : `rules()` remis à `string|max:500` → le test neuf rougit (200 au lieu de 422) ;
  remis → `PublicReportTest` 10/10, `ReviewAggregateTest` 1/1.
- Piège : sept signalements d'une même adresse butent sur le limiteur public (429) ; le test donne
  une adresse `X-Forwarded-For` par code, comme les autres tests de la classe.
