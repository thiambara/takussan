<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-144 — Agency moderation lifecycle (verify / suspend / unverify) and
 * activity-log emission.
 */
class AgencyModerationTest extends TestCase
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

    public function test_index_exposes_summary_counts_and_last_activity(): void
    {
        Carbon::setTestNow('2026-02-01 00:00:00');
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create([
            'name' => 'Synthese Immo',
            'created_at' => '2026-01-15 10:00:00',
            'updated_at' => '2026-02-01 10:00:00',
        ]);

        User::factory()->withAgentProfile($agency)->create();
        User::factory()->withOwnerProfile($agency)->create();
        Property::factory()->count(2)->create([
            'agency_id' => $agency->id,
            'updated_at' => '2026-03-05 12:00:00',
        ]);

        $this->getJson('/api/admin/agencies?filter[search]=Synthese&fields[agencies]=id,name,slug,status,created_at,properties_count,members_count,last_activity_at,logo_url')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Synthese Immo')
            ->assertJsonPath('data.0.properties_count', 2)
            ->assertJsonPath('data.0.members_count', 2)
            ->assertJsonPath('data.0.logo_url', null)
            ->assertJsonPath('data.0.created_at', '2026-01-15T10:00:00+00:00')
            ->assertJsonPath('data.0.last_activity_at', '2026-03-05T12:00:00+00:00');

        Carbon::setTestNow();
    }

    public function test_index_filters_by_created_range_and_sorts_by_volume(): void
    {
        Carbon::setTestNow('2026-06-01');
        $this->actingAsRole('super_admin');

        $low = Agency::factory()->create([
            'name' => 'Volume Low',
            'created_at' => '2026-05-10 00:00:00',
        ]);
        $high = Agency::factory()->create([
            'name' => 'Volume High',
            'created_at' => '2026-05-11 00:00:00',
        ]);
        Agency::factory()->create([
            'name' => 'Volume Old',
            'created_at' => '2026-03-01 00:00:00',
        ]);
        Property::factory()->count(1)->create(['agency_id' => $low->id]);
        Property::factory()->count(3)->create(['agency_id' => $high->id]);

        $response = $this->getJson('/api/admin/agencies?filter[search]=Volume&filter[created_from]=2026-05-01&filter[created_to]=2026-05-31&sort=-properties_count')
            ->assertOk();

        $this->assertSame(['Volume High', 'Volume Low'], collect($response->json('data'))->pluck('name')->all());

        Carbon::setTestNow();
    }

    public function test_index_is_forbidden_to_non_super_admin(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->getJson('/api/admin/agencies')->assertForbidden();
    }

    public function test_verify_flips_status_active_and_sets_verified_at(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create([
            'status' => AgencyStatus::Inactive,
            'is_verified' => false,
            'verified_at' => null,
        ]);
        KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Verified,
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
