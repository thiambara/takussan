<?php

namespace Tests\Feature\Console;

use App\Models\Agency;
use App\Models\Enums\UserType;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerAgencyCollaboration;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackfillProfilesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_writes_nothing(): void
    {
        $agency = Agency::factory()->create();
        User::factory()->create([
            'type' => UserType::Individual,
            'agency_id' => $agency->id,
        ]);
        User::factory()->create([
            'type' => UserType::Agent,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill', ['--dry-run' => true])
            ->assertSuccessful();

        $this->assertSame(0, OwnerProfile::query()->count());
        $this->assertSame(0, AgentProfile::query()->count());
    }

    public function test_individual_user_with_agency_creates_owner_profile(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create([
            'type' => UserType::Individual,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill')->assertSuccessful();

        $this->assertDatabaseHas('owner_profiles', [
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => 'active',
        ]);
    }

    public function test_agent_user_creates_agent_profile(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create([
            'type' => UserType::Agent,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill')->assertSuccessful();

        $this->assertDatabaseHas('agent_profiles', [
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);
    }

    public function test_broker_user_creates_broker_profile_and_collaboration(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create([
            'type' => UserType::Broker,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill')->assertSuccessful();

        $this->assertDatabaseHas('broker_profiles', ['user_id' => $user->id]);
        $broker = BrokerProfile::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertDatabaseHas('broker_agency_collaborations', [
            'broker_profile_id' => $broker->id,
            'agency_id' => $agency->id,
        ]);
    }

    public function test_service_provider_user_creates_profile_and_collaboration(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create([
            'type' => UserType::ServiceProvider,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill')->assertSuccessful();

        $sp = ServiceProviderProfile::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertDatabaseHas('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
        ]);
    }

    public function test_admin_user_creates_no_profile(): void
    {
        $user = User::factory()->create(['type' => UserType::Admin, 'agency_id' => null]);

        $this->artisan('profiles:backfill')->assertSuccessful();

        $this->assertSame(0, OwnerProfile::query()->count());
        $this->assertSame(0, AgentProfile::query()->count());
        $this->assertSame(0, BrokerProfile::query()->count());
        $this->assertSame(0, ServiceProviderProfile::query()->count());
    }

    public function test_idempotent_no_duplicate_on_repeat(): void
    {
        $agency = Agency::factory()->create();
        User::factory()->count(3)->create([
            'type' => UserType::Individual,
            'agency_id' => $agency->id,
        ]);
        User::factory()->create([
            'type' => UserType::Broker,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill')->assertSuccessful();
        $first = [
            'owners' => OwnerProfile::query()->count(),
            'brokers' => BrokerProfile::query()->count(),
            'collabs' => BrokerAgencyCollaboration::query()->count(),
        ];

        $this->artisan('profiles:backfill')->assertSuccessful();
        $second = [
            'owners' => OwnerProfile::query()->count(),
            'brokers' => BrokerProfile::query()->count(),
            'collabs' => BrokerAgencyCollaboration::query()->count(),
        ];

        $this->assertSame($first, $second);
    }

    public function test_chunk_option_is_accepted(): void
    {
        $agency = Agency::factory()->create();
        User::factory()->count(7)->create([
            'type' => UserType::Individual,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill', ['--chunk' => 2])
            ->assertSuccessful();

        $this->assertSame(7, OwnerProfile::query()->count());
    }

    public function test_count_per_type_matches_users_after_backfill(): void
    {
        $agency = Agency::factory()->create();
        $individuals = 4;
        $agents = 3;
        $providers = 2;

        User::factory()->count($individuals)->create([
            'type' => UserType::Individual,
            'agency_id' => $agency->id,
        ]);
        User::factory()->count($agents)->create([
            'type' => UserType::Agent,
            'agency_id' => $agency->id,
        ]);
        User::factory()->count($providers)->create([
            'type' => UserType::ServiceProvider,
            'agency_id' => $agency->id,
        ]);

        $this->artisan('profiles:backfill')->assertSuccessful();

        $this->assertSame($individuals, OwnerProfile::query()->count());
        $this->assertSame($agents, AgentProfile::query()->count());
        $this->assertSame($providers, ServiceProviderProfile::query()->count());
        $this->assertSame($providers, ServiceProviderAgencyCollaboration::query()->count());
    }
}
