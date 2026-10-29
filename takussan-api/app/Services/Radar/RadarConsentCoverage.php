<?php

namespace App\Services\Radar;

use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2388 (ADR-0077 §3) — LA définition d'une annonce couverte par un accord valide : un message qui la couvre
 * porte une réponse confirmée par un humain et non révoquée ({@see RadarConsent::scopeValid()}). Un accord
 * confirmé couvre toutes les annonces de son message. La fiche annonceur et la préparation d'un message la lisent
 * ici ; la publication (TCK-2389) la lira ici aussi, et nulle part ailleurs.
 *
 * Une jointure sur la table pivot, sans charger de relation : la préparation l'appelle SOUS verrou des annonces, et la
 * lecture ne verrouille rien.
 */
final class RadarConsentCoverage
{
    /**
     * @param  list<int>  $listingIds
     * @return list<int> ceux des identifiants donnés qu'un accord valide couvre, dans l'ordre croissant
     */
    public function coveredAmong(array $listingIds): array
    {
        if ($listingIds === []) {
            return [];
        }

        return $this->valid()
            ->whereIn('ol.radar_listing_id', $listingIds)
            ->distinct()
            ->orderBy('ol.radar_listing_id')
            ->pluck('ol.radar_listing_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** @return list<int> les annonces de cet annonceur qu'un accord valide couvre, dans l'ordre croissant */
    public function coveredListingIds(RadarAdvertiser $advertiser): array
    {
        return $this->valid()
            ->where('radar_consents.radar_advertiser_id', $advertiser->getKey())
            ->distinct()
            ->orderBy('ol.radar_listing_id')
            ->pluck('ol.radar_listing_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** La définition vit sur {@see RadarConsent::scopeValid()} : ici, seulement la jointure vers les annonces. */
    private function valid(): Builder
    {
        return RadarConsent::query()
            ->valid()
            ->join('radar_outreach_listing as ol', 'ol.radar_outreach_id', '=', 'radar_consents.radar_outreach_id');
    }
}
