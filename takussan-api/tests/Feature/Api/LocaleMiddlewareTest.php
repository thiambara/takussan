<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LocaleMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    public function test_locale_defaults_to_app_locale(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats')
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

        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'en'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_query_parameter_overrides_header(): void
    {
        // User with an unsupported preference so header negotiation kicks in.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats?lang=en', ['Accept-Language' => 'fr'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_unsupported_locale_is_ignored(): void
    {
        // User with an unsupported preference so header negotiation kicks in.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'zh'])
            ->assertOk();

        // Both user preference and header are unsupported → locale stays at
        // Laravel's configured default (see config/app.php).
        $this->assertEquals(config('app.locale'), app()->getLocale());
    }

    public function test_user_preferred_language_is_applied(): void
    {
        $user = User::factory()->create(['preferred_language' => 'en']);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats')
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_user_preferred_language_wins_over_header(): void
    {
        $user = User::factory()->create(['preferred_language' => 'wo']);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'en'])
            ->assertOk();

        $this->assertEquals('wo', app()->getLocale());
    }

    public function test_query_param_overrides_user_preference(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats?lang=en')
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_accept_language_honours_q_factor(): void
    {
        // Unsupported preferred_language so header drives negotiation.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        // Highest q should win — wo (0.9) over en (0.6).
        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'en;q=0.6, wo;q=0.9, fr;q=0.1'])
            ->assertOk();

        $this->assertEquals('wo', app()->getLocale());
    }

    public function test_unsupported_preferred_language_falls_back(): void
    {
        // Even if somehow stored, an unsupported locale should not be applied.
        $user = User::factory()->create(['preferred_language' => 'zz']);
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'en'])
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
        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'en;q=1, wo;q=999, fr;q=1.2.3'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }
}
