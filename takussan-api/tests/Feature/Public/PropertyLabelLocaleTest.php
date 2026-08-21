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
     * TCK-335 — un `Accept-Language` que l'API ne sait pas servir retombe sur la locale
     * de l'APPLICATION, et n'invente pas une quatrième langue.
     *
     * ⚠️ **Ce test remplace un test « sans en-tête » qui ne pouvait pas exister** — il a
     * cassé la CI de la PR #209, et sa cause est une propriété du harnais que rien ne
     * documentait. Mesuré le 2026-08-21 :
     *
     *     Illuminate\Http\Request::create('/x')->header('Accept-Language')
     *     => "en-us,en;q=0.5"
     *
     * `Symfony\Component\HttpFoundation\Request::create()` — la fabrique qu'emploie
     * `$this->getJson()` — injecte cet en-tête dans ses valeurs de serveur par défaut.
     * **Aucun test HTTP de Laravel ne part donc sans `Accept-Language`**, et
     * `array_replace` ne permet pas de le retirer par un argument. Le test précédent
     * croyait mesurer la locale d'application ; il mesurait `en`, en toute circonstance.
     *
     * Il était vert en local (`.env` → `APP_LOCALE=en`, la valeur que le harnais injecte)
     * et rouge en CI (`.env.example` → `fr`) : `À louer` attendu, `For Rent` rendu. Le
     * commentaire qui l'accompagnait accusait `config(['app.locale' => …])` de ne pas
     * survivre à la requête — une déduction, et elle était fausse.
     *
     * L'absence RÉELLE de l'en-tête se teste un cran plus bas, sur le middleware, où la
     * requête peut être construite sans lui :
     * `Tests\Unit\Http\Middleware\SetLocaleMiddlewareTest`.
     *
     * On épingle ici la PROPRIÉTÉ — « en-tête non négociable ≡ en-tête portant
     * `app.locale`, et ≠ toute autre locale » — sans nommer laquelle des trois est
     * configurée, puisque les deux environnements n'en déclarent pas la même.
     */
    public function test_un_accept_language_non_supporte_retombe_sur_la_locale_de_l_application(): void
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

        // `de` n'est pas dans les locales supportées : la négociation ne rend rien, et le
        // middleware laisse la locale de l'application en place.
        $nonNegociable = $this->getJson(
            '/api/public/properties/'.$property->slug,
            ['Accept-Language' => 'de-DE,de;q=0.9'],
        );
        $avecLocaleApplication = $this->getJson(
            '/api/public/properties/'.$property->slug,
            ['Accept-Language' => $localeApplication],
        );
        $avecAutreLocale = $this->getJson(
            '/api/public/properties/'.$property->slug,
            ['Accept-Language' => $autreLocale],
        );

        $nonNegociable->assertOk();
        $this->assertNotNull($nonNegociable->json('data.contract_type_label'));
        $this->assertSame(
            $avecLocaleApplication->json('data.contract_type_label'),
            $nonNegociable->json('data.contract_type_label'),
            "un en-tête non supporté doit rendre app.locale ({$localeApplication})",
        );
        $this->assertNotSame(
            $avecAutreLocale->json('data.contract_type_label'),
            $nonNegociable->json('data.contract_type_label'),
            "le libellé ne doit pas coïncider avec la locale {$autreLocale}",
        );
    }
}
