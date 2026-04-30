<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_active_sessions(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('device-1');

        $this->withToken($token->plainTextToken)
            ->getJson('/api/auth/sessions')
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'name', 'created_at', 'current']]]);
    }

    public function test_current_token_is_flagged(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('my-device');

        $response = $this->withToken($token->plainTextToken)
            ->getJson('/api/auth/sessions')
            ->assertOk();

        $sessions = $response->json('data');
        $current = collect($sessions)->firstWhere('current', true);

        $this->assertNotNull($current);
        $this->assertEquals('my-device', $current['name']);
    }

    public function test_can_delete_another_session(): void
    {
        $user = User::factory()->create();
        $token1 = $user->createToken('device-1');
        $token2 = $user->createToken('device-2');
        $tokenId = $token2->accessToken->id;

        $this->withToken($token1->plainTextToken)
            ->deleteJson("/api/auth/sessions/{$tokenId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $tokenId]);
    }

    public function test_cannot_revoke_current_session(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('my-device');
        $tokenId = $token->accessToken->id;

        $this->withToken($token->plainTextToken)
            ->deleteJson("/api/auth/sessions/{$tokenId}")
            ->assertStatus(422);

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $tokenId]);
    }

    public function test_cannot_delete_another_users_session(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $tokenA = $userA->createToken('device-a');
        $tokenB = $userB->createToken('device-b');
        $tokenBId = $tokenB->accessToken->id;

        $this->withToken($tokenA->plainTextToken)
            ->deleteJson("/api/auth/sessions/{$tokenBId}")
            ->assertStatus(404);
    }

    public function test_endpoints_require_auth(): void
    {
        $this->getJson('/api/auth/sessions')->assertUnauthorized();
        $this->deleteJson('/api/auth/sessions/1')->assertUnauthorized();
    }
}
