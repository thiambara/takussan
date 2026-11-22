<?php

namespace App\Services\Maintenance;

use App\Models\Activity;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-2917 (ADR-0118 § 5) — « l'agence répond d'ordinaire dans l'heure » : la MÉDIANE, en minutes, du
 * délai entre le signalement (`created_at`) et la première prise en charge, sur les demandes des biens
 * de l'agence créées dans les {@see self::WINDOW_DAYS} derniers jours.
 *
 * « Prise en charge » : la première entrée `status.*` du journal ({@see MaintenanceJournal}, TCK-2786)
 * dont l'auteur est une personne AUTRE que le demandeur — l'agent qui crée et assigne sa propre demande
 * ne mesure pas une réponse. Une demande sans prise en charge ne compte pas. Sous
 * {@see self::MIN_SAMPLE} demandes mesurées, aucun chiffre (`null`) : une médiane sur trois cas ne dit
 * rien d'une agence. Mis en cache par agence ({@see self::TTL_SECONDS}).
 */
class AgencyResponseTime
{
    public const WINDOW_DAYS = 90;

    public const MIN_SAMPLE = 5;

    public const TTL_SECONDS = 3600;

    public function minutesFor(?int $agencyId): ?int
    {
        if ($agencyId === null) {
            return null;
        }

        // Une enveloppe, et non la valeur nue : `Cache::remember` relit un `null` comme une absence, et la
        // médiane d'une agence sous le seuil (le cas ordinaire) se recalculerait à chaque lecture.
        $cached = Cache::remember(self::cacheKey($agencyId), self::TTL_SECONDS, fn (): array => ['minutes' => $this->measure($agencyId)]);

        return is_array($cached) && is_int($cached['minutes'] ?? null) ? $cached['minutes'] : null;
    }

    public static function cacheKey(int $agencyId): string
    {
        return 'maintenance_response_minutes:'.$agencyId;
    }

    private function measure(int $agencyId): ?int
    {
        $firstHandling = Activity::query()
            ->selectRaw('min(activity_log.created_at)')
            ->where('activity_log.log_name', MaintenanceJournal::LOG)
            ->where('activity_log.subject_type', (new MaintenanceRequest)->getMorphClass())
            ->whereColumn('activity_log.subject_id', 'maintenance_requests.id')
            ->where('activity_log.event', 'like', MaintenanceJournal::STATUS_PREFIX.'%')
            ->where('activity_log.causer_type', (new User)->getMorphClass())
            ->whereNotNull('activity_log.causer_id')
            ->whereRaw('activity_log.causer_id is distinct from maintenance_requests.requester_id');

        $handled = MaintenanceRequest::query()
            ->select('maintenance_requests.created_at')
            ->selectSub($firstHandling, 'handled_at')
            ->whereIn('maintenance_requests.property_id', Property::withTrashed()->select('id')->where('agency_id', $agencyId))
            ->where('maintenance_requests.created_at', '>=', now()->subDays(self::WINDOW_DAYS));

        $row = MaintenanceRequest::query()->getQuery()->newQuery()
            ->fromSub($handled, 'mesures')
            ->whereNotNull('mesures.handled_at')
            ->selectRaw('count(*) as sample')
            ->selectRaw('percentile_cont(0.5) within group (order by extract(epoch from (mesures.handled_at - mesures.created_at)) / 60) as median')
            ->first();

        if ($row === null || (int) $row->sample < self::MIN_SAMPLE || $row->median === null) {
            return null;
        }

        return (int) round((float) $row->median);
    }
}
