<?php

namespace Tests\Feature\Api\Admin;

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class UserSupportTest extends TestCase
{
    use RefreshDatabase;

    public function test_force_password_reset_sends_email_revokes_tokens_and_audits_reason(): void
    {
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $target = User::factory()->create();
        $target->createToken('mobile');
        $target->createToken('web');

        $this->postJson("/api/admin/users/{$target->id}/force-password-reset", [
            'reason' => 'Compte compromis',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['action_id']);

        Notification::assertSentTo($target, ResetPasswordNotification::class);
        $this->assertSame(0, $target->tokens()->count());
        $this->assertAudit($actor, $target, 'super_admin_password_reset_forced', 'Compte compromis');
    }

    public function test_unlock_requires_locked_metadata_and_clears_it(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $target = User::factory()->create([
            'metadata' => [
                'locked_at' => now()->toIso8601String(),
                'failed_login_attempts' => 8,
            ],
        ]);

        $this->postJson("/api/admin/users/{$target->id}/unlock", [
            'reason' => 'Identité vérifiée',
        ])->assertOk();

        $this->assertArrayNotHasKey('locked_at', $target->fresh()->metadata ?? []);
        $this->assertAudit($actor, $target, 'super_admin_account_unlocked', 'Identité vérifiée');

        $this->postJson("/api/admin/users/{$target->id}/unlock", [
            'reason' => 'Encore',
        ])->assertStatus(409);
    }

    public function test_reset_2fa_clears_secret_and_forces_reconfiguration(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $target = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => 'secret-value',
            'two_factor_recovery_codes' => json_encode(['AAAAA-BBBBB']),
        ]);

        $this->postJson("/api/admin/users/{$target->id}/reset-2fa", [
            'reason' => 'Téléphone perdu',
        ])->assertOk();

        $fresh = $target->fresh();
        $this->assertFalse($fresh->two_factor_enabled);
        $this->assertNull($fresh->two_factor_secret);
        $this->assertTrue((bool) data_get($fresh->metadata, 'force_2fa_reconfigure'));
        $this->assertAudit($actor, $target, 'super_admin_2fa_reset', 'Téléphone perdu');
    }

    public function test_revoke_sessions_deletes_target_tokens_only(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $actor->createToken('operator');
        $target = User::factory()->create();
        $target->createToken('mobile');
        $target->createToken('web');

        $this->postJson("/api/admin/users/{$target->id}/revoke-sessions", [
            'reason' => 'Session suspecte',
        ])->assertOk();

        $this->assertSame(0, $target->tokens()->count());
        $this->assertSame(1, $actor->tokens()->count());
        $this->assertAudit($actor, $target, 'super_admin_sessions_revoked', 'Session suspecte');
    }

    public function test_delete_single_session_revokes_that_token(): void
    {
        $this->actingAsRole('super_admin');
        $target = User::factory()->create();
        $keep = $target->createToken('keep')->accessToken;
        $delete = $target->createToken('delete')->accessToken;

        $this->deleteJson("/api/admin/users/{$target->id}/sessions/{$delete->id}", [
            'reason' => 'Terminal perdu',
        ])->assertOk();

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $keep->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $delete->id]);
    }

    public function test_reason_is_required(): void
    {
        $this->actingAsRole('super_admin');
        $target = User::factory()->create();

        $this->postJson("/api/admin/users/{$target->id}/revoke-sessions")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['reason']);
    }

    public function test_cannot_target_super_admin(): void
    {
        $this->actingAsRole('super_admin');
        $target = $this->actingAsRole('super_admin');

        $this->postJson("/api/admin/users/{$target->id}/revoke-sessions", [
            'reason' => 'test',
        ])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Support actions cannot target another super-admin.');
    }

    public function test_agency_admin_gets_403_on_support_endpoints(): void
    {
        $this->actingAsRole('agency_admin');
        $target = User::factory()->create();
        $token = $target->createToken('web')->accessToken;

        foreach ([
            ['POST', "/api/admin/users/{$target->id}/force-password-reset"],
            ['POST', "/api/admin/users/{$target->id}/unlock"],
            ['POST', "/api/admin/users/{$target->id}/reset-2fa"],
            ['POST', "/api/admin/users/{$target->id}/revoke-sessions"],
            ['DELETE', "/api/admin/users/{$target->id}/sessions/{$token->id}"],
        ] as [$method, $uri]) {
            $this->json($method, $uri, ['reason' => 'support'])->assertForbidden();
        }
    }

    private function assertAudit(User $actor, User $target, string $event, string $reason): void
    {
        $activity = Activity::query()
            ->where('event', $event)
            ->where('causer_id', $actor->id)
            ->where('subject_id', $target->id)
            ->first();

        $this->assertNotNull($activity);
        $this->assertSame($reason, $activity->properties->get('reason'));
    }
}
