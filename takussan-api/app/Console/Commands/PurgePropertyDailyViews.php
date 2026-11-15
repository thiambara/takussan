<?php

namespace App\Console\Commands;

use App\Models\PropertyDailyView;
use Illuminate\Console\Command;

/**
 * TCK-2905 (ADR-0117 § 3) — les vues quotidiennes d'un bien se gardent 400 jours (treize mois : un mois
 * se compare à celui de l'an passé). Idempotente : une suppression par date, par lots.
 */
class PurgePropertyDailyViews extends Command
{
    public const RETENTION_DAYS = 400;

    protected $signature = 'properties:purge-daily-views';

    protected $description = 'Supprime les vues quotidiennes des biens de plus de 400 jours (TCK-2905, ADR-0117)';

    public function handle(): int
    {
        $limite = now()->startOfDay()->subDays(self::RETENTION_DAYS)->toDateString();
        $purged = 0;

        do {
            $ids = PropertyDailyView::query()->where('day', '<', $limite)->orderBy('id')->limit(1000)->pluck('id');
            $purged += $ids->isEmpty() ? 0 : PropertyDailyView::query()->whereIn('id', $ids)->delete();
        } while ($ids->count() === 1000);

        $this->info("{$purged} jour(s) de vues supprimé(s).");

        return self::SUCCESS;
    }
}
