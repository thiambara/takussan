<?php

namespace Tests\Feature\Api;

use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SavedSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_creates_and_lists_saved_searches(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/saved-searches', [
            'name' => 'Appartements Almadies',
            'criteria' => ['neighborhood' => 'Almadies', 'min_price' => 200000],
            'notification_frequency' => 'daily',
        ])->assertCreated();

        $this->getJson('/api/saved-searches')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_user_cannot_update_other_users_search(): void
    {
        $u1 = User::factory()->create();
        $u2 = User::factory()->create();
        $search = SavedSearch::factory()->create(['user_id' => $u1->id]);

        Sanctum::actingAs($u2);
        $this->patchJson("/api/saved-searches/{$search->id}", ['name' => 'boom'])
            ->assertForbidden();
    }
}
