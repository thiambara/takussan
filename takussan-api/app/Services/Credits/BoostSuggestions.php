<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * TCK-2663 — les biens de l'espace qui mériteraient une mise en avant : publics (le prédicat même
 * que l'achat exige, `Property::public()`), sans demande de contact depuis 30 jours (tous canaux)
 * et sans boost en cours, du moins vu au plus vu (`views_count`, puis l'id).
 */
final class BoostSuggestions
{
    public const QUIET_DAYS = 30;

    /** @return array{items: Collection<int, Property>, total: int} */
    public function for(Agency $agency, int $limit): array
    {
        $query = $this->candidates($agency);
        $total = (clone $query)->count();

        $items = $query
            ->select('properties.*')
            ->selectSub(fn (QueryBuilder $q) => $q->from('property_contact_leads')
                ->whereColumn('property_contact_leads.property_id', 'properties.id')
                ->selectRaw('MAX(property_contact_leads.created_at)'), 'last_contact_at')
            ->withCasts(['last_contact_at' => 'datetime'])
            ->with(['media', 'address', 'agency'])
            ->orderBy('properties.views_count')
            ->orderBy('properties.id')
            ->limit($limit)
            ->get();

        return ['items' => $items, 'total' => $total];
    }

    /** @return Builder<Property> */
    private function candidates(Agency $agency): Builder
    {
        $since = now()->subDays(self::QUIET_DAYS);
        $live = array_map(static fn (BoostStatus $s): string => $s->value, BoostStatus::live());

        return Property::query()
            ->public()
            ->where('properties.agency_id', $agency->getKey())
            ->whereNotExists(fn (QueryBuilder $q) => $q->selectRaw('1')->from('property_contact_leads')
                ->whereColumn('property_contact_leads.property_id', 'properties.id')
                ->where('property_contact_leads.created_at', '>=', $since))
            ->whereNotExists(fn (QueryBuilder $q) => $q->selectRaw('1')->from('property_boosts')
                ->whereColumn('property_boosts.property_id', 'properties.id')
                ->whereIn('property_boosts.status', $live));
    }
}
