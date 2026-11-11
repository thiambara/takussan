---
id: TCK-2657
title: "Argent, côté API : encaissements nommés, filtres métier et point du mois"
status: todo
phase: P1
family: back
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2658, TCK-2659, TCK-2660, TCK-2629]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#28-payout-"
tags: [back, finances, payments, audit-ux, app]
---

## Objectif utilisateur

L'admin d'agence sait qui a payé quoi, pour quel bien et quelle période, et voit le point de l'argent d'un mois donné sans ouvrir les baux un par un.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- `GET /api/payments/history` (`PaymentController::history`, lignes construites à la main par `bookingRow` / `leaseRow`) ne rend que `customer_id` et `property_id` : **ni nom du payeur, ni titre du bien, ni bailleur**. La période (`period_start`, `period_end`, `due_date`) n'existe que sur les lignes de bail. Filtres : `status` (liste), `entity_type` + `entity_id`, `date_from` / `date_to`. **Ni payeur, ni bailleur, ni moyen, ni recherche libre**, et aucun `include=`.
- Les tuiles de `/app/agency/finances` lisent `GET /api/dashboard/agency` : `finance.revenue_month` est le **mois civil** (`startOfMonth`), alors que le libellé dit « Encaissements (30 j) ». Aucun paramètre de période, aucune comparaison au mois précédent. Les tuiles 3 et 4 ne sont que des **comptes** (`meta.total` de `/api/payouts?filter[status]=pending` et `/api/invoices?filter[status]=draft`), pas des montants.
- Les impayés vivent dans `GET /api/agencies/{agency}/finance/aging` (groupes par locataire ou bailleur, tranches 1-30 / 31-60 / 61-90 / 90+), sans ligne par échéance ni jours de retard.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).
- Rien ne change pour les appelants existants : `entity_type` / `entity_id`, les tris, le plafond de 5 000 lignes (`meta.truncated`) et `meta.totals` restent identiques quand aucun nouveau paramètre n'est passé.
- Les relations sont **à la demande** (`include=`), jamais émises par défaut : règle des sparse fieldsets du dépôt.
- Le cloisonnement des bailleurs et de l'agence est celui de la route d'aujourd'hui (principe 2) : un nom de payeur ou de bailleur ne sort jamais pour un paiement hors du périmètre de l'appelant.
- La recherche libre passe par `App\Support\CaseInsensitive` (le `lower()` de PostgreSQL ne replie que l'ASCII sous `--locale=C`).
- Le mois se lit à l'heure de Dakar (`Africa/Dakar`).
- Le point du mois a la même autorisation que `GET /api/agencies/{agency}/finance/aging` (même Policy) : un agent sans `reports.view_agency` reçoit 403.
- Montants en décimal, devise de l'agence (principe 3) ; aucun libellé n'est émis, seulement des codes et des nombres (principe 5).

## Delta à produire

- [ ] `PaymentController::history` accepte `include=payer,property,landlord` : `payer {id, name, phone}` (le client payeur), `property {id, title, reference_number}`, `landlord {id, name}` (bailleur du bien) ; sur une ligne de bail, `days_late` (entier, jours depuis `due_date` tant que l'échéance n'est pas soldée, `null` sinon).
- [ ] Filtres neufs : `filter[payer_id]`, `filter[landlord_id]`, `filter[payment_method]` (liste), `filter[search]` (nom du payeur, titre ou référence du bien, référence du paiement), `filter[days_late_min]`, `filter[days_late_max]` ; tri `days_late`.
- [ ] Route `GET /api/agencies/{agency}/finance/summary?period=YYYY-MM` (défaut : mois courant) → `FinanceSummaryController` + `App\Services\Reporting\FinanceSummaryService` : `collected {amount, count, previous_amount}`, `overdue {amount, count, leases_count, by_age {under_8, from_8_to_30, over_30}}`, `deposits_held`, `payouts_awaiting_approval {count, amount, landlords_count}`, `payouts_pending {count, amount}`, `invoices_draft {count, amount}`.
- [ ] `docs/spatie-query-builder.md` : les nouveaux filtres et `include` de l'historique.
- [ ] Tests : `PaymentHistoryNamedRowsTest`, `PaymentHistoryBusinessFiltersTest`, `AgencyFinanceSummaryTest`.

## Critères d'acceptation

- [ ] AC1 — Sur une agence de test à deux bailleurs, `include=payer,property,landlord` rend pour une ligne de bail le nom du locataire, le titre du bien et le nom du bailleur ; sans `include`, la ligne est identique octet pour octet à celle d'avant (test de non-régression sur la forme).
- [ ] AC2 — `filter[landlord_id]=A` rend exactement les paiements des biens du bailleur A (compte attendu de la fixture, et zéro paiement du bailleur B).
- [ ] AC3 — `filter[search]=DIÖP` trouve le payeur « Diöp », « DIÖP » ou « diöp » (repli de casse non ASCII, `CaseInsensitive`), et rien d'une autre agence. Le repli des accents (« DIÖP » trouve « Diop ») attend un ADR qui revienne sur [ADR-0020 § 2](../../../adr/0020-postgresql-sur-tous-les-environnements.md) (réécrit le 2026-11-11, décision de la session).
- [ ] AC4 — `period=2026-10` rend dans `collected.amount` la somme des paiements payés du 1er au 31 octobre (heure de Dakar), et dans `previous_amount` celle de septembre ; un paiement payé le 1er novembre à 00:30 heure de Dakar n'y entre pas.
- [ ] AC5 — `overdue.by_age` répartit trois échéances en retard de 5, 20 et 40 jours dans les trois tranches attendues, et `filter[days_late_min]=31` de l'historique rend la seule échéance à 40 jours.
- [ ] AC6 — Un agent de l'agence reçoit 403 sur le point du mois ; l'admin d'une autre agence reçoit 403 (ou 404 selon la Policy existante, la même que `finance/aging`).

## Hors périmètre

- Les relances (TCK-2658) et le nombre d'impayés jamais relancés.
- Les écrans (TCK-2659, TCK-2660).
- L'export : `GET /api/export/payments` ne couvre que les paiements de bail ; l'étendre aux réservations est un autre ticket.
- La « file des reversements à préparer ce mois par bailleur » (ambition de l'audit) : `GET /api/payouts/preparation` reste par bailleur.

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-agence), mesuré sur l'arbre courant (`feat/audit-ux-app-lot-1`).

**Prémisse re-mesurée** : le contrôleur est `app/Http/Controllers/Api/PaymentController.php` (namespace `Api`), la route vit dans `routes/api/payments.php`, la balance âgée dans `routes/api/agencies.php`. Le reste du « Contrat de données » est exact (`bookingRow`/`leaseRow` sans nom, filtres d'avant, `revenue_month` au mois civil, `AgencyPolicy::viewReports`).

**Ce qui diffère du ticket :**

- **AC3 se contredit avec sa contrainte.** `App\Support\CaseInsensitive` replie la casse, y compris hors ASCII, mais **pas les accents** (docblock de la classe, ADR-0020 § 2, ADR-0025 ; `ConversationContextController` : « amitie » ne trouve pas « Amitié »). Mesuré : `DIÖP` trouve « Diöp », « DIÖP », « diöp », pas « Diop ». C'est ce que la recherche fait et ce que le test épingle ; trouver « Diop » demanderait un repli d'accents, donc un ADR qui revienne sur ADR-0020 § 2. Question posée à la session le 2026-11-11 ; Tranché le 2026-11-11 par la session, option (a) : AC3 réécrit (la casse seule), vert sur le test qui l'épingle.
- **`days_late` et la forme d'avant (AC1).** AC1 exige une ligne identique octet pour octet sans `include` ; `days_late` n'est donc émis que si la requête porte un paramètre neuf (un `include`, un filtre neuf ou `sort=days_late`). Sa règle est celle de l'*Impayé* (`CollectedPayments::leaseOwed()`, échue avant aujourd'hui) : un entier ≥ 1, `null` sinon et sur une réservation. Les bornes `days_late_min/max` sont posées en SQL avant le comptage et le plafond de 5 000 lignes, et excluent les réservations.
- **Le bailleur** se lit à `leases.landlord_id` sur une échéance (la colonne de la balance âgée) et à `properties.user_id` sur une réservation, pour le filtre comme pour l'`include` (test : chaque ligne se retrouve par le bailleur qu'elle affiche).
- **Le point du mois** rend aussi `period`, `as_of` et `currency`. `overdue` est un état **à date** (`as_of`), quel que soit le mois demandé : le statut d'une échéance est celui d'aujourd'hui, l'impayé d'un mois passé ne se reconstitue pas. `by_age` rend `{count, amount}` par tranche (1-7, 8-30, 31+ jours). `payouts_pending` est le statut `pending` seul (la tuile d'aujourd'hui) ; `invoices_draft.amount` est la somme de `total_amount`.
- **L'heure de Dakar est UTC+0, sans heure d'été** : le fuseau de l'application (UTC) rend les mêmes bornes. Le test AC4 garde donc la borne exclusive du mois (le paiement du 1er novembre à 00:30) ; l'ablation du fuseau n'est rouge qu'en le remplaçant par un fuseau décalé (`Africa/Lagos`), pas par UTC.
- Codes d'erreur neufs (fr/en ; `wo` = le français, wolof en pause) : `payment.filter_id_invalid`, `payment.filter_payment_method_invalid`, `payment.filter_days_late_invalid`, `reporting.invalid_period`.

**Parités tenues par test** : `collected.amount` du mois courant = `finance.revenue_month` de l'accueil ; `overdue` = `overdue_count`/`overdue_amount` de l'accueil ; `filter[days_late_min]=1` de l'historique rend autant de lignes qu'`overdue.count` ; `deposits_held` = `deposits_held.total` de la balance âgée.

**Ablations** (retrait, rouge, restauration par `cp` vérifiée par `md5`) : noms de l'`include`, forme d'avant, chargement anticipé (nombre de requêtes), filtres bailleur, payeur, moyen, borne « dû » du retard, échappement des jokers, repli SQL et repli PHP, tri des `null`, borne exclusive du mois, fuseau, tranches, `COUNT(DISTINCT landlord_id)`, statut brouillon, autorisation, validation de la période — toutes rouges.
