<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class AccountDeletionCancelTest extends TestCase
{
    use RefreshDatabase;

    public function test_cancel_within_grace_returns_204(): void
    {
        $user = User::factory()->create(['deletion_requested_at' => now()]);
        AccountDeletionRequest::factory()->for($user)->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/auth/me/deletion-request')->assertStatus(204);

        $this->assertNull(AccountDeletionRequest::query()->where('user_id', $user->id)->first());
        $this->assertNull($user->fresh()->deletion_requested_at);
    }

    public function test_cancel_logs_activity_transition(): void
    {
        $user = User::factory()->create(['deletion_requested_at' => now()]);
        AccountDeletionRequest::factory()->for($user)->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/auth/me/deletion-request')->assertStatus(204);

        $log = Activity::query()->where('event', 'account.deletion.cancelled')->first();
        $this->assertNotNull($log);
        $this->assertSame($user->id, $log->causer_id);
    }

    public function test_cancel_after_grace_returns_410(): void
    {
        $user = User::factory()->create(['deletion_requested_at' => now()->subDays(31)]);
        AccountDeletionRequest::factory()->for($user)->due()->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/auth/me/deletion-request')->assertStatus(410);
    }

    public function test_cancel_returns_404_when_no_pending_request(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/auth/me/deletion-request')->assertStatus(404);
    }

    public function test_show_returns_pending_request_payload(): void
    {
        $user = User::factory()->create(['deletion_requested_at' => now()]);
        $request = AccountDeletionRequest::factory()->for($user)->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me/deletion-request')
            ->assertOk()
            ->assertJsonPath('data.id', $request->id)
            ->assertJsonStructure(['data' => ['id', 'requested_at', 'scheduled_for', 'days_remaining']]);
    }

    public function test_show_returns_null_when_no_request(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me/deletion-request')
            ->assertOk()
            ->assertJson(['data' => null]);
    }
}
