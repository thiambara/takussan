<?php

namespace Tests\Feature\Idempotence;

use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1410 (P144.08, ADR-0072 § 8) — une demande de visite rejouée au même créneau rend la visite
 * active déjà ouverte, sans clé : elle ne consomme plus le quota de trois, et ne prévient pas deux
 * fois. Mesuré avant correctif : 201, 201, 201 au même créneau, puis 422 sur un autre.
 */
class VisiteRejoueeTest extends TestCase
{
    use RefreshDatabase;

    public function test_trois_demandes_au_meme_creneau_ne_font_qu_une_visite_et_laissent_le_quota(): void
    {
        $property = Property::factory()->published()->create();
        Sanctum::actingAs(User::factory()->create());
        $creneau = now()->addDays(2)->setTime(10, 0)->toIso8601String();

        $premiere = $this->postJson("/api/public/properties/{$property->slug}/visit-request", ['scheduled_at' => $creneau])->assertCreated();
        $notifications = DB::table('app_notifications')->count();
        foreach ([1, 2] as $rejeu) {
            $this->postJson("/api/public/properties/{$property->slug}/visit-request", ['scheduled_at' => $creneau])
                ->assertCreated()
                ->assertJsonPath('data.id', $premiere->json('data.id'));
        }
        $this->assertSame(1, PropertyVisit::query()->count());
        $this->assertSame($notifications, DB::table('app_notifications')->count(), 'aucune seconde notification');

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(2)->setTime(11, 0)->toIso8601String(),
        ])->assertCreated();
        $this->assertSame(2, PropertyVisit::query()->count());
    }

    public function test_une_visite_annulee_au_meme_creneau_n_est_pas_rendue(): void
    {
        $property = Property::factory()->published()->create();
        Sanctum::actingAs(User::factory()->create());
        $creneau = now()->addDays(2)->setTime(10, 0)->toIso8601String();

        $premiere = $this->postJson("/api/public/properties/{$property->slug}/visit-request", ['scheduled_at' => $creneau])->assertCreated();
        PropertyVisit::query()->whereKey($premiere->json('data.id'))->update(['status' => 'cancelled']);

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", ['scheduled_at' => $creneau])->assertCreated();
        $this->assertSame(2, PropertyVisit::query()->count());
    }

    public function test_deux_visiteurs_au_meme_creneau_ont_chacun_leur_visite(): void
    {
        $property = Property::factory()->published()->create();
        $creneau = now()->addDays(2)->setTime(10, 0)->toIso8601String();

        foreach ([User::factory()->create(), User::factory()->create()] as $visiteur) {
            Sanctum::actingAs($visiteur);
            $this->postJson("/api/public/properties/{$property->slug}/visit-request", ['scheduled_at' => $creneau])->assertCreated();
        }

        $this->assertSame(2, PropertyVisit::query()->count());
    }
}
