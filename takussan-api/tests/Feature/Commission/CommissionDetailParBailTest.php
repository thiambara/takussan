<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2867 — « Détail par bail » de l'agent (Rapports, vue d'ensemble et onglet Commissions) : une ligne du relevé
 * dit le client du bail, le jour de sa signature et son loyer mensuel, sans requête par ligne.
 */
class CommissionDetailParBailTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_include_lease_tenant_gives_the_client_the_signing_day_and_the_rent(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $property = Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Deux-pièces rénové, Point E']);
        $tenant = Customer::factory()->create(['first_name' => 'Coumba', 'last_name' => 'Diouf']);
        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 380000,
            'signed_at' => Carbon::parse('2026-11-09 10:00:00', 'Africa/Dakar'),
        ]);
        $line = CommissionEntry::factory()->create(['agency_id' => $agency->id, 'lease_id' => $lease->id, 'beneficiary_id' => $agent->id, 'amount' => 190000]);

        $row = collect($this->actingAsApi($agent)
            // La requête du front (`useDetailParBail`) : ses champs, ses relations, son tri, sa page.
            ->getJson('/api/commissions?fields[commission_entries]=id,lease_id,beneficiary_id,amount,currency,status,earned_at,paid_at,cancelled_at'
                .'&include=lease.property,lease.tenant&sort=-earned_at&page=1&per_page=5&filter[beneficiary_id]='.$agent->id)
            ->assertOk()->json('data'))->firstWhere('id', $line->id);

        $this->assertSame(['id' => $tenant->id, 'name' => 'Coumba Diouf'], $row['lease']['tenant']);
        $this->assertSame(380000.0, (float) $row['lease']['monthly_rent']);
        $this->assertSame(Carbon::parse('2026-11-09 10:00:00', 'Africa/Dakar')->toIso8601String(), Carbon::parse($row['lease']['signed_at'])->setTimezone('Africa/Dakar')->toIso8601String());
        $this->assertSame('Deux-pièces rénové, Point E', $row['lease']['property']['title']);

        // Sans `lease.tenant`, le bail ne dit pas son client.
        $row = collect($this->getJson('/api/commissions?include=lease')->json('data'))->firstWhere('id', $line->id);
        $this->assertArrayNotHasKey('tenant', $row['lease']);
    }

    public function test_the_client_of_each_line_is_read_without_one_query_per_line(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        foreach (range(1, 4) as $i) {
            $lease = Lease::factory()->create(['agency_id' => $agency->id, 'tenant_id' => Customer::factory()->create()->id]);
            CommissionEntry::factory()->create(['agency_id' => $agency->id, 'lease_id' => $lease->id, 'beneficiary_id' => $agent->id]);
        }
        $this->actingAsApi($agent);

        $compter = function (): int {
            \DB::flushQueryLog();
            \DB::enableQueryLog();
            $this->getJson('/api/commissions?include=lease.property,lease.tenant')->assertOk();
            $n = count(array_filter(\DB::getQueryLog(), fn (array $q): bool => str_contains($q['query'], '"customers"')));
            \DB::disableQueryLog();

            return $n;
        };

        $this->assertSame(1, $compter());
    }

    /** Un utilisateur du personnel d'une autre agence ne lit pas le client d'un bail qui n'est pas le sien. */
    public function test_a_stranger_sees_no_line(): void
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->create(['agency_id' => $agency->id, 'tenant_id' => Customer::factory()->create()->id]);
        CommissionEntry::factory()->create(['agency_id' => $agency->id, 'lease_id' => $lease->id, 'beneficiary_id' => $this->agencyAgent($agency)->id]);
        $other = $this->agencyAgent(Agency::factory()->create());

        $this->assertSame([], $this->actingAsApi($other)->getJson('/api/commissions?include=lease.tenant')->assertOk()->json('data'));
    }
}
