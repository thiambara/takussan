<?php

namespace Tests\Feature\Moderation;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1300 (P118.05) — la file de modération des biens se départage par l'`id` : des biens soumis
 * dans la même seconde, ou sans `submitted_at` (cas des seeders), avaient un ordre au hasard du plan.
 */
class PropertyModerationQueueOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_file_suit_la_soumission_puis_l_id(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = User::factory()->create(['agency_id' => $agency->id]);

        $soumis = ['2026-10-22 09:00:00', null, '2026-10-21 08:00:00', '2026-10-22 09:00:00', null, '2026-10-22 09:00:00', null];
        $biens = collect($soumis)->map(fn (?string $quand) => Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => $quand,
        ]));
        // La vie normale d'un bien : une mise à jour déplace sa position physique.
        $biens->first()->update(['title' => 'Relu']);
        $biens->get(1)->update(['title' => 'Relu aussi']);

        // `submitted_at` croissant, nuls en dernier (PostgreSQL), puis l'`id`.
        $attendu = $biens
            ->sortBy(fn (Property $p) => [$p->submitted_at === null ? 1 : 0, $p->submitted_at?->timestamp ?? 0, $p->id])
            ->pluck('id')
            ->values()
            ->all();

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $response = $this->getJson('/api/properties/moderation')->assertOk();

        $this->assertSame($attendu, collect($response->json('data'))->pluck('id')->all());
    }
}
