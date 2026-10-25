<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-591 §5 — les critères du prospect se saisissent par morceaux : un plafond SANS plancher est
 * le cas le plus courant (« jusqu'à 300 000 »), et un critère s'efface en envoyant `null`.
 *
 * `gte:budget_min` nu refusait un `budget_max` seul : la règle compare au champ voisin, et un
 * nombre n'est jamais « du même type » que `null` (`ValidatesAttributes::validateGte`).
 *
 * P209.03 (TCK-2067) — à la modification, une borne envoyée seule se compare à l'autre borne
 * ENREGISTRÉE : `gte:budget_min` ne voyait que la requête, et un `PATCH {budget_max: 100}`
 * passait sous un plancher de 500 000.
 */
class CustomerCriteriaValidationTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $agent;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $agency);
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id, 'added_by_id' => $this->agent->id]);
    }

    /** @param array<string, mixed> $body */
    private function update(array $body)
    {
        return $this->actingAsApi($this->agent)->putJson("/api/customers/{$this->customer->id}", $body);
    }

    public function test_a_ceiling_without_a_floor_is_accepted_at_creation_and_update(): void
    {
        $this->actingAsApi($this->agent)->apiPost('/api/customers', [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'budget_max' => 300000,
        ])->assertCreated()->assertJsonPath('data.budget_max', '300000.00');

        $this->update(['budget_min' => null, 'budget_max' => 300000])->assertOk();
        $this->assertSame('300000.00', $this->customer->fresh()->budget_max);
    }

    public function test_a_ceiling_below_the_floor_is_refused(): void
    {
        $this->update(['budget_min' => 400000, 'budget_max' => 300000])
            ->assertStatus(422)
            ->assertJsonValidationErrors('budget_max');
    }

    /** @return array<string, array{array<string, int>, string}> */
    public static function bornesSeulesDePartEtDAutre(): array
    {
        return [
            'plafond seul sous le plancher enregistré' => [['budget_max' => 100], 'budget_max'],
            'plancher seul au-dessus du plafond enregistré' => [['budget_min' => 900000], 'budget_min'],
        ];
    }

    /**
     * @param  array<string, int>  $body
     */
    #[DataProvider('bornesSeulesDePartEtDAutre')]
    public function test_a_lone_bound_is_compared_to_the_stored_one(array $body, string $champ): void
    {
        $this->customer->update(['budget_min' => 500000, 'budget_max' => 800000]);

        $this->actingAsApi($this->agent)->patchJson("/api/customers/{$this->customer->id}", $body)
            ->assertStatus(422)
            ->assertJsonValidationErrors($champ);

        $fresh = $this->customer->fresh();
        $this->assertSame('500000.00', $fresh->budget_min);
        $this->assertSame('800000.00', $fresh->budget_max);
    }

    public function test_a_lone_bound_on_the_right_side_of_the_stored_one_is_accepted(): void
    {
        $this->customer->update(['budget_min' => 500000, 'budget_max' => 800000]);

        $this->update(['budget_max' => 600000])->assertOk();
        $this->update(['budget_min' => 600000])->assertOk();
        // Le plancher effacé libère le plafond.
        $this->update(['budget_min' => null])->assertOk();
        $this->update(['budget_max' => 100])->assertOk();

        $fresh = $this->customer->fresh();
        $this->assertNull($fresh->budget_min);
        $this->assertSame('100.00', $fresh->budget_max);
    }

    public function test_a_criterion_is_cleared_with_null(): void
    {
        $this->customer->update(['seeking_cities' => ['Dakar'], 'min_bedrooms' => 3, 'budget_max' => 1000]);

        $this->update(['seeking_cities' => null, 'min_bedrooms' => null, 'budget_max' => null])->assertOk();

        $fresh = $this->customer->fresh();
        $this->assertNull($fresh->seeking_cities);
        $this->assertNull($fresh->min_bedrooms);
        $this->assertNull($fresh->budget_max);
    }
}
