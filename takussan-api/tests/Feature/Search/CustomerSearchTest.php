<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class CustomerSearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_customer_search_is_typo_tolerant(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        Customer::factory()->create([
            'agency_id' => $agency->id,
            'first_name' => 'Amadou',
            'last_name' => 'Diop',
        ]);
        $this->indexSearchable(Customer::class);

        $this->getJson('/api/customers?filter[search]=Amadu')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.first_name', 'Amadou');
    }

    /**
     * AC1 — « classe par pertinence ». Les trois clients sont créés dans
     * l'ordre INVERSE de leur pertinence : le tri par défaut du contrôleur
     * (`-created_at`) rendrait 2-fautes, 1-faute, exact. Si l'assertion passe,
     * c'est que l'ordre de Meilisearch a survécu au `whereIn` de
     * `HasQueryBuilder`.
     */
    public function test_customer_search_ranks_by_relevance_not_by_date(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $exact = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefall',
            'created_at' => now()->subDays(3),
        ]);
        $oneTypo = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefalt',
            'created_at' => now()->subDays(2),
        ]);
        $twoTypos = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefaxt',
            'created_at' => now()->subDay(),
        ]);
        $this->indexSearchable(Customer::class);

        $ids = $this->getJson('/api/customers?filter[search]=Ndiayefall&fields[customers]=id,last_name')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $oneTypo->id, $twoTypos->id], $ids);
    }

    /**
     * AC4 — un `sort=` explicite reste souverain : la pertinence n'est qu'un
     * tri PAR DÉFAUT, elle ne doit pas écraser ce que le client demande.
     */
    public function test_explicit_sort_wins_over_relevance(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $exact = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefall',
            'created_at' => now()->subDays(3),
        ]);
        $oneTypo = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefalt',
            'created_at' => now()->subDays(2),
        ]);
        $twoTypos = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ndiayefaxt',
            'created_at' => now()->subDay(),
        ]);
        $this->indexSearchable(Customer::class);

        $ids = $this->getJson('/api/customers?filter[search]=Ndiayefall&sort=-created_at&fields[customers]=id,last_name,created_at')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$twoTypos->id, $oneTypo->id, $exact->id], $ids);
    }

    public function test_customer_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        Customer::factory()->create(['agency_id' => $agencyA->id, 'last_name' => 'Searchableton']);
        Customer::factory()->create(['agency_id' => $agencyB->id, 'last_name' => 'Searchableton']);
        $this->indexSearchable(Customer::class);

        $response = $this->getJson('/api/customers?filter[search]=Searchableton')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_customer_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $customer = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ghostton',
        ]);
        $customer->delete();
        $this->indexSearchable(Customer::class);

        $this->getJson('/api/customers?filter[search]=Ghostton')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
