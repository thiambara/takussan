<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\Profiles\OwnerProfile;

/**
 * TCK-2915 — la règle de versement d'un bailleur dans une agence : le jour du mois où ses
 * reversements partent. Le jour de SON mandat (`owner_profiles.payout_day`, TCK-2909) d'abord, sinon
 * le jour de l'agence (réglage `agencies.settings.payout_day`), sinon aucun (`null`). Une seule
 * résolution : le relevé du bailleur et `GET /api/me/payout-methods` (`meta.payout_day`) la lisent.
 */
final class PayoutDay
{
    /** @return array{day: ?int, source: ?string} `source` : `mandate`, `agency` ou `null` */
    public static function of(int $landlordId, ?int $agencyId): array
    {
        if ($agencyId === null) {
            return ['day' => null, 'source' => null];
        }

        $mandate = OwnerProfile::query()
            ->where('user_id', $landlordId)
            ->where('agency_id', $agencyId)
            ->value('payout_day');
        if ($mandate !== null) {
            return ['day' => (int) $mandate, 'source' => 'mandate'];
        }

        $agency = Agency::query()->find($agencyId, ['id', 'settings']);
        $day = $agency?->setting('payout_day');

        return $day !== null ? ['day' => (int) $day, 'source' => 'agency'] : ['day' => null, 'source' => null];
    }
}
