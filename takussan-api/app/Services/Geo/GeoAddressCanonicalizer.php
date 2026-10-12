<?php

namespace App\Services\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Support\CaseInsensitive;

/**
 * TCK-633 (ADR-0062 §4) — ce qu'une adresse devient avant d'être écrite, appelé par le crochet
 * `saving` d'`Address`. Cinq règles, dans cet ordre :
 *
 *   1. ville en TEXTE modifiée sans identifiant fourni → rapprochée par son nom (unique, ou
 *      départagée par la région) ; l'ancien quartier référencé tombe s'il n'est pas renvoyé ;
 *   2. quartier en TEXTE modifié sans identifiant fourni → l'ancien identifiant ne tient que si
 *      le nom concorde encore ;
 *   3. quartier référencé → sa forme canonique (fusion suivie), sa ville, son nom ; refusé, ou
 *      d'une autre ville que celle fournie → il tombe ;
 *   4. ville référencée, quartier en texte seul → replié sur l'existant, ou proposé au nom de
 *      l'utilisateur connecté (`GeoNeighborhoodResolver`) ;
 *   5. ville référencée → noms officiels de la ville et de la région, pays `SN`.
 *
 * Le texte reste la vérité affichée et indexée : la règle 5 l'ALIGNE, elle ne le remplace pas.
 * Une adresse hors référentiel (ville inconnue, étranger) traverse sans changement.
 */
final class GeoAddressCanonicalizer
{
    /** @var list<string> */
    private const CHAMPS = ['city', 'region', 'neighborhood', 'geo_city_id', 'geo_neighborhood_id'];

    public function __construct(private readonly GeoNeighborhoodResolver $resolveur) {}

    public function canoniser(Address $adresse): void
    {
        if (! $adresse->isDirty(self::CHAMPS)) {
            return;
        }

        // 1.
        if ($adresse->isDirty('city') && ($adresse->geo_city_id === null || ! $adresse->isDirty('geo_city_id'))) {
            $adresse->geo_city_id = $this->villeParNom($adresse->city, $adresse->region)?->getKey();
            if (! $adresse->isDirty('geo_neighborhood_id')) {
                $adresse->geo_neighborhood_id = null;
            }
        }

        // 2.
        if ($adresse->isDirty('neighborhood') && ! $adresse->isDirty('geo_neighborhood_id') && $adresse->geo_neighborhood_id !== null) {
            $actuel = GeoNeighborhood::query()->find($adresse->geo_neighborhood_id);
            if ($actuel === null || CaseInsensitive::fold($actuel->name) !== CaseInsensitive::fold((string) $adresse->neighborhood)) {
                $adresse->geo_neighborhood_id = null;
            }
        }

        // 3.
        if ($adresse->geo_neighborhood_id !== null) {
            $quartier = GeoNeighborhood::query()->find($adresse->geo_neighborhood_id)?->canonique();
            $villeFournie = $adresse->isDirty('geo_city_id') ? $adresse->geo_city_id : null;
            if ($quartier === null || ($villeFournie !== null && (int) $villeFournie !== (int) $quartier->geo_city_id)) {
                $adresse->geo_neighborhood_id = null;
            } else {
                $adresse->geo_neighborhood_id = $quartier->getKey();
                $adresse->geo_city_id = $quartier->geo_city_id;
                $adresse->neighborhood = $quartier->name;
            }
        }

        // 4.
        if ($adresse->geo_neighborhood_id === null
            && $adresse->geo_city_id !== null
            && filled($adresse->neighborhood)
            && $adresse->isDirty(['neighborhood', 'geo_city_id'])) {
            $ville = GeoCity::query()->find($adresse->geo_city_id);
            $quartier = $ville !== null
                ? $this->resolveur->resoudreOuProposer($ville, (string) $adresse->neighborhood, auth()->id())
                : null;
            if ($quartier !== null) {
                $adresse->geo_neighborhood_id = $quartier->getKey();
                $adresse->neighborhood = $quartier->name;
            }
        }

        // 5.
        if ($adresse->geo_city_id !== null) {
            $ville = GeoCity::query()->with('region')->find($adresse->geo_city_id);
            if ($ville !== null) {
                $adresse->city = $ville->name;
                $adresse->region = $ville->region->name;
                $adresse->country = 'SN';
            }
        }
    }

    /** La ville de ce nom : unique dans le pays, sinon départagée par la région ; `null` sinon. */
    public function villeParNom(?string $ville, ?string $region): ?GeoCity
    {
        $nom = trim((string) $ville);
        if ($nom === '') {
            return null;
        }

        $candidates = GeoCity::query()
            ->with('region')
            ->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])
            ->limit(10)
            ->get();

        if ($candidates->count() === 1) {
            return $candidates->first();
        }

        $nomRegion = trim((string) $region);
        if ($nomRegion === '') {
            return null;
        }

        $parRegion = $candidates->filter(
            fn (GeoCity $c) => CaseInsensitive::fold($c->region->name) === CaseInsensitive::fold($nomRegion)
        );

        return $parRegion->count() === 1 ? $parRegion->first() : null;
    }
}
