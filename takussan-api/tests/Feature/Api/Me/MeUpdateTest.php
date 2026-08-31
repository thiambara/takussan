<?php

namespace Tests\Feature\Api\Me;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-253 — PATCH /api/me persists the deferred minimal-profile sheet
 * fields (phone, city, search_intent) without requiring first/last name.
 */
class MeUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_patch_partial_fields(): void
    {
        $user = User::factory()->create([
            'phone' => null,
            'preferences' => null,
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->patchJson('/api/me', [
            'phone' => '+221770000001',
            'city' => 'Dakar',
            'search_intent' => 'rent',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.phone', '+221770000001')
            ->assertJsonPath('data.preferences.city', 'Dakar')
            ->assertJsonPath('data.preferences.search_intent', 'rent');

        $user->refresh();
        $this->assertSame('+221770000001', $user->phone);
        $this->assertSame(['city' => 'Dakar', 'search_intent' => 'rent'], $user->preferences);
    }

    public function test_only_supplied_fields_are_persisted(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000099',
            'preferences' => ['city' => 'Saint-Louis', 'search_intent' => 'buy'],
        ]);
        $token = $user->createToken('test')->plainTextToken;

        // Submit ONLY city — phone and search_intent must remain untouched.
        $response = $this->withToken($token)->patchJson('/api/me', [
            'city' => 'Thiès',
        ]);

        $response->assertStatus(200);

        $user->refresh();
        $this->assertSame('+221770000099', $user->phone);
        $this->assertSame(['city' => 'Thiès', 'search_intent' => 'buy'], $user->preferences);
    }

    public function test_invalid_search_intent_is_rejected(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->patchJson('/api/me', [
            'search_intent' => 'lease',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['search_intent']);
    }

    public function test_anonymous_request_is_rejected(): void
    {
        $response = $this->patchJson('/api/me', [
            'city' => 'Dakar',
        ]);

        $response->assertStatus(401);
    }

    /**
     * TCK-493 — l'intention d'entrée se mémorise, et elle n'accorde rien.
     */
    public function test_entry_intent_est_memorise_dans_les_preferences(): void
    {
        $user = User::factory()->create(['preferences' => null]);

        $this->actingAs($user)
            ->patchJson('/api/me', ['entry_intent' => 'publish'])
            ->assertOk()
            ->assertJsonPath('data.preferences.entry_intent', 'publish');

        $this->assertSame('publish', $user->fresh()->preferences['entry_intent']);
    }

    public function test_passer_la_question_est_une_reponse_a_part_entiere(): void
    {
        // C'est `skipped` qui empêche de reposer la question à quelqu'un qui a
        // choisi de passer. Sans valeur enregistrée, « passer » deviendrait
        // « repousser à la prochaine connexion » — ce qui n'est pas passer.
        $user = User::factory()->create(['preferences' => null]);

        $this->actingAs($user)
            ->patchJson('/api/me', ['entry_intent' => 'skipped'])
            ->assertOk()
            ->assertJsonPath('data.preferences.entry_intent', 'skipped');
    }

    public function test_une_intention_inconnue_est_refusee(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/me', ['entry_intent' => 'acheter-la-plateforme'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('entry_intent');
    }

    public function test_repondre_a_la_question_ne_cree_aucun_profil(): void
    {
        // AC6 — la réponse ORIENTE, elle n'attribue rien.
        $user = User::factory()->create();
        $avant = $this->actingAs($user)->getJson('/api/me/profiles')->json('data');

        $this->actingAs($user)->patchJson('/api/me', ['entry_intent' => 'publish'])->assertOk();

        $apres = $this->actingAs($user)->getJson('/api/me/profiles')->json('data');
        $this->assertSame($avant, $apres);
    }

    public function test_l_intention_n_ecrase_pas_les_autres_preferences(): void
    {
        $user = User::factory()->create(['preferences' => ['city' => 'Thiès']]);

        $this->actingAs($user)
            ->patchJson('/api/me', ['entry_intent' => 'search'])
            ->assertOk()
            ->assertJsonPath('data.preferences.city', 'Thiès')
            ->assertJsonPath('data.preferences.entry_intent', 'search');
    }
}
