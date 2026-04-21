<?php

namespace Tests;

use App\Models\Agency;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Support\Arr;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

abstract class BaseTestCase extends TestCase
{
    /**
     * Creates a user in a fresh agency, assigns the given role within that
     * agency's team context, and logs the user into the default guard.
     *
     * @param  array<string,mixed>  $attributes  User attrs; pass `agency` to reuse one.
     */
    protected function actingAsRole(string $role, array $attributes = [], ?string $guard = null): User
    {
        $this->ensureRolesSeeded();

        $agency = $attributes['agency'] ?? Agency::factory()->create();
        $user = User::factory()->create(array_merge(
            ['agency_id' => $agency->id],
            Arr::except($attributes, ['agency']),
        ));

        app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);
        $user->assignRole($role);

        $this->actingAs($user, $guard);

        return $user;
    }

    protected function assertJsonStructurePaginated(TestResponse $response): void
    {
        $response->assertJsonStructure([
            'data',
            'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            'links' => ['first', 'last', 'prev', 'next'],
        ]);
    }

    protected function assertJsonError(TestResponse $response, int $status, ?string $message = null): void
    {
        $response->assertStatus($status);
        $response->assertJsonStructure(['message']);

        if ($message !== null) {
            Assert::assertSame($message, $response->json('message'));
        }
    }

    protected function ensureRolesSeeded(): void
    {
        if (Role::query()->count() === 0) {
            $this->seed(RolesAndPermissionsSeeder::class);
        }
    }
}
