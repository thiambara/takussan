<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-1754 (P122.03) — `crm:normalize-customer-phones` écrit `phone` par une mise à jour de
 * requête, sans événement de modèle : l'index des clients gardait l'ancienne saisie, et la
 * recherche du numéro sous sa forme normalisée ne retrouvait plus le client. La commande
 * réindexe les clients qu'elle modifie, par lot.
 */
class NormalisationDesTelephonesReindexeTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_apres_la_commande_le_client_se_trouve_par_son_numero_normalise(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $client = Customer::factory()->create(['agency_id' => $agency->id, 'phone' => '+221770000009']);
        DB::table('customers')->where('id', $client->id)->update(['phone' => '77 123 45 67']);
        $this->indexSearchable(Customer::class);

        $this->artisan('crm:normalize-customer-phones')->assertSuccessful();
        $this->waitForMeilisearch();

        $this->assertSame('+221771234567', DB::table('customers')->where('id', $client->id)->value('phone'));
        $this->getJson('/api/customers?filter[search]='.urlencode('+221771234567'))
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $client->id);
    }

    public function test_en_essai_a_blanc_rien_n_est_reindexe(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $client = Customer::factory()->create(['agency_id' => $agency->id, 'phone' => '+221770000009']);
        DB::table('customers')->where('id', $client->id)->update(['phone' => '77 123 45 67']);
        $this->indexSearchable(Customer::class);

        $this->artisan('crm:normalize-customer-phones', ['--dry-run' => true])->assertSuccessful();
        $this->waitForMeilisearch();

        $this->getJson('/api/customers?filter[search]='.urlencode('+221771234567'))
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
