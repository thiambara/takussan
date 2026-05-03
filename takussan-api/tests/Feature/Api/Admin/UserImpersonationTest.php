<?php

namespace Tests\Feature\Api\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-144 — Impersonation start/stop. Verifies the token is short-lived,
 * named correctly, and that activity log entries link actor + target.
 */
class UserImpersonationTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_start_returns_short_lived_token_named_impersonation(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $target = User::factory()->create();

        $response = $this->postJson("/api/admin/users/{$target->id}/impersonate")
            ->assertOk()
            ->assertJsonStructure(['token', 'expires_at', 'actor_id', 'target_user_id']);

        $this->assertSame($actor->id, $response->json('actor_id'));
        $this->assertSame($target->id, $response->json('target_user_id'));

        $stored = PersonalAccessToken::query()
            ->where('tokenable_id', $target->id)
            ->where('tokenable_type', $target->getMorphClass())
            ->where('name', 'impersonation')
            ->first();

        $this->assertNotNull($stored);
        $this->assertNotNull($stored->expires_at);
        $this->assertTrue($stored->expires_at->lte(now()->addMinutes(61)));
        $this->assertTrue($stored->expires_at->gt(now()));

        $this->assertTrue(
            Activity::query()->where('event', 'super_admin_impersonation_started')
                ->where('causer_id', $actor->id)
                ->where('subject_id', $target->id)
                ->exists(),
        );
    }

    public function test_self_impersonation_is_rejected(): void
    {
        $actor = $this->actingAsRole('super_admin');

        $this->postJson("/api/admin/users/{$actor->id}/impersonate")
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot impersonate yourself.');
    }

    public function test_stop_revokes_all_impersonation_tokens_for_target(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $target = User::factory()->create();
        $target->createToken('impersonation', ['*'], now()->addHour());
        $target->createToken('impersonation', ['*'], now()->addHour());
        $target->createToken('regular-session', ['*'], now()->addHour());

        $this->postJson('/api/admin/impersonate/stop', ['user_id' => $target->id])
            ->assertOk()
            ->assertJsonPath('revoked_count', 2);

        $this->assertSame(
            0,
            PersonalAccessToken::query()
                ->where('tokenable_id', $target->id)
                ->where('name', 'impersonation')
                ->count(),
        );

        $this->assertSame(
            1,
            PersonalAccessToken::query()
                ->where('tokenable_id', $target->id)
                ->where('name', 'regular-session')
                ->count(),
        );

        $this->assertTrue(
            Activity::query()->where('event', 'super_admin_impersonation_stopped')
                ->where('causer_id', $actor->id)
                ->where('subject_id', $target->id)
                ->exists(),
        );
    }

    public function test_stop_requires_user_id_param(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/impersonate/stop', [])
            ->assertStatus(422);
    }
}
