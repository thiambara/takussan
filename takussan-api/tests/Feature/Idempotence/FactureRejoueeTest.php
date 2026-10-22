<?php

namespace Tests\Feature\Idempotence;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1402 (P144.05, ADR-0072 lot 2) — le scénario mesuré : un agent crée une facture, la réponse
 * se perd, il la renvoie. Il y avait deux brouillons de numéros distincts ; sous la même clé, un seul.
 */
class FactureRejoueeTest extends TestCase
{
    use RefreshDatabase;

    public function test_une_facture_rejouee_sous_la_meme_cle_n_est_creee_qu_une_fois(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($agent);
        $corps = ['customer_id' => $customer->id, 'issue_date' => now()->toDateString(), 'subtotal' => 100000];
        $cle = ['Idempotency-Key' => 'f4c7e2a9-1b3d-4e5f-8a6b-facture00001'];

        $premiere = $this->postJson('/api/invoices', $corps, $cle)->assertCreated();
        $this->travel(30)->seconds();
        $this->postJson('/api/invoices', $corps, $cle)
            ->assertCreated()
            ->assertJsonPath('data.id', $premiere->json('data.id'));

        $this->assertSame(1, Invoice::query()->count());
    }
}
