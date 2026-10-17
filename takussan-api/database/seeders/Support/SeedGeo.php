<?php

namespace Database\Seeders\Support;

use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Support\CaseInsensitive;
use Database\Seeders\YearOfActivitySeeder;
use Faker\Generator;

/**
 * TCK-789 (piste P17.04) — ce que le seed écrit dans une adresse, tiré du référentiel
 * géographique : les quartiers approuvés de la ville choisie, et des coordonnées autour du centre
 * de cette ville. Le référentiel est donc chargé AVANT les seeders qui écrivent des adresses
 * ({@see YearOfActivitySeeder::PIPELINE}).
 *
 * Sans référentiel (seeder joué seul), une ville inconnue n'a ni quartier ni centre : l'adresse
 * part sans quartier, placée dans le cadre de repli de l'appelant.
 */
final class SeedGeo
{
    /** Écart autour du centre de la ville, en degrés : environ 4 km. */
    private const ECART_DEGRES = 0.04;

    /** @var array<string, GeoCity|null> */
    private array $villes = [];

    /** @var array<int, list<string>> */
    private array $quartiers = [];

    public function ville(string $nom): ?GeoCity
    {
        $cle = CaseInsensitive::fold($nom);

        return $this->villes[$cle] ??= GeoCity::query()
            ->with('region')
            ->whereRaw(CaseInsensitive::sql('name').' = ?', [$cle])
            ->orderBy('id')
            ->first();
    }

    /** @return list<string> les noms des quartiers approuvés de la ville */
    public function quartiers(?GeoCity $ville): array
    {
        if ($ville === null) {
            return [];
        }

        return $this->quartiers[(int) $ville->getKey()] ??= GeoNeighborhood::query()
            ->where('geo_city_id', $ville->getKey())
            ->where('status', ReferentialStatus::Approved->value)
            ->whereNull('merged_into_id')
            ->orderBy('name')
            ->pluck('name')
            ->all();
    }

    /**
     * @param  array{0: float, 1: float, 2: float, 3: float}  $repli  [lat min, lat max, lng min, lng max]
     * @return array{latitude: float, longitude: float}
     */
    public function coordonnees(Generator $faker, ?GeoCity $ville, array $repli): array
    {
        if ($ville === null || $ville->latitude === null || $ville->longitude === null) {
            return [
                'latitude' => $faker->latitude($repli[0], $repli[1]),
                'longitude' => $faker->longitude($repli[2], $repli[3]),
            ];
        }

        $lat = (float) $ville->latitude;
        $lng = (float) $ville->longitude;

        return [
            'latitude' => $faker->randomFloat(7, $lat - self::ECART_DEGRES, $lat + self::ECART_DEGRES),
            'longitude' => $faker->randomFloat(7, $lng - self::ECART_DEGRES, $lng + self::ECART_DEGRES),
        ];
    }
}
