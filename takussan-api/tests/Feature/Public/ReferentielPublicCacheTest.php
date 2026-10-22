<?php

namespace Tests\Feature\Public;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1207 (P103.03) — les listes du référentiel public sortent en cache public de cinq minutes,
 * avec un `ETag`, comme les énumérations (`routes/api/enums.php`). Avant : `no-cache, private`,
 * sans `ETag`, et le navigateur les retéléchargeait en entier à chaque chargement de page.
 */
class ReferentielPublicCacheTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function routes(): array
    {
        return [
            'villes' => ['/api/public/geo/cities'],
            'régions' => ['/api/public/geo/regions'],
            'équipements' => ['/api/public/amenities'],
            'types de bien' => ['/api/public/property-types'],
        ];
    }

    #[DataProvider('routes')]
    public function test_la_liste_sort_en_cache_public_avec_un_etag(string $url): void
    {
        $headers = $this->getJson($url)->assertOk()->headers;

        // Directive par directive : Symfony réordonne `Cache-Control` (cf. HomepageDiscoveryTest).
        $this->assertTrue($headers->hasCacheControlDirective('public'), $url);
        $this->assertSame('300', $headers->getCacheControlDirective('max-age'), $url);
        $this->assertFalse($headers->hasCacheControlDirective('private'), $url);
        $this->assertFalse($headers->hasCacheControlDirective('no-cache'), $url);
        $this->assertNotNull($headers->get('ETag'), $url);
    }
}
