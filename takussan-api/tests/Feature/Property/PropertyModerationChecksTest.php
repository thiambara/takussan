<?php

namespace Tests\Feature\Property;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Services\Property\PropertyModerationChecks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * TCK-2672 (AC6) — la liste de contrôle d'un bien soumis : photos, adresse, description, et le
 * prix comparé à la médiane des biens EN LIGNE de même type, même transaction (même période) et
 * même quartier — `null` sous cinq comparables.
 */
class PropertyModerationChecksTest extends TestCase
{
    use RefreshDatabase;

    private GeoNeighborhood $quartier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->quartier = GeoNeighborhood::factory()->create();
    }

    /** @param  array<string, mixed>  $attributes */
    private function bien(array $attributes = [], ?int $quartier = -1): Property
    {
        $property = Property::factory()->create($attributes + [
            'type' => PropertyType::Apartment, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly,
            'status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now(),
            'price' => 500000, 'is_test' => false,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $property->id,
            'geo_neighborhood_id' => $quartier === -1 ? $this->quartier->id : $quartier,
        ]);

        return $property->fresh();
    }

    private function soumis(int $price = 600000): Property
    {
        return $this->bien(['status' => PropertyStatus::PendingReview, 'published_at' => null, 'price' => $price]);
    }

    /** @param  list<int>  $prix */
    private function comparables(array $prix): void
    {
        foreach ($prix as $p) {
            $this->bien(['price' => $p]);
        }
    }

    public function test_ac6_quatre_comparables_pas_de_mediane(): void
    {
        $this->comparables([400000, 450000, 500000, 550000]);

        $this->assertNull(app(PropertyModerationChecks::class)->priceVsMedian($this->soumis()));
    }

    public function test_ac6_six_comparables_la_mediane_et_l_ecart(): void
    {
        $this->comparables([400000, 450000, 500000, 500000, 550000, 600000]);

        $this->assertSame(
            ['median' => 500000.0, 'deviation_pct' => 20.0, 'sample_size' => 6],
            app(PropertyModerationChecks::class)->priceVsMedian($this->soumis(600000)),
        );
    }

    public function test_cinq_comparables_suffisent(): void
    {
        $this->comparables([400000, 450000, 500000, 550000, 600000]);

        $this->assertSame(5, app(PropertyModerationChecks::class)->priceVsMedian($this->soumis())['sample_size']);
    }

    /** Un bien déjà en ligne (verrou plateforme levé, relu) ne se compare pas à lui-même. */
    public function test_le_bien_lui_meme_ne_compte_pas(): void
    {
        $this->comparables([400000, 450000, 500000, 550000]);

        $this->assertNull(app(PropertyModerationChecks::class)->priceVsMedian($this->bien(['price' => 600000])));
    }

    public function test_ne_comptent_ni_les_biens_hors_ligne_ni_les_autres_types_periodes_ou_quartiers(): void
    {
        $this->comparables([500000, 500000, 500000, 500000]);
        $this->bien(['price' => 500000, 'status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->bien(['price' => 500000, 'visibility' => PropertyVisibility::Private]);
        $this->bien(['price' => 500000, 'type' => PropertyType::Villa]);
        $this->bien(['price' => 500000, 'contract_type' => ContractType::Sale, 'rent_period' => null]);
        $this->bien(['price' => 500000, 'rent_period' => RentPeriod::Daily]);
        $this->bien(['price' => 500000], GeoNeighborhood::factory()->create()->id);
        $this->bien(['price' => 500000], null);

        $this->assertNull(app(PropertyModerationChecks::class)->priceVsMedian($this->soumis()));
    }

    public function test_sans_quartier_ou_sans_prix_pas_de_mediane(): void
    {
        $this->comparables([500000, 500000, 500000, 500000, 500000, 500000]);
        $checks = app(PropertyModerationChecks::class);

        $this->assertNull($checks->priceVsMedian($this->bien(['status' => PropertyStatus::PendingReview, 'published_at' => null], null)));
        $this->assertNull($checks->priceVsMedian($this->soumis(0)));
    }

    public function test_photos_adresse_et_description(): void
    {
        $property = $this->soumis();
        $property->update(['description' => "Bel appartement lumineux,\n proche de la mer. Appelez le 77 418 90 22."]);
        foreach (range(1, 3) as $i) {
            $property->addMedia(UploadedFile::fake()->image("p{$i}.jpg"))->toMediaCollection('photos');
        }

        $checks = app(PropertyModerationChecks::class)->checks($property->fresh());

        $this->assertSame(3, $checks['photos_count']);
        $this->assertSame(5, $checks['photos_expected']);
        $this->assertTrue($checks['address_complete']);
        $this->assertSame(13, $checks['description_words']);
        $this->assertTrue($checks['description_has_contact']);
    }

    public function test_une_adresse_sans_position_ou_sans_quartier_est_incomplete(): void
    {
        $property = $this->soumis();
        $property->address->update(['latitude' => null]);
        $this->assertFalse(app(PropertyModerationChecks::class)->checks($property->fresh())['address_complete']);

        $sansQuartier = $this->bien(['status' => PropertyStatus::PendingReview, 'published_at' => null, 'description' => ''], null);
        $checks = app(PropertyModerationChecks::class)->checks($sansQuartier);
        $this->assertFalse($checks['address_complete']);
        $this->assertSame(0, $checks['description_words']);
        $this->assertFalse($checks['description_has_contact']);
    }
}
