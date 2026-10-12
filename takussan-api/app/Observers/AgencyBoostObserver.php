<?php

namespace App\Observers;

use App\Models\Agency;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostLifecycle;

/**
 * TCK-633 lot F (ADR-0061 §8) — suspendre ou désactiver un espace retire ses biens du public
 * (ADR-0048) : leurs boosts se mettent en pause ; le réactiver les reprend. Écriture de MASSE du
 * statut (`Agency::query()->update(...)`) : aucun événement, c'est `boosts:tick` qui rattrape.
 */
class AgencyBoostObserver
{
    public function updated(Agency $agency): void
    {
        if (! $agency->wasChanged('status')) {
            return;
        }
        $lifecycle = app(BoostLifecycle::class);

        Property::withTrashed()
            ->whereIn('id', PropertyBoost::query()
                ->where('agency_id', $agency->getKey())
                ->whereIn('status', array_map(fn (BoostStatus $s) => $s->value, BoostStatus::live()))
                ->select('property_id'))
            ->each(fn (Property $property) => $lifecycle->reconcile($property));
    }
}
