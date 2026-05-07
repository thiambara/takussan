<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AlertRule;
use App\Models\Integration;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\BaseTestCase;

/**
 * TCK-144 — Defense-in-depth guard for the entire `/api/admin/*` namespace.
 * Iterates every registered route under the prefix and asserts that an
 * authenticated `agency_admin` is rejected with 403, regardless of the
 * specific endpoint. New routes added under the prefix automatically join
 * the guarded set — no per-route test maintenance.
 */
class NamespaceAccessGuardTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_agency_admin_is_rejected_on_every_admin_route(): void
    {
        $this->actingAsRole('agency_admin');

        $agency = Agency::factory()->create();
        $alertRule = AlertRule::create([
            'event' => 'super_admin_setting_updated',
            'channels_json' => ['email'],
            'recipients_json' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ]);
        $user = User::factory()->create();
        $integration = Integration::factory()->create();

        $routes = collect(Route::getRoutes())
            ->filter(fn ($r) => str_starts_with($r->uri(), 'api/admin'));

        $this->assertGreaterThan(0, $routes->count(), 'No /api/admin/* routes registered.');

        foreach ($routes as $route) {
            foreach ($route->methods() as $method) {
                if (in_array($method, ['HEAD', 'OPTIONS'], true)) {
                    continue;
                }

                $resolved = '/'.strtr($route->uri(), [
                    '{agency}' => (string) $agency->id,
                    '{alertRule}' => (string) $alertRule->id,
                    '{integration}' => (string) $integration->id,
                    '{user}' => (string) $user->id,
                ]);

                $payload = $method === 'POST' ? ['user_id' => $user->id] : [];

                $response = $this->json($method, $resolved, $payload);

                $this->assertSame(
                    403,
                    $response->status(),
                    "Expected 403 from $method $resolved, got {$response->status()}: {$response->getContent()}",
                );
            }
        }
    }
}
