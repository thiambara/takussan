<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * TCK-595 (ADR-0057) — l'instantané quotidien des métriques plateforme, écrit par
 * `SnapshotPlatformMetricsJob` (00:30, pour la veille) ou `metrics:snapshot --date=`.
 *
 * Une colonne de stock à `null` veut dire « non mesuré ce jour-là » (ligne rattrapée), jamais zéro :
 * la tendance de `GET /api/admin/system/metrics` n'en donne alors aucune clé.
 */
class PlatformMetricDaily extends Model
{
    protected $table = 'platform_metrics_daily';

    /** Les colonnes de stock : mesurées à l'exécution du jour, jamais rattrapées. */
    public const STOCK_COLUMNS = [
        'mrr_amount', 'mrr_trialing_amount', 'active_subscriptions',
        'agencies_total', 'agencies_active', 'agencies_verified', 'agencies_suspended',
        'users_total', 'users_active', 'properties_published', 'properties_pending_review',
        'leases_active',
    ];

    /** Les colonnes de flux : recalculables depuis `paid_at`. */
    public const FLOW_COLUMNS = ['gmv_amount', 'platform_fees_amount', 'collected_total_amount'];

    protected $fillable = [
        'date', ...self::FLOW_COLUMNS, ...self::STOCK_COLUMNS, 'stocks_captured_at',
    ];

    protected $casts = [
        'date' => 'date',
        'gmv_amount' => 'decimal:2',
        'platform_fees_amount' => 'decimal:2',
        'collected_total_amount' => 'decimal:2',
        'mrr_amount' => 'decimal:2',
        'mrr_trialing_amount' => 'decimal:2',
        'stocks_captured_at' => 'datetime',
    ];
}
