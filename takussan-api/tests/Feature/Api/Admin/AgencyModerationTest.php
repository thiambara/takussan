<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-144 — Agency moderation lifecycle (verify / suspend / unverify) and
 * activity-log emission.
 */
class AgencyModerationTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_index_returns_paginated_list_for_super_admin(): void
    {
        $this->actingAsRole('super_admin');
        Agency::factory()->count(3)->create();

        $this->getJson('/api/admin/agencies')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'name', 'status', 'is_verified']],
                'meta' => ['total', 'current_page'],
            ])
            ->assertJsonPath('meta.total', fn ($v) => $v >= 3);
    }

    public function test_verify_flips_status_active_and_sets_verified_at(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create([
            'status' => AgencyStatus::Inactive,
            'is_verified' => false,
            'verified_at' => null,
        ]);

        $this->postJson("/api/admin/agencies/{$agency->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.is_verified', true);

        $agency->refresh();
        $this->assertSame(AgencyStatus::Active, $agency->status);
        $this->assertTrue($agency->is_verified);
        $this->assertNotNull($agency->verified_at);

        $this->assertTrue(
            Activity::query()->where('event', 'super_admin_agency_verified')
                ->where('subject_id', $agency->id)
                ->exists(),
        );
    }

    public function test_suspend_sets_status_suspended_without_touching_verification(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create([
            'status' => AgencyStatus::Active,
            'is_verified' => true,
            'verified_at' => now(),
        ]);

        $this->postJson("/api/admin/agencies/{$agency->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended')
            ->assertJsonPath('data.is_verified', true);

        $agency->refresh();
        $this->assertSame(AgencyStatus::Suspended, $agency->status);
        $this->assertTrue($agency->is_verified);

        $this->assertTrue(
            Activity::query()->where('event', 'super_admin_agency_suspended')
                ->where('subject_id', $agency->id)
                ->exists(),
        );
    }

    public function test_unverify_clears_verified_at_and_sets_inactive(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create([
            'status' => AgencyStatus::Active,
            'is_verified' => true,
            'verified_at' => now()->subDay(),
        ]);

        $this->postJson("/api/admin/agencies/{$agency->id}/unverify")
            ->assertOk()
            ->assertJsonPath('data.status', 'inactive')
            ->assertJsonPath('data.is_verified', false)
            ->assertJsonPath('data.verified_at', null);

        $agency->refresh();
        $this->assertSame(AgencyStatus::Inactive, $agency->status);
        $this->assertFalse($agency->is_verified);
        $this->assertNull($agency->verified_at);

        $this->assertTrue(
            Activity::query()->where('event', 'super_admin_agency_unverified')
                ->where('subject_id', $agency->id)
                ->exists(),
        );
    }
}
