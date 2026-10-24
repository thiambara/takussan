# ADR-0057 — Instantanés quotidiens des métriques plateforme

- **Statut** : Accepté, **amendé le 2026-10-24** (cf. § *Amendement du 2026-10-24 — la pénalité de retard réglée est encaissée, les pénalités à recouvrer se comptent à part*)
- **Date** : 2026-10-08
- **Tickets** : [TCK-595](../backlog/tickets/TCK-595-tableaux-de-bord-justes-et-pilotage.md)
- **Remplace en partie** : la reconstruction du bloc `trend` de `GET /api/admin/system/metrics`
  (TCK-360), qui recalculait certaines valeurs à J-30 depuis `created_at`.

## Contexte

Relu sur `4da78b10` :

- **La tuile « Revenu plateforme » ne mesure pas un revenu.** `revenue.platform_total_paid` est la somme
  de tous les loyers payés depuis toujours. TCK-594 en a retiré les restitutions de caution, mais elle
  compte encore les dépôts de garantie et ignore les réservations.
- **Ni le GMV ni les frais plateforme ne sont rapportés**, alors que `platform_fee_pct_at_payment`
  existe sur les deux tables de paiement (migration `2026_05_07_000224`).
- **Le MRR compte les essais.** `PlatformReportingService::revenueSnapshotAt` somme les abonnements
  `trialing`, et juge chaque point passé sur le statut **courant**, alors que `trial_ends_at` dit quand
  l'essai a fini.
- **Huit des onze métriques n'ont pas de tendance**, faute d'historique (docblock de
  `SystemMetricsController`). Ce sont des stocks dérivés d'un statut courant : une agence suspendue
  hier compte aujourd'hui comme suspendue depuis toujours. Les trois qui en ont une la reconstruisent
  depuis `created_at` ou `paid_at`, sur les lignes **encore présentes**.

## Décision

**Une ligne par jour, `platform_metrics_daily`, écrite à 00:30 pour la veille. Elle porte les flux du jour
et les stocks mesurés à l'exécution. Une tendance n'est montrée que si l'instantané de J-30 la mesure.
Un rattrapage ne remplit que les flux, jamais les stocks.**

### 1. La table

`platform_metrics_daily`, unique `platform_metrics_daily_date_uq (date)`, modèle `PlatformMetricDaily`.

| Colonnes | Nature | Rattrapable |
|---|---|---|
| `gmv_amount`, `platform_fees_amount` | **flux du jour** (`paid_at` ce jour-là) | oui |
| `collected_total_amount` | cumul des flux jusqu'à la fin du jour | oui |
| `mrr_amount`, `mrr_trialing_amount`, `active_subscriptions` | stock (état des abonnements) | **non**, `null` |
| `agencies_total`, `agencies_active`, `agencies_verified`, `agencies_suspended`, `users_total`, `users_active`, `properties_published`, `properties_pending_review`, `leases_active` | stock | **non**, `null` |
| `stocks_captured_at` | instant de la mesure des stocks | `null` si rattrapé |

Les montants sont en `decimal(16,2)`, sans conversion ×100 (principe n° 3).

### 2. Les règles de calcul (les mêmes partout)

- **Encaissé** = `LeasePayment` payés de type `rent | charges | regularization | penalty` +
  `BookingPayment` `paid` (montant − `refund_amount`). Jamais `deposit` ni `deposit_refund`. C'est la
  règle des tableaux de bord de TCK-595, portée par une seule définition
  (`App\Services\Dashboard\CollectedPayments`).
- **GMV d'une fenêtre** = l'encaissé de la fenêtre, daté par `paid_at`.
- **Frais plateforme** = Σ montant encaissé × `platform_fee_pct_at_payment` / 100 (une ligne sans taux
  ne porte pas de frais).
- **Take rate** = frais ÷ GMV, sur 30 jours glissants, à 4 décimales. `null` sans GMV.
- **MRR** = Σ `plans.monthly_price_xof` des abonnements `active` ou `past_due` au point mesuré. Un
  abonnement **en essai au point mesuré** (`status = trialing`, ou `trial_ends_at` postérieur au point)
  en est exclu et compté à part (`mrr_trialing`). `past_due` reste dans le MRR jusqu'à la résiliation
  (option retenue par défaut). Le même calcul sert `GET /api/admin/reports/revenue`.

### 3. Le job et la commande

- `App\Jobs\Reporting\SnapshotPlatformMetricsJob`, planifié
  `Schedule::job(...)->dailyAt('00:30')->withoutOverlapping()` dans `routes/console.php`, écrit
  l'instantané de **la veille** : les flux de ce jour-là et les stocks mesurés à l'exécution, c'est-à-dire
  l'état à la fin de la veille, à trente minutes près.
- `metrics:snapshot {--date=}` rejoue un jour donné. Pour la veille, elle fait le même travail que le job.
  Pour un jour **antérieur**, elle n'écrit que les flux et laisse les stocks tels quels (`null` sur une
  ligne neuve). Une date d'aujourd'hui ou du futur est refusée.
- **Idempotence** : `upsert` sur `date`, qui ne met à jour que les colonnes que l'exécution mesure. Une
  seconde exécution réécrit la même ligne et ne crée jamais de doublon. Un rattrapage n'efface pas les
  stocks mesurés le jour même.

### 4. La tendance

`trend.previous` se lit dans l'instantané du jour `aujourd'hui − 30`. Chaque colonne **non nulle** y
donne sa clé (`agencies_total`, …, `revenue_collected_total`, `revenue_mrr`). Une colonne nulle, ou
l'absence de ligne, n'en donne aucune : le front ne montre pas de variation.

**La reconstruction de TCK-360 disparaît.** Elle calculait `agencies_total` et `users_total` depuis
`created_at`, sur les lignes encore présentes (les supprimées manquaient des deux côtés), et
`revenue_platform_total_paid` depuis `paid_at`. Ces deux reconstructions n'étaient fausses qu'à la marge,
mais elles relevaient d'une autre règle que les instantanés. Deux règles pour une même tuile se lisent
comme une seule.

*Écarté* : garder la reconstruction en repli quand l'instantané manque. La tendance changerait alors de
définition en silence, le jour où l'instantané apparaît.

## Conséquences

- **Pendant les 30 jours qui suivent le déploiement, aucune tuile n'a de tendance**, celles qui en
  avaient une comprises. Un rattrapage des flux (`metrics:snapshot --date=…`) rend la tendance du
  cumul encaissé dès qu'il est joué, mais aucun rattrapage ne rend celle des stocks.
- `revenue.platform_total_paid` change de valeur, puisqu'il suit la règle *Encaissé* : il gagne les
  réservations et perd les dépôts. Il est conservé une version sous ce nom, à côté de
  `revenue.collected_total`, puis retiré.
- Le MRR baisse du montant des essais. C'est la correction, pas une régression.
- Une ligne par jour, de quelques centaines d'octets, ne demande aucune purge.

## Application

- Migration `create_platform_metrics_daily_table`, modèle `App\Models\PlatformMetricDaily`.
- `App\Services\Reporting\PlatformMetricsSnapshotter` (calcul), `SnapshotPlatformMetricsJob`, la commande
  `metrics:snapshot`, et l'entrée planifiée annotée `TCK-595`.
- `SystemMetricsController` (nouvelles clés, `trend` lu dans l'instantané),
  `PlatformReportingService::revenueSnapshotAt` (essais exclus).
- Tests : `tests/Feature/Admin/PlatformMetricsSnapshotTest.php`,
  `tests/Feature/Admin/PlatformRevenueMrrTest.php`, et `SystemMetricsTrendTest` réécrit pour la règle
  de l'instantané.

## Amendement du 2026-10-24 — la pénalité de retard réglée est encaissée, les pénalités à recouvrer se comptent à part

Décisions du porteur du 2026-10-24, sur P206.02 (option a) et P206.03 (option b) du fichier de pistes
(`docs/plans/2026-10-15-pistes-d-amelioration.md`). Elles vont avec l'amendement du même jour
d'[ADR-0039](0039-les-sorties-d-argent.md), qui fait reverser la pénalité au bailleur (point 6) et
imputer un remboursement d'abord à elle (point 7). Le premier jet laissait ouverte la source des
frais sur la pénalité ; le porteur l'a tranchée le jour même (point 2). Relu sur 54f0f14b4.

L'*Impayé* n'est pas défini par le § 2. Mais `CollectedPayments` porte les deux définitions, sous la
référence de ce paragraphe (l. 11-25). Le total neuf de pénalités se range donc ici, à côté de
l'*Encaissé*.

### Constat

- **Le type `penalty` du § 2 n'est pas la pénalité de retard.** C'est l'indemnité de résiliation
  anticipée, son seul écrivain (`LeaseService.php:341`). La pénalité de retard vit sur la ligne du
  loyer : `late_fee_amount`, et `late_fee_paid_at` quand elle est réglée, par le checkout
  (`PaymentGatewayService.php:727-729`) ou chez l'agence (`LateFeeSettlement.php:53-56`).
- **L'*Encaissé* l'ignore.** `LEASE_NET_SQL` vaut `amount − refund_amount`
  (`CollectedPayments.php:53`). Ses lecteurs sont :
  - `revenue_month` et `cashflow_month` des accueils, par `PortfolioMetrics::leaseIncomeByMonth`
    (l. 247-260) ;
  - le GMV et les frais plateforme (`PlatformMetricsSnapshotter::flowsBetween`, l. 40-64) ;
  - la santé d'une agence à la console (`AgencyDetailController.php:79-83`).

  **Mesuré** (P206.02) : deux loyers, dont l'un réglé avec 7 500 de pénalité, donnent
  `leaseIncome()->sum(LEASE_NET_SQL)` = 250 000.
- **La clôture plateforme prélève sa commission sur cette pénalité.** Elle met au brut de l'agence
  la pénalité réglée par son checkout et la frappe de la commission
  (`PlatformPayoutService.php:345-355`). Elle fige deux sommes par clôture dans
  `platform_payouts.metadata` : `late_fees_gross` et `late_fees_fee` (l. 378-379). Les frais
  plateforme du tableau de bord ne la voient pas.
- **Une pénalité encore due n'est comptée nulle part.** L'*Impayé* est `pending | partially_paid |
  late`, au reste dû `amount − paid_amount` (`CollectedPayments.php:44-50`). Un loyer `paid` dont la
  pénalité reste due en sort. **Mesuré** (P206.03) : un loyer de 100 000 `paid`, avec 5 000 de
  pénalité non réglée, donne `leaseOwed()->count()` = 0, et le relevé du mois `unpaid {"count":0,"amount":0}`.

### Décision

**L'*Encaissé* compte la pénalité de retard réglée, datée par `late_fee_paid_at`. Les frais
plateforme ne portent que sur la pénalité réglée par le checkout de la plateforme. Les pénalités dues
et non réglées forment un total à part, « pénalités à recouvrer ». L'*Impayé* ne change pas.**

#### 1. L'*Encaissé* (P206.02)

La première règle du § 2 devient :

> **Encaissé** = `LeasePayment` `paid` de type `rent | charges | regularization | penalty` +
> `BookingPayment` `paid`, chacun pour `montant − refund_amount` (TCK-1214) + **les pénalités de
> retard réglées**, chacune pour `late_fee_amount − late_fee_refund_amount`. Jamais `deposit` ni
> `deposit_refund`.

- **Le reste de P76.02 se ferme du même coup.** `montant − refund_amount` vaut désormais pour les
  deux côtés. Le texte d'origine ne le disait que des réservations, alors que le code l'applique aux
  loyers depuis TCK-1214.
- **La pénalité est un second agrégat**, dans `CollectedPayments` : une expression
  (`LATE_FEE_NET_SQL`) et un constructeur de requête. Un seul agrégat ne suffit pas, parce que la
  pénalité se date par `late_fee_paid_at` et non par `paid_at`. Réglée un autre jour que son loyer,
  elle compte au jour de son règlement.
- **Ce qu'elle compte.** Une ligne d'un type de revenu (`LEASE_INCOME_TYPES`), dont
  `late_fee_paid_at` est posé, quel que soit le statut du loyer (une pénalité se règle sur un loyer
  encore `late`), sauf `cancelled`.
- **La part rendue.** `late_fee_refund_amount` est la part de pénalité rendue par un remboursement
  (ADR-0039, amendement du 2026-10-24, point 7).
- **Le GMV d'une fenêtre** additionne les deux agrégats, chacun daté par sa colonne. Au § 1, « flux
  du jour » se lit désormais : `paid_at` ce jour-là, ou `late_fee_paid_at` pour la pénalité.

#### 2. Les frais plateforme sur la pénalité (P206.02)

- **Seule la pénalité réglée par le checkout de la plateforme porte des frais**, au taux de sa ligne
  (`platform_fee_pct_at_payment`).
- **La règle** est celle de la clôture : `PlatformPayoutService::lateFeeSettledWith`, la pénalité
  figée à l'initiation du checkout qui a soldé le loyer. Une pénalité réglée chez l'agence ne porte
  aucun frais.
- **Lue par ligne, par la méthode de la clôture** (décision du porteur du 2026-10-24).
  `lateFeeSettledWith` devient partagée entre la clôture et les métriques, au lieu d'être privée à
  `PlatformPayoutService` (l. 499-508). `flowsBetween` relit en PHP chaque ligne dont
  `late_fee_paid_at` tombe dans la fenêtre. Ses frais valent `arrondi((pénalité réglée par la
  plateforme − late_fee_refund_amount) × platform_fee_pct_at_payment / 100)`.
  - Ils se datent par `late_fee_paid_at`, comme le GMV qu'ils divisent, et restent rattrapables
    (§ 1).
  - Le coût est borné : une fenêtre ne relit que les pénalités réglées dans la fenêtre.
  - Sur un même jeu, les frais des métriques et ceux de la clôture tombent égaux.
- **Écarté : lire `late_fees_fee`**, la somme que la clôture fige dans `platform_payouts.metadata`
  (l. 378-379). C'est **une somme par clôture**, une agence pour une fin de période, qui n'existe
  qu'**après** la clôture. Elle daterait les frais par la clôture, quand le GMV se date par
  `late_fee_paid_at` : le take rate sur 30 jours rapporterait deux calendriers, et un jour non clos
  n'aurait aucun frais de pénalité.
- **Écarté : une colonne de frais figée au règlement.** Elle serait un schéma de plus pour une
  valeur que la méthode partagée calcule déjà.

#### 3. Les pénalités à recouvrer (P206.03)

- **La définition.** Un total à part, à côté de l'*Impayé* : Σ des pénalités appliquées et non
  réglées.
  - En ligne, c'est `LeasePayment::lateFeeOutstanding` (l. 75-86) : `late_fee_amount > 0`,
    `late_fee_paid_at` nul, et jamais une échéance `cancelled` ni une restitution de caution.
  - Une pénalité rendue en entier est **remise** (ADR-0039, amendement du 2026-10-24, point 7) :
    `late_fee_paid_at` garde sa valeur, elle n'est donc pas à recouvrer.
  - En SQL, il vit dans `CollectedPayments`, pour que tous les lecteurs le comptent de la même façon.
- **L'*Impayé* ne change pas** : mêmes statuts, même reste dû, même lecture par ses six lecteurs
  (`PortfolioMetrics::overdue` et `unpaidRate`, `AgingBalanceService`, `OwnerStatementService::unpaid`,
  `ExportDataService::aging`, `DashboardTenantService`).
- **Rien n'est compté deux fois.** L'*Impayé* compte `amount − paid_amount`, sans la pénalité. Une
  ligne `late` peut ainsi figurer aux deux totaux, chacun pour sa part.
- **Où le total se montre** (l'option b de P206.03) :
  - l'accueil de l'agence ;
  - le relevé du bailleur, qui reçoit la pénalité depuis l'amendement d'ADR-0039 ;
  - l'accueil du locataire.

  Il n'entre pas dans `platform_metrics_daily` : la décision ne le demande pas.

### Lecteurs qui changent

| Fichier — lecture | Changement |
|---|---|
| `Services/Dashboard/CollectedPayments.php` | le second agrégat de l'*Encaissé* et le total des pénalités à recouvrer, à côté des définitions existantes |
| `Services/Dashboard/PortfolioMetrics.php` — `leaseIncomeByMonth` (l. 247-260) | ajoute la pénalité réglée, par mois de `late_fee_paid_at` |
| `Services/Reporting/PlatformMetricsSnapshotter.php` — `flowsBetween` (l. 40-64), `collectedTotal` | GMV avec la pénalité ; frais sur la seule pénalité réglée par la plateforme, lue par ligne |
| `Services/Billing/PlatformPayoutService.php` — `lateFeeSettledWith` (l. 499-508) | partagée avec les métriques ; elle retranche la part rendue (ADR-0039, point 7) |
| `Http/Controllers/Api/Admin/AgencyDetailController.php` — `health` (l. 79-83) | l'encaissé sur 30 jours avec la pénalité |
| `Services/Dashboard/DashboardAgencyService.php`, `Services/Payout/OwnerStatementService.php`, `Services/Dashboard/DashboardTenantService.php` | rendent les pénalités à recouvrer |

- **La série change.** `gmv_amount`, `platform_fees_amount` et `collected_total_amount` changent à
  compter du déploiement. Un rattrapage des flux (`metrics:snapshot --date=…`, § 3) réécrit les jours
  qu'il rejoue.
- **La tendance glisse.** Une tendance lue avant la réécriture de J-30 compare deux règles. C'est la
  limite déjà assumée au § 4 pour toute colonne neuve.

*Hors de cet amendement* : les frais des **loyers** au § 2 portent sur toute ligne qui a un taux. Or
`PaymentPlatformFeeObserver` fige ce taux au passage à `paid`, quel que soit l'encaisseur. La
clôture, elle, ne frappe que les lignes encaissées par la plateforme. L'écart est relevé ici, mais il
n'est pas tranché.
