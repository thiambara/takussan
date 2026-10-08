# ADR-0057 — Instantanés quotidiens des métriques plateforme

- **Statut** : Accepté
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
