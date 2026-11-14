---
id: TCK-2774
title: "`rent_month` du bailleur sert aussi les loyers du mois en retard et à venir"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2623]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#15-transactions--paiements"
  models: []
tags: [api, accueil, dashboard, bailleur, loyers]
---

## Objectif utilisateur

Le bailleur lit sur son accueil où en sont les loyers du mois : « Loyers de novembre : 8 reçus · 3 en
retard · 3 à venir ». Aujourd'hui l'accueil (TCK-2624, lot 2) ne peut écrire que « 8 reçus sur 14 » : les
deux autres segments n'ont pas de source, et l'écran n'en invente pas (décision 2 de TCK-2624, validée le
2026-11-13 avec ce suivi ; l'écart est écrit dans la fiche de fidélité de TCK-2624).

## Contrat de données

`GET /api/dashboard/me` → `metrics.rent_month` (repris par `OwnerMeMetrics` de
`DashboardOwnerService::summary`, `finance.rent_month`, TCK-2623). Aujourd'hui :
`{received_count, expected_count, received_amount}`, calculé par `DashboardOwnerService::loyersDuMois()`
sur les échéances `rent`, hors `cancelled`, dont `due_date` tombe dans le mois courant à l'heure de Dakar,
des baux du périmètre du bailleur.

Ajout, sur **le même ensemble d'échéances** (même mois, mêmes exclusions) :

- `overdue_count` / `overdue_amount` : non soldées (`status != paid`) et échues (`due_date` < aujourd'hui à
  Dakar) ; montant = reste dû (même définition que l'historique des paiements, `remaining_amount`) ;
- `upcoming_count` / `upcoming_amount` : non soldées et pas encore échues (`due_date` ≥ aujourd'hui à Dakar).

Invariant : `received_count + overdue_count + upcoming_count = expected_count`.

## Contraintes strictes (métier)

- Borné au mois : un loyer d'octobre encore impayé n'entre PAS dans `overdue_count` de novembre (ce compte
  n'est pas l'impayé du bailleur, que l'aging et `rent_late` servent déjà).
- « Aujourd'hui » se juge à l'heure de Dakar, comme le mois.
- Budget de requêtes : `DashboardQueryBudgetTest` plafonne `owner` à 27 ; les nouvelles valeurs se lisent
  par sous-requêtes scalaires dans la requête des baux existante (comme `rent_received_count`), plafond
  inchangé.
- Une échéance `failed` reste attendue (TCK-2623, point 4) : non soldée, elle est en retard ou à venir selon
  sa date.

## Delta à produire

- [ ] `loyersDuMois()` : quatre sous-requêtes de plus (`rent_overdue_count`, `rent_overdue_amount`,
  `rent_upcoming_count`, `rent_upcoming_amount`).
- [ ] `finance.rent_month` et `metrics.rent_month` portent les quatre clés ; le type front
  de `rent_month` (déclaré par le lot 2 de TCK-2624) étendu, chaque clé optionnelle tant que l'API ne la sert pas.
- [ ] `docs/features.md` § 25 : une ligne sur les trois segments.
- [ ] Tests dans `OwnerRentMonthTest`.

## Critères d'acceptation

- [ ] AC1 — Le 13 novembre, un bailleur a 14 loyers en novembre : 8 soldés, 3 échus le 5 non soldés (dont un
  `failed`), 3 dus le 20. `rent_month` rend `received_count = 8`, `overdue_count = 3`, `upcoming_count = 3`,
  `expected_count = 14`.
- [ ] AC2 — Un loyer d'octobre non soldé et une caution de novembre non soldée ne changent aucun des comptes.
- [ ] AC3 — Un loyer dû le 13 (aujourd'hui) est « à venir », pas « en retard » ; dû le 12, il est « en retard ».
  Le jour se juge par `CarbonImmutable::now('Africa/Dakar')`, comme le mois.
- [ ] AC4 — `overdue_amount` d'un loyer de 300 000 partiellement réglé de 100 000 vaut 200 000.
- [ ] AC5 — `DashboardQueryBudgetTest` reste vert au plafond 27.
- [ ] Ablation : juger le retard sans borne de mois fait rougir AC2 ; `<=` au lieu de `<` sur la date fait
  rougir AC3.

## Hors périmètre

- L'affichage (TCK-2624 lot 2 lit les nouvelles clés si elles existent, sans les inventer sinon).
- L'harmonisation de `failed` avec `PortfolioMetrics::unpaidRate` (TCK-2623, point 4).
