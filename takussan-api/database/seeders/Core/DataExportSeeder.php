<?php

namespace Database\Seeders\Core;

use App\Jobs\Privacy\PurgeExpiredDataExports;
use App\Models\Customer;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\User;
use App\Services\Privacy\DataExportBuilder;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

/**
 * TCK-2381 — les exports de données personnelles (« Mes données », TCK-575) : demandés par le compte
 * comme le fait `Me\DataExportController::store` (journalisé), construits quelques minutes plus tard
 * par `DataExportBuilder` (l'archive est réelle), puis purgés par `PurgeExpiredDataExports` sept jours
 * après : la demande ancienne est `expired` et son archive effacée, la récente reste téléchargeable.
 *
 * L'avis « export prêt » n'est pas envoyé (aucun envoi sortant pendant le seed). La table n'a pas
 * d'agence : elle est de la plateforme, comme les annonces.
 */
class DataExportSeeder extends Seeder
{
    /** Il y a combien de jours chaque compte a demandé son export. */
    private const IL_Y_A = [75, 32, 2];

    public function __construct(private readonly DataExportBuilder $builder) {}

    public function run(): void
    {
        if (DataExport::query()->exists()) {
            return;
        }

        $comptes = User::query()
            ->whereIn('id', Customer::query()->whereNotNull('user_id')->select('user_id'))
            ->orderBy('id')
            ->get();
        if ($comptes->isEmpty()) {
            return;
        }

        $maintenant = CarbonImmutable::now();
        foreach (Tirage::plusieurs($comptes, min(count(self::IL_Y_A), $comptes->count()))->values() as $rang => $user) {
            $demande = Timeline::businessHour($maintenant->subDays(self::IL_Y_A[$rang] ?? 2));
            if ($demande->greaterThan($maintenant) || $demande->lessThan(CarbonImmutable::parse($user->created_at))) {
                continue;
            }

            $export = Timeline::aLaDate($demande, function () use ($user): DataExport {
                $export = DataExport::query()->create([
                    'user_id' => $user->id,
                    'requested_by' => $user->id,
                    'status' => DataExportStatus::Queued,
                    'requested_at' => now(),
                ]);
                activity('Privacy')
                    ->causedBy($user)
                    ->performedOn($export)
                    ->event('user_data_export_requested')
                    ->log('Export RGPD demandé');

                return $export;
            });

            Timeline::aLaDate($demande->addMinutes(Tirage::un([2, 4, 7])), fn () => $this->builder->build($export));
        }

        // La purge quotidienne, à l'heure : ce qui a dépassé ses sept jours expire et perd son archive.
        (new PurgeExpiredDataExports)->handle();
    }
}
