<?php

namespace Tests\Feature\Reviews;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\ApiTestCase;

/**
 * TCK-2672 (AC4) — un avis sur un bien rend le bien reconnaissable : sa photo principale et son
 * agent principal (le collaborateur qui répond pour lui).
 */
class ReviewTargetSubjectTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
        Review::factory()->create([
            'reviewable_type' => Property::class, 'reviewable_id' => $this->property->id,
            'status' => ReviewStatus::Pending, 'is_approved' => false, 'rating' => 5, 'reported_count' => 0,
        ]);
        $this->actingAsApi($admin);
    }

    /** @return array<string, mixed> */
    private function target(): array
    {
        return $this->getJson('/api/reviews')->assertOk()->json('data.0.target');
    }

    public function test_ac4_photo_principale_et_agent_principal(): void
    {
        $this->property->addMedia(UploadedFile::fake()->image('facade.jpg'))->toMediaCollection('photos');
        $agent = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->materializeRoleProfile($agent, 'agent', $this->agency);
        PropertyCollaborator::query()->create([
            'property_id' => $this->property->id, 'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent, 'invited_at' => now()->subMonth(),
        ]);

        $target = $this->target();

        $this->assertSame('property', $target['type']);
        $this->assertNotNull($target['photo_url']);
        $this->assertSame(['id' => $agent->id, 'name' => 'Awa Ndiaye'], $target['agent']);
    }

    public function test_sans_photo_ni_agent_les_cles_sont_nulles(): void
    {
        $target = $this->target();

        $this->assertArrayHasKey('photo_url', $target);
        $this->assertNull($target['photo_url']);
        $this->assertArrayHasKey('agent', $target);
        $this->assertNull($target['agent']);
    }

    public function test_un_agent_qui_n_est_plus_du_personnel_n_est_pas_l_agent_du_bien(): void
    {
        $ancien = User::factory()->create();
        PropertyCollaborator::query()->create([
            'property_id' => $this->property->id, 'user_id' => $ancien->id,
            'role' => CollaboratorRole::Agent, 'invited_at' => now()->subMonth(),
        ]);

        $this->assertNull($this->target()['agent']);
    }
}
