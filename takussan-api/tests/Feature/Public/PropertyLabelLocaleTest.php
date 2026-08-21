<?php

namespace Tests\Feature\Public;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-335 — les libellés d'énumération suivent la locale négociée.
 *
 * `PropertyResource::translate()` figeait la locale à `'fr'` en troisième
 * argument de `Lang::get()`. `SetLocaleMiddleware` négociait donc correctement
 * `en` et `wo` — et la ressource l'ignorait : les trois locales rendaient
 * « À louer ». Les trois fichiers `lang/<locale>/properties.php` portent pourtant les
 * mêmes 35 clés, la traduction existait et n'était jamais atteinte.
 */
class PropertyLabelLocaleTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function localeProvider(): array
    {
        return [
            'fr' => ['fr', 'À louer', 'Appartement'],
            'en' => ['en', 'For Rent', 'Apartment'],
            'wo' => ['wo', 'Tëddé', 'Appart'],
        ];
    }

    #[DataProvider('localeProvider')]
    public function test_les_libelles_de_la_fiche_suivent_accept_language(
        string $locale,
        string $contratAttendu,
        string $typeAttendu,
    ): void {
        $property = Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Apartment,
            'published_at' => now(),
        ]);

        $response = $this->getJson(
            '/api/public/properties/'.$property->slug,
            ['Accept-Language' => $locale],
        );

        $response->assertOk();
        $this->assertSame($contratAttendu, $response->json('data.contract_type_label'));
        $this->assertSame($typeAttendu, $response->json('data.type_label'));
    }
}
