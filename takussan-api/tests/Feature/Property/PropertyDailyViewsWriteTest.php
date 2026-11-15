<?php

namespace Tests\Feature\Property;

use App\Models\Property;
use App\Models\PropertyDailyView;
use App\Services\Property\PropertyViewCounter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Tests\ApiTestCase;

/**
 * TCK-2905 (ADR-0117 § 2, § 3) — une vue comptée par `PropertyViewCounter` est aussi datée : une ligne
 * (bien, jour, nombre), sans IP ni visiteur ; le limiteur décide pour les deux ; la purge garde 400 jours.
 */
class PropertyDailyViewsWriteTest extends ApiTestCase
{
    use RefreshDatabase;

    private function vuesDuJour(Property $bien, string $jour): ?int
    {
        return PropertyDailyView::query()->where('property_id', $bien->id)->whereDate('day', $jour)->value('views');
    }

    public function test_une_vue_publique_ecrit_la_ligne_du_jour_et_l_incremente(): void
    {
        $this->travelTo('2026-11-15 10:00:00');
        $bien = Property::factory()->published()->create(['views_count' => 10]);

        $this->postJson("/api/public/properties/{$bien->slug}/view", [], ['REMOTE_ADDR' => '41.82.1.1'])->assertNoContent();
        $this->postJson("/api/public/properties/{$bien->slug}/view", [], ['REMOTE_ADDR' => '41.83.1.1'])->assertNoContent();

        $this->assertSame(2, $this->vuesDuJour($bien, '2026-11-15'));
        $this->assertSame(12, (int) $bien->fresh()->views_count);

        $this->travelTo('2026-11-16 08:00:00');
        $this->postJson("/api/public/properties/{$bien->slug}/view", [], ['REMOTE_ADDR' => '41.84.1.1'])->assertNoContent();
        $this->assertSame(1, $this->vuesDuJour($bien, '2026-11-16'));
        $this->assertSame(2, $this->vuesDuJour($bien, '2026-11-15'));
    }

    public function test_une_vue_refusee_par_le_limiteur_n_est_pas_datee(): void
    {
        $this->travelTo('2026-11-15 10:00:00');
        $bien = Property::factory()->published()->create();
        RateLimiter::clear(PropertyViewCounter::cle($bien, '41.82.1.1'));

        foreach (range(1, PropertyViewCounter::MAX_PAR_HEURE + 2) as $_) {
            app(PropertyViewCounter::class)->record($bien, '41.82.1.1');
        }

        $this->assertSame(PropertyViewCounter::MAX_PAR_HEURE, $this->vuesDuJour($bien, '2026-11-15'));
    }

    public function test_la_table_ne_garde_ni_ip_ni_visiteur(): void
    {
        $this->assertSame(
            ['created_at', 'day', 'id', 'property_id', 'updated_at', 'views'],
            collect(Schema::getColumnListing('property_daily_views'))->sort()->values()->all(),
        );
    }

    public function test_la_purge_garde_400_jours(): void
    {
        $this->travelTo('2026-11-15 10:00:00');
        $bien = Property::factory()->create();
        PropertyDailyView::query()->create(['property_id' => $bien->id, 'day' => '2025-10-11', 'views' => 3]); // J-400 : gardé
        PropertyDailyView::query()->create(['property_id' => $bien->id, 'day' => '2025-10-10', 'views' => 4]); // J-401 : purgé

        $this->artisan('properties:purge-daily-views')->assertSuccessful();

        $this->assertSame(3, $this->vuesDuJour($bien, '2025-10-11'));
        $this->assertNull($this->vuesDuJour($bien, '2025-10-10'));
    }
}
