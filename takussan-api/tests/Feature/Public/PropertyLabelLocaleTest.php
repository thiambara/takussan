<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyCondition;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-351 (option a du porteur, 2026-11-16) — la fiche d'un bien émet des CODES, jamais leur libellé.
 *
 * Ce fichier gardait jusqu'ici l'inverse : TCK-335 avait fait suivre à `type_label` et
 * `contract_type_label` la locale négociée. Mais deux tables de libellés s'affichaient alors dans le
 * même parcours — `lang/<locale>/properties.php` par l'API, `property.*` de next-intl par le front —
 * et divergeaient sur 44 valeurs (`pending` : « Réservé » sur la fiche, « En attente » sur la carte).
 * Le porteur a tranché pour le principe n° 5 : le front possède le texte affiché. `PropertyResource`
 * n'émet donc plus les six `*_label`, et le front rend chaque code par son dictionnaire.
 *
 * Le test rougit si l'un des six revient, dans n'importe quelle locale : un libellé réémis serait lu
 * tôt ou tard, et la seconde source renaîtrait.
 */
class PropertyLabelLocaleTest extends ApiTestCase
{
    use RefreshDatabase;

    private const LIBELLES_RETIRES = [
        'type_label',
        'contract_type_label',
        'rent_period_label',
        'status_label',
        'title_type_label',
        'condition_label',
    ];

    /** @return array<string, array{0: string}> */
    public static function localeProvider(): array
    {
        return ['fr' => ['fr'], 'en' => ['en'], 'wo' => ['wo']];
    }

    #[DataProvider('localeProvider')]
    public function test_la_fiche_publique_emet_les_codes_et_aucun_libelle(string $locale): void
    {
        $property = Property::factory()->create([
            'status' => PropertyStatus::Pending,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'type' => PropertyType::Apartment,
            'title_type' => TitleType::TitreFoncier,
            'condition' => PropertyCondition::Renovated,
            'published_at' => now(),
        ]);

        $data = $this->getJson('/api/public/properties/'.$property->slug, ['Accept-Language' => $locale])
            ->assertOk()
            ->json('data');

        // Les codes, eux, sont là : c'est d'eux que le front tire le texte.
        $this->assertSame('apartment', $data['type']);
        $this->assertSame('rent', $data['contract_type']);
        $this->assertSame('monthly', $data['rent_period']);
        $this->assertSame('pending', $data['status']);
        $this->assertSame('titre_foncier', $data['title_type']);
        $this->assertSame('renovated', $data['condition']);

        foreach (self::LIBELLES_RETIRES as $cle) {
            $this->assertArrayNotHasKey($cle, $data, "`{$cle}` : le front possède le texte affiché (TCK-351).");
        }
    }

    public function test_la_liste_de_la_console_n_emet_aucun_libelle(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        Property::factory()->create(['agency_id' => $agency->id, 'status' => PropertyStatus::PendingReview]);

        $ligne = $this->getJson("/api/admin/agencies/{$agency->id}/properties?fields[properties]=id,status,type,contract_type&per_page=5")
            ->assertOk()
            ->json('data.0');

        $this->assertSame('pending_review', $ligne['status']);
        foreach (self::LIBELLES_RETIRES as $cle) {
            $this->assertArrayNotHasKey($cle, $ligne, "`{$cle}` : le front possède le texte affiché (TCK-351).");
        }
    }
}
