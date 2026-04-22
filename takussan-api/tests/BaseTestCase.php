<?php

namespace Tests;

use App\Models\Agency;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Assert;
use Spatie\Permission\PermissionRegistrar;

abstract class BaseTestCase extends TestCase
{
    /**
     * Creates a user in a fresh agency, assigns the given role within that
     * agency's team context, and logs the user into the default guard.
     *
     * Agency resolution (first match wins):
     *   1. `agency`    — Agency model passed in $attributes
     *   2. `agency_id` — raw id passed in $attributes
     *   3. fresh Agency via factory
     *
     * `super_admin` is assigned with a null team context so `hasRole()` keeps
     * resolving to true after subsequent `setPermissionsTeamId()` calls in the
     * same test (cross-tenant role — no agency binding).
     *
     * @param  array<string,mixed>  $attributes  User attrs; pass `agency` or `agency_id` to reuse one.
     */
    protected function actingAsRole(string $role, array $attributes = [], ?string $guard = null): User
    {
        $this->ensureRolesSeeded();

        $agency = $attributes['agency'] ?? null;
        unset($attributes['agency']);

        if ($agency !== null) {
            $attributes['agency_id'] = $agency->id;
        } elseif (! isset($attributes['agency_id'])) {
            $attributes['agency_id'] = Agency::factory()->create()->id;
        }

        $user = User::factory()->create($attributes);

        $registrar = app(PermissionRegistrar::class);
        $registrar->setPermissionsTeamId($role === 'super_admin' ? null : $user->agency_id);
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
        $this->seed(RolesAndPermissionsSeeder::class);
    }
}
