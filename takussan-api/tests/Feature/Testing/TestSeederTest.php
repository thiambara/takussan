<?php

namespace Tests\Feature\Testing;

use Database\Seeders\TestSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\BaseTestCase;

class TestSeederTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_test_seeder_creates_agency_and_one_user_per_profile_role(): void
    {
        $seeder = new TestSeeder;
        $seeder->run();

        $roles = ['super_admin', 'agency_admin', 'agent', 'owner', 'broker', 'service_provider'];

        $this->assertCount(count($roles), $seeder->users);

        foreach ($roles as $role) {
            $this->assertArrayHasKey($role, $seeder->users);

            $user = $seeder->users[$role];
            $agencyId = $seeder->agency->id;

            match ($role) {
                'super_admin' => $this->assertTrue($user->isSuperAdmin()),
                'agency_admin' => $this->assertTrue($user->isAgencyAdminAt($agencyId)),
                'agent' => $this->assertTrue($user->isAgentAt($agencyId)),
                'owner' => $this->assertTrue($user->isOwnerAt($agencyId)),
                'broker' => $this->assertNotNull($user->brokerProfile),
                'service_provider' => $this->assertNotNull($user->serviceProviderProfile),
            };
        }
    }
}
