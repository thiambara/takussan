---
id: TCK-1500
title: "Les dates calendaires de deux réponses d'écriture sortent en `Y-m-d`, et la date de tri d'une échéance impayée est figée (P94.04)"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-94"
  adr:
    - "docs/adr/0018-format-des-dates-sur-le-fil.md"
tags: [api, dates, pistes]
---

## Objectif

Qu'une date calendaire (cast `date`) sorte en `Y-m-d` dans les réponses de
`POST /api/customers/{c}/primary-contact` et `PATCH /api/profiles/{p}/suspend`, comme ADR-0018
l'écrit, et que la date de tri d'une échéance impayée de `GET /api/payments/history` soit un choix
écrit et figé par un test.

## Contexte

Réf : **P94.04** du fichier de pistes (angle 94), `validé` le 2026-10-21 (validation en bloc ;
critère V7 accordé : le choix de la date de tri).

Les deux réponses d'écriture rendaient un modèle brut, dont les champs castés `date` sortaient en
`…T00:00:00.000000Z`. L'historique des paiements trie par une clé `date` qui vaut, pour une
échéance impayée, `period_start` mis à minuit UTC, sans que rien ne le dise ni ne le garde.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

### Choix de l'implémenteur

- Pour `PaymentController`, la `Piste` recommande de garder la date de début mise à minuit UTC et
  de le dire : c'est le comportement en vigueur, écrit en commentaire et figé par un test. La forme
  de la clé `date` reste celle des autres lignes (son contrat relève de P94.03).
- Pour les deux réponses d'écriture, la voie la plus étroite des deux proposées : `toDateString()`
  sur les seuls champs calendaires, le reste de la réponse inchangé (passer par une ressource
  relève de l'angle 61).

## Delta produit

- [x] `CustomerController::setPrimaryContact` : `started_at`, `ended_at` en `Y-m-d`.
- [x] `AgentProfileController::suspend` : `hire_date`, `active_until` en `Y-m-d`.
- [x] `PaymentController::leaseRow` : commentaire de la date de tri.
- [x] `tests/Feature/Http/CalendarDatesInWriteResponsesTest.php` (3 cas).

## Critères d'acceptation

- [x] AC1 — `primary-contact` : `data.started_at` = `2026-10-01`, `data.ended_at` = `2026-12-31`.
- [x] AC2 — `suspend` : `data.hire_date` = `2026-10-21`, `data.active_until` = `2027-01-31`.
- [x] AC3 — historique trié `-date` : payé le 1er octobre à 10 h, puis l'échéance impayée du
      1er octobre (`date` = `2026-10-01T00:00:00.000000Z`), puis payé le 30 septembre à 23 h.

## Notes d'implémentation

- **Ablation** : les deux contrôleurs d'écriture remis à `pre-dev` → 2 rouges (AC1, AC2) ; remis →
  3/3. AC3 est vert avant comme après : il fige le comportement choisi, il ne le corrige pas.
- **Conflit possible** : P61.04 (angle 61) prévoit une ressource par modèle rendu, `suspend`
  compris, et le retrait de `/profiles/{id}/suspend`.
