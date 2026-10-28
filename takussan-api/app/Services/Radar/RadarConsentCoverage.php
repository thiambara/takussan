<?php

namespace App\Services\Radar;

use App\Models\RadarConsent;
use App\Models\RadarListing;

/**
 * TCK-2388 (ADR-0077 §3) — LA définition d'une annonce couverte par un accord valide : un message qui la couvre
 * porte une réponse confirmée par un humain et non révoquée ({@see RadarConsent::scopeValid()}). Un accord
 * confirmé couvre toutes les annonces de son message. La fiche annonceur la lit ici ; la publication (TCK-2389) la
 * lira ici aussi, et nulle part ailleurs.
 */
final class RadarConsentCoverage
{
    /**
     * @param  list<int>  $listingIds
     * @return list<int> ceux des identifiants donnés qu'un accord valide couvre
     */
    public function coveredAmong(array $listingIds): array
    {
        if ($listingIds === []) {
            return [];
        }

        return RadarListing::query()
            ->whereIn('radar_listings.id', $listingIds)
            ->whereHas('outreaches.consents', fn ($q) => $q->valid())
            ->pluck('radar_listings.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
