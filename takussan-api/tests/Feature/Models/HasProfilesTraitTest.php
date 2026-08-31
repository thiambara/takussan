<?php

namespace Tests\Feature\Models;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HasProfilesTraitTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_profiles_relation_returns_only_users_profiles(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyA->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyB->id]);
        OwnerProfile::factory()->create(['user_id' => $other->id, 'agency_id' => $agencyA->id]);

        $this->assertCount(2, $user->ownerProfiles);
        $this->assertEquals(1, $other->ownerProfiles()->count());
    }

    public function test_broker_profile_is_has_one(): void
    {
        $user = User::factory()->create();
        BrokerProfile::factory()->create(['user_id' => $user->id]);

        $this->assertInstanceOf(BrokerProfile::class, $user->brokerProfile);
    }

    public function test_has_profile_with_agency_filters_correctly(): void
    {
        $user = User::factory()->create();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyA->id]);

        $this->assertTrue($user->hasProfile(AgentProfile::class));
        $this->assertTrue($user->hasProfile(AgentProfile::class, $agencyA->id));
        $this->assertFalse($user->hasProfile(AgentProfile::class, $agencyB->id));
        $this->assertFalse($user->hasProfile(OwnerProfile::class));
    }

    public function test_is_agent_at_returns_true_only_for_agency_with_active_profile(): void
    {
        $user = User::factory()->create();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyA->id]);

        $this->assertTrue($user->isAgentAt($agencyA->id));
        $this->assertFalse($user->isAgentAt($agencyB->id));
    }

    public function test_is_agent_at_ignores_soft_deleted_profile(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);

        $this->assertTrue($user->isAgentAt($agency->id));
        $profile->delete();
        $this->assertFalse($user->fresh()->isAgentAt($agency->id));
    }

    public function test_is_owner_at_works_per_agency(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);

        $this->assertTrue($user->isOwnerAt($a->id));
        $this->assertFalse($user->isOwnerAt($b->id));
    }

    public function test_profiles_returns_unified_collection_with_mixed_classes(): void
    {
        $user = User::factory()->create();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyA->id]);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyB->id]);
        BrokerProfile::factory()->create(['user_id' => $user->id]);
        ServiceProviderProfile::factory()->create(['user_id' => $user->id]);

        $profiles = $user->profiles();

        // TCK-495 — `profiles()` rend les profils COMMUTABLES, et le courtier
        // n'en est plus un. Sa ligne existe pourtant : elle vient d'être créée
        // deux lignes plus haut, et `brokerProfile()` la rend toujours. Ce test
        // sépare donc « la donnée est là » de « le profil est proposé au choix ».
        $this->assertCount(3, $profiles);
        $classes = $profiles->map(fn ($p) => $p::class)->unique()->sort()->values()->all();
        $this->assertEquals([
            AgentProfile::class,
            OwnerProfile::class,
            ServiceProviderProfile::class,
        ], $classes);
        $this->assertNotNull($user->brokerProfile()->first());
    }

    public function test_is_professional_true_when_any_pro_profile_exists(): void
    {
        $owner = User::factory()->create();
        OwnerProfile::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        $this->assertFalse($owner->isProfessional());

        $agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        $this->assertTrue($agent->isProfessional());

        $broker = User::factory()->create();
        BrokerProfile::factory()->create(['user_id' => $broker->id]);
        $this->assertTrue($broker->isProfessional());
    }
}
