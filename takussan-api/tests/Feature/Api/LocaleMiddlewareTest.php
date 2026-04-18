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
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'fr'])
            ->assertOk();

        $this->assertEquals('fr', app()->getLocale());
    }

    public function test_query_parameter_overrides_header(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats?lang=en', ['Accept-Language' => 'fr'])
            ->assertOk();

        $this->assertEquals('en', app()->getLocale());
    }

    public function test_unsupported_locale_is_ignored(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats', ['Accept-Language' => 'zh'])
            ->assertOk();

        // Falls back to app default locale (fr)
        $this->assertEquals('fr', app()->getLocale());
    }
}
