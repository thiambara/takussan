<?php

namespace Tests\Feature\Authorization;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Spatie\Permission\PermissionRegistrar;
use Tests\ApiTestCase;

/**
 * Regression: `super_admin` is a cross-tenant role assigned with a null
 * `agency_id` pivot. When a request goes through the real api middleware
 * stack, `SetPermissionsTeamIdMiddleware` must leave the team context at
 * null for super_admin users so `hasRole()` keeps resolving — otherwise the
 * Gate::before bypass silently returns false and the super_admin loses
 * every privilege on every request.
 */
class SuperAdminTeamContextTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_super_admin_bypass_survives_api_middleware(): void
    {
        Route::middleware('api')->get('/api/_test/super-admin-probe', function () {
            $user = auth('sanctum')->user();

            return response()->json([
                'has_super' => $user?->hasRole('super_admin'),
                'has_any_admin' => $user?->hasRole(['admin', 'super_admin']),
                'team_id' => app(PermissionRegistrar::class)->getPermissionsTeamId(),
            ]);
        });

        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/_test/super-admin-probe')
            ->assertOk()
            ->assertExactJson([
                'has_super' => true,
                'has_any_admin' => true,
                'team_id' => null,
            ]);
    }

    public function test_non_super_admin_user_keeps_agency_team_context(): void
    {
        Route::middleware('api')->get('/api/_test/agent-probe', function () {
            $user = auth('sanctum')->user();

            return response()->json([
                'has_agent' => $user?->hasRole('agent'),
                'has_super' => $user?->hasRole('super_admin'),
                'team_id' => app(PermissionRegistrar::class)->getPermissionsTeamId(),
            ]);
        });

        $user = $this->apiActingAsRole('agent');

        $this->apiGet('/api/_test/agent-probe')
            ->assertOk()
            ->assertExactJson([
                'has_agent' => true,
                'has_super' => false,
                'team_id' => $user->agency_id,
            ]);
    }
}
