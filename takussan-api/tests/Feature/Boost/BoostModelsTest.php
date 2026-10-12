<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §5, §7) — `ranked_at` suit la publication, et une copie n'hérite d'aucun boost. */
class BoostModelsTest extends TestCase
{
    use RefreshDatabase;

    public function test_ranked_at_prend_la_date_de_publication(): void
    {
        $at = Carbon::parse('2026-10-01 09:00:00');
        $property = Property::factory()->published()->create(['published_at' => $at]);

        $this->assertTrue($property->fresh()->ranked_at->equalTo($at));
    }

    public function test_une_republication_remonte_le_bien(): void
    {
        // Instants sans fraction : `timestamp(0)` ARRONDIT les microsecondes, il ne les tronque pas.
        $this->travelTo(Carbon::parse('2026-10-01 09:00:00'));
        $property = Property::factory()->published()->create(['published_at' => now()->subDays(10)]);
        $this->travelTo(Carbon::parse('2026-10-02 10:00:00'));

        $property->update(['published_at' => now()]);

        $this->assertTrue($property->fresh()->ranked_at->equalTo(Carbon::parse('2026-10-02 10:00:00')));
    }

    public function test_un_ranked_at_explicite_n_est_pas_ecrase(): void
    {
        $this->travelTo(Carbon::parse('2026-10-01 09:00:00'));
        $ranked = Carbon::parse('2026-10-01 09:30:00');
        $property = Property::factory()->published()->create(['published_at' => now(), 'ranked_at' => $ranked]);

        $this->assertTrue($property->fresh()->ranked_at->equalTo($ranked));
    }

    public function test_une_copie_n_herite_d_aucune_mise_en_avant(): void
    {
        $property = Property::factory()->published()->create([
            'featured' => true, 'sponsored_until' => now()->addDays(3),
            'badge' => BoostBadge::Urgent, 'badge_until' => now()->addDays(3),
        ]);

        $copie = $property->replicate();

        $this->assertFalse((bool) $copie->featured);
        $this->assertNull($copie->sponsored_until);
        $this->assertNull($copie->badge);
        $this->assertNull($copie->badge_until);
        $this->assertNull($copie->ranked_at);
    }

    public function test_relations(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $agency->id, 'kind' => BoostKind::Bump,
            'price_credits' => 5, 'duration_days' => 0, 'starts_at' => now(), 'status' => BoostStatus::Ended,
        ]);

        $this->assertTrue($property->boosts()->whereKey($boost->id)->exists());
        $this->assertTrue($boost->property->is($property));
        $this->assertSame(0, $agency->creditLots()->count());
    }
}
