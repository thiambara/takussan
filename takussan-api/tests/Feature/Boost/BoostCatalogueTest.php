<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\LegacyFeaturedConversion;
use Database\Seeders\System\BoostProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §4) — le catalogue initial, idempotent, et la conversion des vedettes d'avant. */
class BoostCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_catalogue_initial_est_celui_de_l_adr(): void
    {
        $offres = BoostProduct::query()->orderBy('sort_order')->get()
            ->map(fn (BoostProduct $p) => [$p->kind->value, $p->variant?->value, $p->duration_days, $p->price_credits])
            ->all();

        $this->assertSame([
            ['bump', null, 0, 5],
            ['featured', null, 7, 20],
            ['featured', null, 15, 35],
            ['featured', null, 30, 60],
            ['badge', 'urgent', 7, 10],
            ['badge', 'price_drop', 7, 10],
        ], $offres);
    }

    public function test_le_seeder_est_idempotent_et_n_ecrase_pas_un_prix_regle(): void
    {
        BoostProduct::query()->where('kind', 'bump')->update(['price_credits' => 8]);

        (new BoostProductSeeder)->run();
        (new BoostProductSeeder)->run();

        $this->assertSame(6, BoostProduct::query()->count());
        $this->assertSame(8, BoostProduct::query()->where('kind', 'bump')->value('price_credits'));
    }

    public function test_un_featured_d_avant_devient_une_vedette_offerte(): void
    {
        $agency = Agency::factory()->create();
        $vedette = Property::factory()->published()->create(['agency_id' => $agency->id, 'featured' => true]);
        $sansEspace = Property::factory()->published()->create(['agency_id' => null, 'featured' => true]);

        $this->assertSame(1, app(LegacyFeaturedConversion::class)->run());
        $this->assertSame(0, app(LegacyFeaturedConversion::class)->run(), 'idempotent');

        $boost = PropertyBoost::query()->where('property_id', $vedette->id)->sole();
        $this->assertSame(BoostKind::Featured, $boost->kind);
        $this->assertSame(BoostStatus::Active, $boost->status);
        $this->assertTrue($boost->offered);
        $this->assertSame(0, $boost->price_credits);
        $this->assertTrue($boost->ends_at->isSameDay(now()->addDays(30)));
        $this->assertTrue($vedette->fresh()->sponsored_until->isSameDay(now()->addDays(30)));
        $this->assertFalse((bool) $sansEspace->fresh()->featured, 'sans espace, pas de boost possible : la vedette tombe');
    }
}
