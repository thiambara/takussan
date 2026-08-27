<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\AlertRule;
use App\Models\Announcement;
use App\Models\Integration;
use App\Models\Invitation;
use App\Models\KycDossier;
use App\Models\Plan;
use App\Models\PlatformPayout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * TCK-144 — Defense-in-depth guard for the entire `/api/admin/*` namespace.
 * Iterates every registered route under the prefix and asserts that an
 * authenticated `agency_admin` is rejected with 403, regardless of the
 * specific endpoint. New routes added under the prefix automatically join
 * the guarded set — no per-route test maintenance.
 */
class NamespaceAccessGuardTest extends TestCase
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
        $dossier = KycDossier::create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => 'pending',
        ]);
        $plan = Plan::create([
            'code' => 'test',
            'label' => 'Test Plan',
            'monthly_price_xof' => 0,
            'limits' => [],
            'is_active' => true,
        ]);
        $announcement = Announcement::create([
            'title' => ['fr' => 'Test'],
            'body' => ['fr' => 'Test'],
            'severity' => 'info',
            'starts_at' => now(),
            'ends_at' => now()->addDay(),
        ]);
        $payout = PlatformPayout::create([
            'agency_id' => $agency->id,
            'period_start' => now(),
            'period_end' => now(),
            'gross_amount' => 0,
            'platform_fee_amount' => 0,
            'net_amount' => 0,
            'currency' => 'XOF',
            'status' => 'pending',
        ]);
        // TCK-268 — `SubstituteBindings` resolves {upgradeRequest} *before*
        // EnsureSuperAdmin runs, so without a real row the test would 404
        // long before the namespace guard gets a chance to 403.
        $upgradeRequest = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
        ]);
        // TCK-367 — même motif que la ligne ci-dessus, sur les routes de cycle de vie de la
        // cooptation (`super-admins/invitations/{invitation}/resend|revoke`). Sans cette ligne,
        // le repli « {param} non résolu -> 1 » tombait sur une invitation inexistante et le test
        // lisait 404 là où il vérifie 403. Ce n'est PAS une fuite : pour un identifiant qui
        // n'existe pas, tout le monde reçoit 404 — c'est la garde qui n'était pas atteinte.
        $invitation = Invitation::factory()->create([
            'invitable_type' => User::class,
            'invitable_id' => $user->id,
        ]);

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
                    '{dossier}' => (string) $dossier->id,
                    '{plan}' => (string) $plan->id,
                    '{announcement}' => (string) $announcement->id,
                    '{payout}' => (string) $payout->id,
                    '{upgradeRequest}' => (string) $upgradeRequest->id,
                    '{invitation}' => (string) $invitation->id,
                ]);

                // Replace any remaining unresolved {param} with a dummy id so
                // route-model binding doesn't fail with a 404 before the guard runs.
                $resolved = preg_replace('/\{[a-zA-Z_]+\}/', '1', $resolved);

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
