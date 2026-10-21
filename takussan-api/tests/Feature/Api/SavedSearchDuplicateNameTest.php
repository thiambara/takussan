<?php

namespace Tests\Feature\Api;

use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1103 (P92.01) — `saved_searches` porte `unique(user_id, name)`. Un nom déjà pris par le
 * même compte se refuse en 422 sur `name`, à la création comme au renommage, au lieu du 500 de
 * la contrainte. Le dialogue du front propose le même nom pour la même recherche : le cas est
 * celui d'un double enregistrement, pas un cas d'école.
 */
class SavedSearchDuplicateNameTest extends TestCase
{
    use RefreshDatabase;

    public function test_enregistrer_deux_fois_sous_le_meme_nom_rend_422(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $corps = ['name' => 'Appartements à Dakar', 'criteria' => ['city' => 'Dakar']];

        $this->postJson('/api/saved-searches', $corps)->assertCreated();
        $this->postJson('/api/saved-searches', $corps)
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');

        $this->assertSame(1, SavedSearch::where('user_id', $user->id)->count());
    }

    public function test_le_meme_nom_reste_libre_pour_un_autre_compte(): void
    {
        $autre = User::factory()->create();
        SavedSearch::factory()->create(['user_id' => $autre->id, 'name' => 'Appartements à Dakar']);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/saved-searches', ['name' => 'Appartements à Dakar', 'criteria' => ['city' => 'Dakar']])
            ->assertCreated();
    }

    public function test_renommer_vers_un_nom_pris_rend_422(): void
    {
        $user = User::factory()->create();
        SavedSearch::factory()->create(['user_id' => $user->id, 'name' => 'Première']);
        $seconde = SavedSearch::factory()->create(['user_id' => $user->id, 'name' => 'Seconde']);
        Sanctum::actingAs($user);

        $this->patchJson("/api/saved-searches/{$seconde->id}", ['name' => 'Première'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');

        // Témoin : renvoyer son propre nom n'est pas un doublon.
        $this->patchJson("/api/saved-searches/{$seconde->id}", ['name' => 'Seconde', 'is_active' => false])
            ->assertOk();
    }
}
