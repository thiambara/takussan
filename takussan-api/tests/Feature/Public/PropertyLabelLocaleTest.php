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

    /**
     * TCK-335 — sans en-tête, les libellés suivent la locale de l'APPLICATION.
     *
     * Ce chemin n'était couvert par aucun test, et il est piégeux à épingler : le `.env`
     * de cette machine porte `APP_LOCALE=en` quand `.env.example` — l'environnement de
     * test de la CI — porte `fr`. Une assertion écrite en dur sur « À louer » serait donc
     * verte d'un côté et rouge de l'autre. On épingle la PROPRIÉTÉ — « pas d'en-tête »
     * rend la même chose que « en-tête = locale de l'application », et autre chose que
     * n'importe quelle autre locale — sans jamais nommer laquelle des trois est configurée.
     *
     * (`config(['app.locale' => …])` ne survit pas à la requête dans ce harnais : la
     * configuration est rechargée. C'est mesuré, et c'est la raison de cette forme.)
     */
    public function test_sans_accept_language_les_libelles_suivent_la_locale_de_l_application(): void
    {
        $property = Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Apartment,
            'published_at' => now(),
        ]);

        $localeApplication = config('app.locale');
        $autreLocale = collect(['fr', 'en', 'wo'])->first(fn (string $l) => $l !== $localeApplication);

        $sansEnTete = $this->getJson('/api/public/properties/'.$property->slug);
        $avecLocaleApplication = $this->getJson(
            '/api/public/properties/'.$property->slug,
            ['Accept-Language' => $localeApplication],
        );
        $avecAutreLocale = $this->getJson(
            '/api/public/properties/'.$property->slug,
            ['Accept-Language' => $autreLocale],
        );

        $sansEnTete->assertOk();
        $this->assertNotNull($sansEnTete->json('data.contract_type_label'));
        $this->assertSame(
            $avecLocaleApplication->json('data.contract_type_label'),
            $sansEnTete->json('data.contract_type_label'),
            "sans en-tête, le libellé doit suivre app.locale ({$localeApplication})",
        );
        $this->assertNotSame(
            $avecAutreLocale->json('data.contract_type_label'),
            $sansEnTete->json('data.contract_type_label'),
            "le libellé sans en-tête ne doit pas coïncider avec la locale {$autreLocale}",
        );
    }
}
