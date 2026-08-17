<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\Currency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-270 — Currency picker added to the super-admin agency onboarding wizard.
 *
 * The provisioning endpoint must accept `agency.currency`, default to XOF when
 * omitted, and reject unknown ISO codes with HTTP 422 (Spatie's `Rule::in`
 * over Currency::cases()).
 */
class AgencyOnboardingCurrencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_currency_defaults_to_xof_when_not_provided(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $response = $this->postJson('/api/admin/agencies', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.agency.currency', 'XOF');

        $agency = Agency::query()->findOrFail($response->json('data.agency.id'));
        $this->assertSame(Currency::XOF, $agency->currency);
    }

    public function test_currency_can_be_set_explicitly(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $response = $this->postJson('/api/admin/agencies', $this->payload([
            'agency' => ['currency' => 'EUR'],
        ]))
            ->assertCreated()
            ->assertJsonPath('data.agency.currency', 'EUR');

        $agency = Agency::query()->findOrFail($response->json('data.agency.id'));
        $this->assertSame(Currency::EUR, $agency->currency);
    }

    public function test_invalid_currency_is_rejected(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', $this->payload([
            'agency' => ['currency' => 'BTC'],
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['agency.currency']);
    }

    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'agency' => [
                'name' => 'Sunu Gestion',
                'slug' => 'sunu-gestion-currency',
                'email' => 'contact@sunu-currency.test',
            ],
            'admin' => [
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
                'email' => 'admin@sunu-currency.test',
                'language' => 'fr',
            ],
        ], $overrides);
    }
}
