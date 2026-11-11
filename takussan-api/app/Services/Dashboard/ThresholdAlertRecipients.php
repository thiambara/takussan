<?php

namespace App\Services\Dashboard;

use App\Console\Commands\CheckThresholdAlertsCommand;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Dashboard\Adapters\AgencyMeMetrics;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-2627 — qui une alerte de seuil prévient : les admins ACTIFS de son agence. Une seule
 * définition, lue par le passage horaire ({@see CheckThresholdAlertsCommand})
 * qui les notifie, et par la lecture de l'alerte qui les nomme.
 */
final class ThresholdAlertRecipients
{
    /** @return Builder<User> */
    public static function query(int $agencyId): Builder
    {
        return User::query()
            ->whereHas('agencyAdminProfiles', fn (Builder $profile) => $profile->active()->where('agency_id', $agencyId));
    }

    /**
     * Contre-vérification de TCK-2627 — les destinataires d'une alerte sur `$metric` : pour un chiffre
     * CONSOLIDÉ ({@see AgencyMeMetrics::CONSOLIDATED_KEYS}), les seuls admins qui lisent les rapports
     * de l'agence (`reports.view_agency`) ; la cloche et le courriel portent la valeur, qu'un admin
     * dont le rôle retire la capacité ne lit pas sur `/dashboard/agency`.
     *
     * @param  Collection<int, User>|null  $admins  les admins actifs déjà lus ({@see self::query()})
     * @return Collection<int, User>
     */
    public static function forMetric(Agency $agency, string $metric, ?Collection $admins = null): Collection
    {
        $admins ??= self::query((int) $agency->id)->get();
        if (! in_array($metric, AgencyMeMetrics::CONSOLIDATED_KEYS, true)) {
            return $admins->values();
        }

        return $admins->filter(fn (User $user): bool => $user->canActAt(Capability::ReportsViewAgency, $agency))->values();
    }
}
