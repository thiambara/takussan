<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-592 (P16, AC21) — la section prestataire du profil édite un réglage à la fois : une clé
 * absente de `PATCH …/trades` garde sa valeur. Elle était lue comme une liste vide.
 */
class ServiceProviderTradesPartialUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_zones_alone_leave_specialties_untouched(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'specialties' => ['plumbing', 'electrical'],
            'service_areas' => ['Dakar'],
        ]);
        Sanctum::actingAs($user);

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", ['intervention_zones' => ['Mbour', 'Thiès']])
            ->assertOk()
            ->assertJsonPath('data.trades', ['plumbing', 'electrical'])
            ->assertJsonPath('data.intervention_zones', ['Mbour', 'Thiès']);

        $sp->refresh();
        $this->assertSame(['plumbing', 'electrical'], $sp->specialties);
        $this->assertSame(['Mbour', 'Thiès'], $sp->service_areas);
    }

    public function test_trades_alone_leave_zones_untouched_and_an_explicit_empty_list_clears(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'specialties' => ['plumbing'],
            'service_areas' => ['Dakar'],
        ]);
        Sanctum::actingAs($user);

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", ['trades' => ['painting']])->assertOk();
        $this->assertSame(['Dakar'], $sp->refresh()->service_areas);

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", ['intervention_zones' => []])->assertOk();
        $this->assertNull($sp->refresh()->service_areas);
        $this->assertSame(['painting'], $sp->specialties);
    }

    public function test_owner_reads_back_settings_and_nobody_else_does(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'specialties' => ['plumbing'],
            'service_areas' => ['Dakar'],
            'metadata' => ['visit_fee' => 2500, 'availability' => [['day' => 'monday', 'from' => '08:00', 'to' => '12:00']]],
        ]);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/me/profiles/{$sp->id}")->assertForbidden();

        Sanctum::actingAs($user);
        $this->getJson("/api/me/profiles/{$sp->id}")
            ->assertOk()
            ->assertJsonPath('data.trades', ['plumbing'])
            ->assertJsonPath('data.intervention_zones', ['Dakar'])
            ->assertJsonPath('data.visit_fee', 2500)
            ->assertJsonPath('data.available_slots.0.day', 'monday');
    }
}
