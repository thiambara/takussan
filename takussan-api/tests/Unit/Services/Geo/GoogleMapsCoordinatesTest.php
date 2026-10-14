<?php

namespace Tests\Unit\Services\Geo;

use App\Services\Geo\GoogleMapsCoordinates;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-633 (AC9) — la jumelle PHP de `coordonneesDepuisLienGoogle` (front) : même fixture, mêmes
 * réponses. Un format lu d'un seul côté ferait accepter au serveur ce que l'écran refuse.
 */
class GoogleMapsCoordinatesTest extends TestCase
{
    /** @return iterable<string, array{string, ?float, ?float}> */
    public static function liens(): iterable
    {
        $fixture = json_decode((string) file_get_contents(__DIR__.'/../../../fixtures/liens-google-maps.json'), true, flags: JSON_THROW_ON_ERROR);
        foreach ($fixture['liens'] as $lien) {
            yield $lien['cas'] => [$lien['url'], $lien['latitude'], $lien['longitude']];
        }
    }

    #[DataProvider('liens')]
    public function test_les_coordonnees_d_un_lien(string $url, ?float $latitude, ?float $longitude): void
    {
        $lu = GoogleMapsCoordinates::depuisUrl($url);

        if ($latitude === null) {
            $this->assertNull($lu);

            return;
        }
        $this->assertNotNull($lu);
        $this->assertEqualsWithDelta($latitude, $lu['latitude'], 1e-9);
        $this->assertEqualsWithDelta($longitude, $lu['longitude'], 1e-9);
    }
}
