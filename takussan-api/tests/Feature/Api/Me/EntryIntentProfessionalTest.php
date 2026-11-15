<?php

namespace Tests\Feature\Api\Me;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2607 — l'orientation reconnaît le professionnel : `entry_intent` accepte `professional`,
 * comme `search`, `publish` et `skipped` (TCK-493). La réponse ORIENTE et n'attribue rien.
 */
class EntryIntentProfessionalTest extends TestCase
{
    use RefreshDatabase;

    /** AC1 — 200, et la valeur est relue. */
    public function test_le_professionnel_est_une_reponse_enregistree(): void
    {
        $user = User::factory()->create(['preferences' => null]);

        $this->actingAs($user)
            ->patchJson('/api/me', ['entry_intent' => 'professional'])
            ->assertOk()
            ->assertJsonPath('data.preferences.entry_intent', 'professional');

        $this->assertSame('professional', $user->fresh()->preferences['entry_intent']);
        $this->actingAs($user)->getJson('/api/auth/me')->assertOk()
            ->assertJsonFragment(['entry_intent' => 'professional']);
    }

    /** Répondre « professionnel » ne crée aucun profil : l'orientation n'accorde rien. */
    public function test_repondre_professionnel_ne_cree_aucun_profil(): void
    {
        $user = User::factory()->create();
        $avant = $user->profileTypes();

        $this->actingAs($user)->patchJson('/api/me', ['entry_intent' => 'professional'])->assertOk();

        $this->assertEquals($avant, $user->fresh()->profileTypes());
    }

    /** Le vocabulaire reste fermé. */
    public function test_une_autre_valeur_reste_refusee(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/me', ['entry_intent' => 'pro'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('entry_intent');
    }
}
