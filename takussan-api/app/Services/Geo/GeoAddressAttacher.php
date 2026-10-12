<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;

/**
 * TCK-633 (ADR-0062 §3) — rattache au référentiel les adresses écrites AVANT lui : celles qui
 * nomment une ville connue, au Sénégal ou sans pays. L'écriture passe par `save()` : c'est le
 * crochet d'`Address` qui pose les noms officiels et retrouve le quartier — sans auteur connu, il
 * ne propose rien.
 */
final class GeoAddressAttacher
{
    public function __construct(private readonly GeoAddressCanonicalizer $canoniseur) {}

    /** @return list<int> les biens dont l'adresse a changé */
    public function rattacher(): array
    {
        $biens = [];

        Address::query()
            ->whereNull('geo_city_id')
            ->whereNotNull('city')
            ->where(fn ($q) => $q->whereNull('country')->orWhere('country', 'SN'))
            ->chunkById(200, function (Collection $adresses) use (&$biens) {
                foreach ($adresses as $adresse) {
                    $ville = $this->canoniseur->villeParNom($adresse->city, $adresse->region);
                    if ($ville === null) {
                        continue;
                    }
                    $adresse->geo_city_id = $ville->getKey();
                    $adresse->save();
                    if ($adresse->addressable_type === Property::class) {
                        $biens[] = (int) $adresse->addressable_id;
                    }
                }
            });

        return $biens;
    }
}
