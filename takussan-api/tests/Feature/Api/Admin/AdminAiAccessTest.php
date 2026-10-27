<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/** TCK-2385 (AC2) — la console IA est au `super_admin`, et ses écritures sous second facteur récent. */
class AdminAiAccessTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    /** @return list<array{string, string}> */
    private function routes(): array
    {
        return collect(Route::getRoutes())
            ->filter(fn ($route) => str_starts_with($route->uri(), 'api/admin/ai'))
            ->flatMap(fn ($route) => collect($route->methods())->reject(fn ($m) => in_array($m, ['HEAD', 'OPTIONS'], true))
                ->map(fn ($m) => [$m, '/'.preg_replace('/\{[a-zA-Z_]+\}/', 'extraction', $route->uri())]))
            ->values()->all();
    }

    /** @return array<string, array{PlatformProfileLevel}> */
    public static function niveaux(): array
    {
        return ['support' => [PlatformProfileLevel::Support], 'viewer' => [PlatformProfileLevel::Viewer]];
    }

    #[DataProvider('niveaux')]
    public function test_a_lower_operator_is_refused_on_every_route(PlatformProfileLevel $niveau): void
    {
        $this->installerSocleDEssai();
        $this->agirEnOperateur($niveau);

        $routes = $this->routes();
        $this->assertNotEmpty($routes);
        foreach ($routes as [$method, $uri]) {
            $this->assertSame(403, $this->json($method, $uri)->status(), "{$method} {$uri}");
        }
    }

    public function test_a_super_admin_without_a_recent_second_factor_cannot_write(): void
    {
        $this->installerSocleDEssai();
        $user = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($user, 'super_admin');
        $this->actingAs($user);

        foreach ($this->routes() as [$method, $uri]) {
            $response = $this->json($method, $uri);
            if ($method === 'GET') {
                $this->assertNotSame(403, $response->status(), "{$method} {$uri}");

                continue;
            }
            $this->assertSame('two_factor_step_up_required', $response->json('code'), "{$method} {$uri}");
        }
    }
}
