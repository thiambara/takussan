<?php

namespace Tests\Feature\Auth\Session;

use App\Models\Enums\SettingScope;
use App\Models\Profiles\PlatformProfile;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-589 AC10 — sessions bornées (contrainte 11) : durée absolue pour tout jeton, le
 * jeton hérité sans `expires_at` compris ; expiration par inactivité ; session
 * super-admin bornée par `platform.session_max_minutes`, lu à l'émission.
 *
 * Rouge sur `5f872f1f` : `sanctum.expiration` était `null`, aucun `createToken()` de
 * connexion ne posait `expires_at`, et `platform.session_max_minutes` n'était lu par
 * personne. Ablations rejouées : `sanctum.expiration` remis à `null` → le jeton hérité
 * de 31 jours passe ; clause d'inactivité d'`AccessTokenGate` retirée → les deux cas
 * d'inactivité passent.
 */
class TokenLifetimeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    private function seConnecter(string $email): string
    {
        $response = $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'password123'])->assertOk();

        return $response->json('token');
    }

    private function me(string $token): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token)->getJson('/api/auth/me');
    }

    public function test_un_jeton_de_plus_de_trente_jours_rend_401(): void
    {
        User::factory()->create(['email' => 'client@example.com', 'password' => 'password123']);
        $token = $this->seConnecter('client@example.com');

        // Utilisé chaque semaine : l'inactivité ne joue pas, seule la durée absolue.
        foreach (range(1, 4) as $semaine) {
            $this->travel(6)->days();
            $this->me($token)->assertOk();
        }
        $this->travel(5)->days();
        $this->me($token)->assertOk();   // 29 jours

        $this->travel(2)->days();
        $this->me($token)->assertUnauthorized();   // 31 jours
    }

    public function test_un_jeton_inutilise_depuis_plus_de_sept_jours_rend_401(): void
    {
        User::factory()->create(['email' => 'client@example.com', 'password' => 'password123']);
        $token = $this->seConnecter('client@example.com');
        $this->me($token)->assertOk();

        $this->travel(6)->days();
        $this->me($token)->assertOk();

        $this->travel(7)->days();
        $this->travel(1)->minutes();
        $this->me($token)->assertUnauthorized();
    }

    public function test_un_jeton_super_admin_rend_401_apres_session_max_minutes(): void
    {
        Setting::query()->create([
            'key' => 'platform.session_max_minutes',
            'value' => 2,
            'scope' => SettingScope::Global,
            'scope_id' => null,
        ]);
        Cache::forget('platform_settings.editable');
        $admin = User::factory()->create(['email' => 'admin@example.com', 'password' => 'password123']);
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $admin->id]);

        $token = $this->seConnecter('admin@example.com');
        $this->me($token)->assertOk();

        $this->travel(1)->minutes();
        $this->me($token)->assertOk();
        $this->travel(61)->seconds();
        $this->me($token)->assertUnauthorized();
    }

    public function test_un_jeton_super_admin_rend_401_apres_trente_minutes_d_inactivite(): void
    {
        $admin = User::factory()->create(['email' => 'admin@example.com', 'password' => 'password123']);
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $admin->id]);

        $token = $this->seConnecter('admin@example.com');
        $this->me($token)->assertOk();

        $this->travel(29)->minutes();
        $this->me($token)->assertOk();

        $this->travel(31)->minutes();
        $this->me($token)->assertUnauthorized();
    }

    public function test_un_jeton_herite_sans_expires_at_cree_il_y_a_31_jours_rend_401(): void
    {
        $user = User::factory()->create();
        $this->travel(-31)->days();
        $token = $user->createToken('herite')->plainTextToken;
        $this->travelBack();
        // Utilisé hier : seule la durée absolue peut le refuser.
        $user->tokens()->update(['last_used_at' => now()->subDay()]);

        $this->assertNull($user->tokens()->first()->expires_at);
        $this->me($token)->assertUnauthorized();
    }

    public function test_un_jeton_herite_recent_reste_valide(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('herite')->plainTextToken;

        $this->me($token)->assertOk();
    }
}
