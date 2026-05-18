<?php

namespace Tests\Feature\Testing;

use Database\Seeders\TestSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\BaseTestCase;

class TestSeederTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_test_seeder_creates_agency_and_one_user_per_role(): void
    {
        $seeder = new TestSeeder;
        $seeder->run();

        $roleNames = Role::query()->pluck('name')->all();
        $this->assertNotEmpty($roleNames);
        $this->assertCount(count($roleNames), $seeder->users);

        app(PermissionRegistrar::class)->setPermissionsTeamId($seeder->agency->id);

        foreach ($roleNames as $role) {
            $this->assertArrayHasKey($role, $seeder->users);
            $this->assertSame($seeder->agency->id, $seeder->users[$role]->agency_id);
            $this->assertTrue($seeder->users[$role]->hasRole($role));
        }
    }
}
