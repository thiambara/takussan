<?php

namespace Tests\Feature\Boost;

use App\Models\Enums\BoostBadge;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §5) — la fiche publique et la liste exposent le badge actif. */
class PropertyResourceBadgeTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_badge_est_expose(): void
    {
        $property = Property::factory()->published()->create();
        $property->forceFill(['badge' => BoostBadge::Urgent, 'badge_until' => now()->addDays(3)])->saveQuietly();

        $this->getJson("/api/public/properties/{$property->slug}")
            ->assertOk()
            ->assertJsonPath('data.badge', 'urgent');
        $this->getJson('/api/public/properties')
            ->assertOk()
            ->assertJsonPath('data.0.badge', 'urgent');
    }
}
