<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ReviewModerationQueueTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $agency = Agency::factory()->create();
        $registrar = app(PermissionRegistrar::class);
        $registrar->forgetCachedPermissions();
        $registrar->setPermissionsTeamId($agency->id);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        Role::findOrCreate('super_admin', 'web');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $admin->assignRole('super_admin');
        $registrar->forgetCachedPermissions();

        return $admin;
    }

    private function superAdmin(): User
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        Role::findOrCreate('super_admin');
        $user = User::factory()->create();
        $user->assignRole('super_admin');

        return $user;
    }

    public function test_admin_can_list_reviews_for_moderation(): void
    {
        // Create reviews first — Review factories spawn new Agency contexts
        // which shift the spatie permission team registrar. We then create
        // the admin so its role assignment sticks under the correct team.
        Review::factory()->count(3)->create(['status' => ReviewStatus::Pending]);
        Review::factory()->count(2)->create(['status' => ReviewStatus::Approved]);

        $admin = $this->admin();
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/reviews')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['total', 'pending_count']]);

        $this->assertSame(5, $response->json('meta.total'));
    }

    public function test_non_admin_cannot_list_reviews(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/reviews')->assertForbidden();
    }

    public function test_filter_by_moderation_status(): void
    {
        Review::factory()->create(['status' => ReviewStatus::Pending]);
        Review::factory()->create(['status' => ReviewStatus::Approved]);
        Review::factory()->create(['status' => ReviewStatus::Reported]);

        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/reviews?filter[moderation_status]=flagged')
            ->assertOk();
        $this->assertSame(1, $response->json('meta.total'));

        $response = $this->getJson('/api/reviews?filter[moderation_status]=pending')
            ->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_meta_pending_count_reflects_queue(): void
    {
        Review::factory()->create(['status' => ReviewStatus::Pending]);
        Review::factory()->create(['status' => ReviewStatus::Reported]);
        Review::factory()->create(['status' => ReviewStatus::Approved]);

        Sanctum::actingAs($this->admin());
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $response = $this->getJson('/api/reviews')->assertOk();
        $this->assertSame(2, $response->json('meta.pending_count'));
    }

    public function test_moderate_approve_transitions_to_approved(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'approve',
        ])->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Approved->value)
            ->assertJsonPath('data.is_approved', true);
    }

    public function test_moderate_hide_requires_reason(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending]);

        Sanctum::actingAs($this->admin());

        // Missing reason
        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'hide',
        ])->assertStatus(422);

        // With reason
        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'hide',
            'reason' => 'Contenu offensant',
        ])->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Rejected->value);
    }

    public function test_moderate_delete_soft_deletes_review(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Reported]);

        Sanctum::actingAs($this->admin());

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'delete',
            'reason' => 'spam',
        ])->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertSoftDeleted('reviews', ['id' => $review->id]);
    }

    public function test_reports_endpoint_returns_report_list(): void
    {
        $reporter = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);
        $review = Review::factory()->create([
            'status' => ReviewStatus::Reported,
            'reported_count' => 1,
            'metadata' => [
                'reports' => [
                    [
                        'user_id' => $reporter->id,
                        'reason' => 'spam',
                        'reported_at' => now()->toISOString(),
                    ],
                ],
            ],
        ]);

        Sanctum::actingAs($this->admin());

        $this->getJson("/api/reviews/{$review->id}/reports")
            ->assertOk()
            ->assertJsonPath('data.0.reason', 'spam')
            ->assertJsonPath('data.0.user.id', $reporter->id)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_non_admin_cannot_moderate(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending]);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'approve',
        ])->assertForbidden();
    }
}
