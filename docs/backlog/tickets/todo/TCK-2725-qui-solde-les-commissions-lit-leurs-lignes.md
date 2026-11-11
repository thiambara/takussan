---
id: TCK-2725
title: "Qui solde les commissions de l'équipe en lit les lignes : le grand livre s'ouvre à « approuver les reversements »"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2665, TCK-2661]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#85-commissionentry-"
tags: [back, commissions, autorisation, equipe, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Le membre de l'équipe chargé de payer les commissions (il approuve les reversements sans lire les rapports de l'agence)
voit au grand livre les lignes qu'il solde, et pas seulement les siennes.

## Contexte

Suivi de TCK-2665. Trois règles se contredisent pour un rôle personnalisé qui tient `payouts.approve` **sans**
`reports.view_agency` :

- il **solde** les lignes d'un collègue (`CommissionEntryPolicy::settle` / `markPaid` / `cancel` : `payouts.approve`) ;
- il lit le **dû de chacun** dans l'équipe (`commissions_due_amount` de `include=team_summary`, ouvert à `payouts.approve`
  OU `reports.view_agency`, AC2 de TCK-2665) ;
- mais le **grand livre** ne lui montre que ses lignes : `CommissionEntry::scopeVisibleTo()` n'élargit qu'à
  `viewReports`. Ce même périmètre borne le relevé (`GET /api/commissions`), le point par bénéficiaire
  (`CommissionSummaryService`) et l'export des commissions (`ExportDataService::commissions`, capacité
  `reports.export`).

`CommissionEntryPolicy::view` (sans lecteur aujourd'hui, P217.05) dit la même chose que le périmètre et doit rester
alignée sur lui.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tes recommandations sur les dix points »).**

- **a) (recommandé)** `scopeVisibleTo` ouvre toutes les lignes de l'agence à `payouts.approve` OU `viewReports` :
  celui qui solde voit ce qu'il solde.
- b) fermer `commissions_due_amount` à `reports.view_agency` seul (il ne verrait plus le dû des autres, et solderait à
  l'aveugle).

## Contrat de données

- `CommissionEntry::scopeVisibleTo(User)` : personnel de l'agence active ; toutes les lignes de l'agence si
  `viewReports` sur l'agence **ou** `payouts.approve` dans l'agence ; sinon ses seules lignes (inchangé).
- `CommissionEntryPolicy::view` : même règle.
- Aucune route ni forme de réponse ne change ; seul le nombre de lignes rendues à ce rôle change.

## Contraintes strictes (métier)

- L'agent sans aucune des deux capacités continue de ne lire que ses lignes, partout (relevé, point, export).
- L'export reste gardé par sa capacité (`reports.export`, ou `own_lines_only` pour le bénéficiaire, TCK-2661) : ce ticket
  n'ouvre pas l'export à qui ne l'a pas.
- Le jugement des deux capacités se fait une fois par requête (pas par ligne).

## Delta à produire

- [ ] `CommissionEntry::scopeVisibleTo()` et `CommissionEntryPolicy::view()`.
- [ ] Tests : `CommissionLedgerVisibilityTest` — trois rôles × trois lectures.

## Critères d'acceptation

- [ ] AC1 — Rôle R = {`payouts.approve`} sans `reports.view_agency`, agence à deux bénéficiaires B1 et B2 : `GET
      /api/commissions` rend les lignes de B1 et de B2 ; le point par bénéficiaire rend B1 et B2 ; `settle` sur B1 reste
      200.
- [ ] AC2 — Rôle R qui tient aussi `reports.export` : l'export des commissions rend les lignes de B1 et B2.
- [ ] AC3 — Un agent sans `payouts.approve` ni `reports.view_agency` : relevé, point et export (bénéficiaire,
      `own_lines_only`) ne rendent que ses lignes (non-régression).
- [ ] AC4 — Un admin qui tient `reports.view_agency` : inchangé (toutes les lignes).

## Hors périmètre

- Le contenu de `commissions_due_amount` (inchangé).
- La règle du bénéficiaire qui ne solde pas ses propres lignes (inchangée).

## Notes d'implémentation

_(à remplir par implementing-specs)_
