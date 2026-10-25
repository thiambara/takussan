<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1922 (P170.05, décision du porteur) — le sous-total d'une facture sans lignes était pris tel
 * quel : `10.5` en XOF émettait 10,5 XOF, et un grand nombre rendait 500 (`numeric field overflow`).
 * Mêmes bornes que les lignes (`decimal:0,2`, `max:1000000000`), puis arrondi à la devise.
 */
class InvoiceSubtotalWithoutLinesTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $agency = Agency::factory()->create(['currency' => 'XOF', 'default_tax_rate' => 0]);
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($this->agent);
    }

    /** @param  array<string, mixed>  $extra */
    private function issue(mixed $subtotal, array $extra = []): TestResponse
    {
        return $this->postJson('/api/invoices', array_merge([
            'customer_id' => $this->customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => $subtotal,
            'tax_rate' => 0,
        ], $extra));
    }

    public function test_un_sous_total_xof_a_decimales_est_arrondi_a_la_devise(): void
    {
        $this->issue(10.5)
            ->assertCreated()
            ->assertJsonPath('data.subtotal', 11)
            ->assertJsonPath('data.total_amount', 11);
    }

    public function test_un_sous_total_eur_garde_ses_centimes(): void
    {
        $this->issue(1250.5, ['currency' => 'EUR'])
            ->assertCreated()
            ->assertJsonPath('data.subtotal', 1250.5);
    }

    public function test_un_sous_total_au_dela_de_la_borne_est_refuse(): void
    {
        $this->issue(999_999_999_999_999)->assertUnprocessable()->assertJsonValidationErrors('subtotal');
        $this->issue(1_000_000_001)->assertUnprocessable()->assertJsonValidationErrors('subtotal');
        $this->issue(1_000_000_000)->assertCreated();

        $this->assertDatabaseCount('invoices', 1);
    }

    public function test_un_sous_total_a_plus_de_deux_decimales_est_refuse(): void
    {
        $this->issue(10.555)->assertUnprocessable()->assertJsonValidationErrors('subtotal');
    }
}
