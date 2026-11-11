<?php

namespace App\Services\Dashboard;

use App\Console\Commands\CheckThresholdAlertsCommand;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

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
}
