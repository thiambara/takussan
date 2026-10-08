<?php

namespace Tests\Feature\Admin\Platform;

use App\Http\Middleware\EnsurePlatformAbility;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as RouteDefinition;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0047) — AC9 et AC10 : le refus par défaut de `/api/admin`.
 *
 * Les routes ouvertes à `viewer` et `support` sont ÉCRITES ici, en liste — jamais comptées. Le test
 * parcourt `Route::getRoutes()` et fait passer chaque route de `/api/admin` par les middlewares
 * qu'elle déclare réellement : une route ouverte hors de cette liste (un `platform-can:` posé trop
 * large) rougit comme une route fermée qui devait s'ouvrir.
 */
class PlatformRoutesDefaultDenyTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    /** La matrice d'ADR-0047, route par route. */
    private const VIEWER = [
        'admin.me.abilities',
        'admin.agencies.index',
        'admin.agencies.show',
        'admin.agencies.health',
        'admin.agencies.properties',
        'admin.agencies.subscription.show',
        'admin.health',
        'admin.scheduler',
        'admin.system.metrics',
        'admin.reports.growth',
        'admin.reports.revenue',
        'admin.reports.cohorts',
        'admin.reports.funnel',
        'admin.reports.export',
    ];

    private const SUPPORT_EN_PLUS = [
        'admin.agencies.team',
        'admin.users.index',
        'admin.users.show',
        'admin.users.sessions',
        'admin.users.activity',
        'admin.users.force-password-reset',
        'admin.users.unlock',
        'admin.users.reset-2fa',
        'admin.users.revoke-sessions',
        'admin.users.sessions.destroy',
        // Sous-partie 3 — bloquer et réactiver un compte (`platform.users.block`).
        'admin.users.block',
        'admin.users.reactivate',
        'admin.moderation.index',
        // Sous-partie 8 — recherche globale (`platform.search.global`).
        'admin.search',
    ];

    public function test_toute_route_de_la_console_passe_par_la_garde_plateforme(): void
    {
        $sansGarde = collect($this->routesDeLaConsole())
            ->reject(fn (RouteDefinition $route) => in_array('super-admin', $route->gatherMiddleware(), true))
            ->map(fn (RouteDefinition $route) => implode('|', $route->methods()).' '.$route->uri())
            ->values()->all();

        $this->assertSame([], $sansGarde, 'Une route de /api/admin sans `super-admin` est ouverte à tout compte authentifié.');
    }

    public function test_un_viewer_n_entre_que_par_les_routes_de_la_matrice(): void
    {
        $this->assertSameIgnoringOrder(self::VIEWER, $this->routesOuvertesA(PlatformProfileLevel::Viewer));
    }

    public function test_un_support_n_entre_que_par_les_routes_de_la_matrice(): void
    {
        $this->assertSameIgnoringOrder(
            [...self::VIEWER, ...self::SUPPORT_EN_PLUS],
            $this->routesOuvertesA(PlatformProfileLevel::Support),
        );
    }

    public function test_un_super_admin_entre_partout(): void
    {
        $toutes = collect($this->routesDeLaConsole())->map(fn (RouteDefinition $r) => $r->getName())->all();

        $this->assertSameIgnoringOrder($toutes, $this->routesOuvertesA(PlatformProfileLevel::SuperAdmin));
    }

    /** Second chemin : les mêmes refus, par de vraies requêtes HTTP. */
    public function test_par_http_un_viewer_lit_les_metriques_et_rien_des_utilisateurs_ni_du_kyc(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);

        $this->getJson('/api/admin/system/metrics')->assertOk();
        $this->getJson('/api/admin/agencies')->assertOk();
        $this->getJson('/api/admin/users')->assertForbidden()->assertJsonPath('code', 'platform.ability_missing');
        $this->getJson('/api/admin/kyc')->assertForbidden()->assertJsonPath('code', 'auth.super_admin_required');
        $this->getJson('/api/admin/audit')->assertForbidden();
        $this->getJson('/api/admin/jobs/failed')->assertForbidden();
        $this->getJson('/api/admin/moderation')->assertForbidden();
    }

    public function test_par_http_un_support_lit_les_utilisateurs_et_ne_coopte_ni_ne_decide(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->getJson('/api/admin/users')->assertOk();
        $this->getJson('/api/admin/moderation')->assertOk();
        $this->postJson('/api/admin/super-admins/invite', [
            'email' => 'x@example.com', 'first_name' => 'X', 'last_name' => 'Y',
        ])->assertForbidden();
        $this->getJson('/api/admin/kyc')->assertForbidden();
        $this->getJson('/api/admin/settings')->assertForbidden();
    }

    /** AC10 — une route ajoutée sans geste reste au `super_admin`. */
    public function test_une_route_ajoutee_sans_geste_est_refusee_sous_le_super_admin(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'super-admin'])
            ->get('api/admin/__sonde-tck-600', fn () => response()->json(['ok' => true]));

        foreach ([PlatformProfileLevel::Viewer, PlatformProfileLevel::Support] as $level) {
            $this->agirEnOperateur($level);
            $this->getJson('/api/admin/__sonde-tck-600')
                ->assertForbidden()
                ->assertJsonPath('code', 'auth.super_admin_required');
        }

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->getJson('/api/admin/__sonde-tck-600')->assertOk();
    }

    /** @return list<RouteDefinition> */
    private function routesDeLaConsole(): array
    {
        return array_values(array_filter(
            Route::getRoutes()->getRoutes(),
            fn (RouteDefinition $route) => str_starts_with($route->uri(), 'api/admin'),
        ));
    }

    /**
     * Les routes qu'un opérateur de ce niveau franchit, en exécutant `EnsureSuperAdmin` puis chaque
     * `platform-can:` que la route déclare — les vrais middlewares, sur les vraies déclarations.
     *
     * @return list<string>
     */
    private function routesOuvertesA(PlatformProfileLevel $level): array
    {
        $operateur = $this->operateur($level);
        $jeton = $operateur->tokens()->create([
            'name' => 'test', 'token' => hash('sha256', uniqid('', true)), 'abilities' => ['*'],
        ]);
        $jeton->forceFill(['two_factor_verified_at' => now()])->save();

        $ouvertes = [];
        foreach ($this->routesDeLaConsole() as $route) {
            if ($this->franchit($route, $operateur, $jeton)) {
                $ouvertes[] = (string) $route->getName();
            }
        }

        return $ouvertes;
    }

    private function franchit(RouteDefinition $route, User $operateur, PersonalAccessToken $jeton): bool
    {
        $methode = $route->methods()[0];
        $request = Request::create('/'.preg_replace('/\{(\w+)\??\}/', '1', $route->uri()), $methode);
        $liee = (clone $route)->bind($request);
        $request->setRouteResolver(fn () => $liee);
        $user = $operateur->withAccessToken($jeton);
        $request->setUserResolver(fn () => $user);

        $gestes = array_values(array_filter(
            $route->gatherMiddleware(),
            fn ($m) => is_string($m) && str_starts_with($m, EnsureSuperAdmin::ABILITY_MIDDLEWARE),
        ));

        try {
            $reponse = app(EnsureSuperAdmin::class)->handle($request, function (Request $request) use ($gestes) {
                foreach ($gestes as $geste) {
                    app(EnsurePlatformAbility::class)->handle(
                        $request,
                        fn () => response('ok'),
                        substr($geste, strlen(EnsureSuperAdmin::ABILITY_MIDDLEWARE)),
                    );
                }

                return response('ok');
            });
        } catch (HttpExceptionInterface $refus) {
            $this->assertSame(403, $refus->getStatusCode(), $route->uri());

            return false;
        }

        $this->assertSame(200, $reponse->getStatusCode(), $route->uri().' : '.$reponse->getContent());

        return true;
    }

    /** @param list<string> $attendu @param list<string> $obtenu */
    private function assertSameIgnoringOrder(array $attendu, array $obtenu): void
    {
        sort($attendu);
        sort($obtenu);
        $this->assertSame($attendu, $obtenu);
    }
}
