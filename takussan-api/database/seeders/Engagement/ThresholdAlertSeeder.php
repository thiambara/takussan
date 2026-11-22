<?php

namespace Database\Seeders\Engagement;

use App\Models\ThresholdAlert;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2381 — les alertes de seuil du tableau de bord (TCK-032), posées par l'agence quelques semaines
 * après son arrivée, comme `ThresholdAlertController::store` les écrit : mesure, opérateur, seuil,
 * gravité, et tous les destinataires de la mesure (`recipient_ids` vide). Une alerte désactivée montre
 * l'interrupteur. Rien n'est déclenché ici : `last_triggered_at` reste vide jusqu'à l'évaluation réelle.
 */
class ThresholdAlertSeeder extends Seeder
{
    /** @var list<array{metric: string, operator: string, threshold: float, severity: string, cooldown_hours: int, is_enabled: bool}> */
    private const REGLES = [
        ['metric' => 'unpaid_rate_percent', 'operator' => '>', 'threshold' => 15, 'severity' => 'warning', 'cooldown_hours' => 24, 'is_enabled' => true],
        ['metric' => 'overdue_count', 'operator' => '>=', 'threshold' => 5, 'severity' => 'critical', 'cooldown_hours' => 24, 'is_enabled' => true],
        ['metric' => 'occupancy_rate_percent', 'operator' => '<', 'threshold' => 80, 'severity' => 'info', 'cooldown_hours' => 168, 'is_enabled' => false],
    ];

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();

        foreach ($this->ctx->agencies as $agency) {
            if (ThresholdAlert::query()->where('agency_id', $agency->id)->exists()) {
                continue;
            }
            $posees = Timeline::randomDateBetween(
                CarbonImmutable::parse($agency->created_at)->addWeeks(3),
                $maintenant->subWeek(),
            );

            foreach (self::REGLES as $rang => $regle) {
                Timeline::aLaDate(Timeline::businessHour($posees)->addMinutes($rang * 3), fn () => ThresholdAlert::create($regle + [
                    'agency_id' => $agency->id,
                    'recipient_ids' => null,
                    'channel' => ThresholdAlert::CHANNEL_EMAIL,
                ]));
            }
        }
    }
}
