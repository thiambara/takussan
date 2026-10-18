<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * La route n'est qu'un véhicule : n'importe quelle route authentifiée traverse `SetLocaleMiddleware`.
 * C'était `/api/dashboard/stats` jusqu'à son retrait (TCK-952) ; `/api/auth/me` est celle que le
 * front lit à chaque rendu.
 */
class LocaleMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // La locale par défaut ne doit pas venir du `.env` de la machine : avec `APP_LOCALE=en`, les
        // cas qui attendent `en` restaient verts middleware neutralisé (vérification de TCK-952).
        config(['app.locale' => 'fr']);
    }

    public function test_locale_defaults_to_app_locale(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me')
            ->assertOk();

        // The default locale should be the app default
        $this->assertEquals(config('app.locale'), app()->getLocale());
    }

    public function test_accept_language_header_sets_locale(): void
    {
        // No user preference → header drives the locale.
        // User with an unsupported preference so header negotiation kicks in.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me', ['Accept-Language' => 'en'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_query_parameter_overrides_header(): void
    {
        // User with an unsupported preference so header negotiation kicks in.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me?lang=en', ['Accept-Language' => 'fr'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_unsupported_locale_is_ignored(): void
    {
        // User with an unsupported preference so header negotiation kicks in.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me', ['Accept-Language' => 'zh'])
            ->assertOk();

        // Both user preference and header are unsupported → locale stays at
        // Laravel's configured default (see config/app.php).
        $this->assertEquals(config('app.locale'), app()->getLocale());
    }

    public function test_user_preferred_language_is_applied(): void
    {
        // `de` neutralise l'`en-us` que le harnais injecte toujours : avec une préférence `en`,
        // ce test était vert par coïncidence, préférence lue ou non.
        $user = User::factory()->create(['preferred_language' => 'wo']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me', ['Accept-Language' => 'de'])
            ->assertOk();

        $this->assertEquals('wo', app()->getLocale());
    }

    public function test_header_wins_over_user_preferred_language(): void
    {
        // TCK-536 — l'ordre s'est inversé : le front transmet en en-tête la langue qu'il affiche.
        $user = User::factory()->create(['preferred_language' => 'wo']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me', ['Accept-Language' => 'en'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_query_param_overrides_user_preference(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me?lang=en')
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_accept_language_honours_q_factor(): void
    {
        // Unsupported preferred_language so header drives negotiation.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        // Highest q should win — wo (0.9) over en (0.6).
        $this->getJson('/api/auth/me', ['Accept-Language' => 'en;q=0.6, wo;q=0.9, fr;q=0.1'])
            ->assertOk();

        $this->assertEquals('wo', app()->getLocale());
    }

    public function test_unsupported_preferred_language_falls_back(): void
    {
        // Even if somehow stored, an unsupported locale should not be applied.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me', ['Accept-Language' => 'en'])
            ->assertOk();

        // Falls through to header negotiation.
        $this->assertEquals('en', app()->getLocale());
    }

    public function test_malformed_q_factor_is_clamped(): void
    {
        // Unsupported preferred_language so header drives negotiation.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        // `q=999` must not out-rank a legitimate `q=1` (clamped to 1.0 per RFC 7231).
        // `q=1.2.3` parses as 1.2 via (float) cast — must also clamp to 1.0.
        // Both candidates end up at q=1.0; first-seen (en) wins via stable arsort.
        $this->getJson('/api/auth/me', ['Accept-Language' => 'en;q=1, wo;q=999, fr;q=1.2.3'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }
}
