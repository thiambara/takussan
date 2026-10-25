<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-600 — AC16 : `currency.supported` a un lecteur. Une devise retirée par la console n'est plus
 * acceptée pour une agence à la modification. La création par `POST /api/agencies` est retirée
 * (TCK-2311, P225.06), et son cas avec elle.
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
}
