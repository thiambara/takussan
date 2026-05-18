<?php

namespace Tests\Feature\WelcomeView;

use App\Models\User;
use App\Models\WelcomeView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-251 — One-shot welcome modale tracking, strictly user-scoped.
 */
class WelcomeViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_endpoints_require_auth(): void
    {
        $this->getJson('/api/me/welcome-seen')->assertUnauthorized();
        $this->postJson('/api/me/welcome-seen', ['key' => 'customer-welcome'])->assertUnauthorized();
    }

    public function test_index_returns_empty_list_for_new_user(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/me/welcome-seen')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_store_creates_entry_and_index_returns_it(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => 'customer-welcome'])
            ->assertStatus(201)
            ->assertJsonPath('data.key', 'customer-welcome')
            ->assertJsonPath('data.user_id', $user->id);

        $this->assertDatabaseCount('welcome_views', 1);
        $this->assertDatabaseHas('welcome_views', [
            'user_id' => $user->id,
            'key' => 'customer-welcome',
        ]);

        $this->actingAs($user)
            ->getJson('/api/me/welcome-seen')
            ->assertOk()
            ->assertExactJson(['data' => ['customer-welcome']]);
    }

    public function test_store_is_idempotent(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => 'host-welcome']);
        $first->assertStatus(201);

        $second = $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => 'host-welcome']);
        $second->assertOk();

        $this->assertDatabaseCount('welcome_views', 1);
    }

    public function test_user_scoping_isolates_keys_between_users(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        WelcomeView::factory()->for($alice)->create(['key' => 'customer-welcome']);
        WelcomeView::factory()->for($alice)->create(['key' => 'tenant-welcome']);
        WelcomeView::factory()->for($bob)->create(['key' => 'host-welcome']);

        $this->actingAs($alice)
            ->getJson('/api/me/welcome-seen')
            ->assertOk()
            ->assertJsonPath('data', ['customer-welcome', 'tenant-welcome']);

        $this->actingAs($bob)
            ->getJson('/api/me/welcome-seen')
            ->assertOk()
            ->assertJsonPath('data', ['host-welcome']);
    }

    public function test_invalid_key_returns_422(): void
    {
        $user = User::factory()->create();

        // Empty key
        $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['key']);

        // Spaces / invalid chars
        $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => 'has spaces'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['key']);

        // Too long (>64 chars)
        $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => str_repeat('a', 65)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['key']);

        // Forbidden char
        $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => 'invalid/char'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['key']);
    }

    public function test_accepted_key_charset_includes_alnum_and_dot_underscore_dash_colon(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/me/welcome-seen', ['key' => 'host.individual_v2:final-1'])
            ->assertStatus(201);
    }
}
