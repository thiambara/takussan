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
 *
 * TCK-787 (P17.03) — et celles déjà rattachées à leur ville dont le texte de quartier n'avait
 * aucun quartier au chargement précédent : une version du jeu qui l'ajoute les rattache. Le
 * crochet ne le fait pas seul, faute de champ modifié ; rien n'est proposé (aucun auteur).
 */
final class GeoAddressAttacher
{
    public function __construct(
        private readonly GeoAddressCanonicalizer $canoniseur,
        private readonly GeoNeighborhoodResolver $resolveur,
    ) {}

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

        Address::query()
            ->whereNotNull('geo_city_id')
            ->whereNull('geo_neighborhood_id')
            ->whereNotNull('neighborhood')
            ->where('neighborhood', '<>', '')
            ->with('geoCity')
            ->chunkById(200, function (Collection $adresses) use (&$biens) {
                foreach ($adresses as $adresse) {
                    $ville = $adresse->geoCity;
                    $quartier = $ville !== null
                        ? $this->resolveur->resoudreOuProposer($ville, (string) $adresse->neighborhood, null)
                        : null;
                    if ($quartier === null) {
                        continue;
                    }
                    $adresse->geo_neighborhood_id = $quartier->getKey();
                    $adresse->save();
                    if ($adresse->addressable_type === Property::class) {
                        $biens[] = (int) $adresse->addressable_id;
                    }
                }
            });

        return $biens;
    }
}
