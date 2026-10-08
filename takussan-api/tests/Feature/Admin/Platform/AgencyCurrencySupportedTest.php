<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-600 — AC16 : `currency.supported` a un lecteur. Une devise retirée par la console n'est plus
 * acceptée pour une agence, à la création comme à la modification.
 */
class AgencyCurrencySupportedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsRole('super_admin');
        $this->patchJson('/api/admin/settings', ['currency.supported' => ['XOF']])->assertOk();
        $this->app['auth']->forgetGuards();
    }

    public function test_une_devise_retiree_est_refusee_a_la_modification(): void
    {
        $admin = User::factory()->create();
        $agence = Agency::factory()->create(['primary_admin_id' => $admin->id, 'currency' => 'XOF']);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agence->id}", ['currency' => 'USD'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('currency');
        $this->assertSame('XOF', $agence->fresh()->currency->value);

        $this->patchJson("/api/agencies/{$agence->id}", ['currency' => 'XOF'])->assertOk();
    }

    public function test_une_devise_retiree_est_refusee_a_la_creation(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $avant = Agency::query()->count();

        $this->postJson('/api/agencies', ['name' => 'Agence Dakar', 'currency' => 'USD'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('currency');
        $this->assertSame($avant, Agency::query()->count());

        $this->postJson('/api/agencies', ['name' => 'Agence Dakar', 'currency' => 'XOF'])->assertCreated();
    }
}
