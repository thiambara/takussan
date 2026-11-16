<?php

namespace Database\Seeders\System;

use App\Services\Reporting\PlatformMetricsSnapshotter;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2381 — la série des métriques de la console plateforme (ADR-0057) : l'instantané que
 * `SnapshotPlatformMetricsJob` écrit chaque nuit à 00:30 pour la veille, rejoué à sa date par
 * `PlatformMetricsSnapshotter::snapshot()`.
 *
 * Comme `metrics:snapshot --date=` : les jours passés ne reçoivent que leurs FLUX (encaissé, frais,
 * cumul — datés par `paid_at`, donc rattrapables), la veille reçoit aussi les stocks, mesurés à
 * l'exécution. Un statut courant ne dit rien d'un jour passé : aucun stock n'est fabriqué après coup.
 *
 * EN DERNIER du bloc : les flux sont nets des remboursements, et tout seeder qui écrit un paiement
 * après lui rendrait faux un jour déjà instantané (l'invariant `metrique_du_jour_qui_ne_se_recalcule_pas`).
 */
class PlatformMetricsSeeder extends Seeder
{
    /** Jours de série : la tendance de la console en lit 30, la fenêtre glissante aussi. */
    public const JOURS = 90;

    public function __construct(private readonly PlatformMetricsSnapshotter $snapshotter) {}

    public function run(): void
    {
        $hier = CarbonImmutable::now()->startOfDay()->subDay();
        for ($i = self::JOURS - 1; $i >= 0; $i--) {
            $jour = $hier->subDays($i);
            Timeline::aLaDate($jour->addDay()->setTime(0, 30), fn () => $this->snapshotter->snapshot($jour, withStocks: $i === 0));
        }
    }
}
