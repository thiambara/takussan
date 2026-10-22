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

    /**
     * TCK-1315 (P117.02) — `hourly_rate` comme `visit_fee` : clé absente, on garde ; `null`, on
     * efface. Un `null` gardait l'ancien taux, et le champ vidé reparaissait au rechargement.
     */
    public function test_null_hourly_rate_clears_it_and_an_absent_key_keeps_it(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'hourly_rate_min' => 5000,
            'metadata' => ['visit_fee' => 2500],
        ]);
        Sanctum::actingAs($user);

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", ['trades' => ['painting']])->assertOk();
        $this->assertSame('5000.00', $sp->refresh()->hourly_rate_min);

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", ['hourly_rate' => null, 'visit_fee' => null])
            ->assertOk()
            ->assertJsonPath('data.hourly_rate', null)
            ->assertJsonPath('data.visit_fee', null);

        $this->assertNull($sp->refresh()->hourly_rate_min);
        $this->assertArrayNotHasKey('visit_fee', $sp->metadata ?? []);
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
