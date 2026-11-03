---
id: TCK-1455
title: "Une absence d'agent finie en date seule vaut jusqu'à la fin du jour, comme une délégation"
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
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-163--bornes-de-fin-saisies-en-date-seule-et-rangées-dans-une-colonne-datetime"
tags: [back, equipe, absences, pistes]
---

## Objectif utilisateur

Un appelant qui déclare une absence jusqu'au 22 obtient une absence active tout le 22, et non
close à 00:00 au début de ce jour.

## Contexte

Réf : **P163.03** du fichier de pistes, `retenu · autonome` (A1 : la règle « date seule = fin du
jour, heure de Dakar » est écrite pour la même table par TCK-1320).

Mesuré avant correctif sur `58c404ecf` : temps figé au 2026-10-20 10:00 (Dakar),
`POST /api/agencies/{id}/absences` avec `ends_at = 2026-10-22` → 201, `ends_at` rangé à
`2026-10-22 00:00:00`. La règle de fin inclusive vivait dans `RoleDelegationService::finInclusive`
(privée) et, pour l'absence, dans l'écran seul (`${endsOn} 23:59:59`).

## Hypothèses (mode sans humain)

- Le helper est `App\Support\FinInclusive::de()`. La constante `END_DATE_TIMEZONE` de
  `RoleDelegationService`, sans autre lecteur, devient `FinInclusive::TIMEZONE`.
- L'écran garde son envoi `${endsOn} 23:59:59` : un instant explicite est rangé tel quel.

## Delta à produire

- [x] `App\Support\FinInclusive`, employé par `RoleDelegationService::create()` et
  `AgentAbsenceService::declare()`.
- [x] Test : `AgentAbsenceTest::test_une_fin_en_date_seule_vaut_jusqu_a_la_fin_du_jour_choisi`.

## Critères d'acceptation

- [x] AC1 — Une absence déclarée avec une date seule est encore active à midi le jour choisi.
- [x] AC2 — Un instant explicite est rangé sans changement ; la délégation garde sa fin inclusive
  (`RoleDelegationFinInclusiveTest` vert).

## Reste à faire

> le front envoie la date seule (`AgentAbsencesSection`), ce qui demande d'abord que `after:now` de `StoreAgentAbsenceRequest` juge la fin inclusive : une date seule du jour vaut minuit, déjà passé ; l'offre d'achat de P163.01 reste à son entrée

## Notes d'implémentation

- Ablation : `AgentAbsenceService.php` rendu à son état antérieur → 1 rouge (`00:00:00`) ; remis →
  10 verts.
