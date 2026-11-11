<?php

namespace Tests\Feature\Commission;

use App\Models\Address;
use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — le relevé se filtre par période (dates de Dakar, bornes incluses) et rend, à la
 * demande, le bien du bail et son quartier.
 */
class CommissionLedgerFiltersTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
    }

    private function line(array $attributes = [], ?Lease $lease = null): CommissionEntry
    {
        return CommissionEntry::factory()->create([
            'agency_id' => $this->agency->id,
            'lease_id' => ($lease ?? Lease::factory()->create(['agency_id' => $this->agency->id]))->id,
            'beneficiary_id' => $this->agencyAgent($this->agency)->id,
            ...$attributes,
        ]);
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return collect($this->actingAsApi($this->admin)->getJson('/api/commissions?'.$query)->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    public function test_ac6_paid_from_excludes_a_line_paid_the_evening_before_in_dakar(): void
    {
        $paid = ['status' => CommissionEntryStatus::Paid];
        $evening = $this->line($paid + ['paid_at' => Carbon::parse('2026-10-31 23:30:00', 'Africa/Dakar')]);
        $morning = $this->line($paid + ['paid_at' => Carbon::parse('2026-11-01 00:10:00', 'Africa/Dakar')]);
        $this->line(['status' => CommissionEntryStatus::Due]);

        $this->assertSame([$morning->id], $this->ids('filter[paid_from]=2026-11-01'));
        $this->assertSame([$evening->id], $this->ids('filter[paid_to]=2026-10-31'));
        $this->assertSame([$evening->id, $morning->id], $this->ids('filter[paid_from]=2026-10-31&filter[paid_to]=2026-11-01'));
    }

    public function test_earned_bounds_are_inclusive_days(): void
    {
        $first = $this->line(['earned_at' => Carbon::parse('2026-10-01 08:00:00', 'Africa/Dakar')]);
        $last = $this->line(['earned_at' => Carbon::parse('2026-10-31 22:00:00', 'Africa/Dakar')]);
        $this->line(['earned_at' => Carbon::parse('2026-11-01 08:00:00', 'Africa/Dakar')]);

        $this->assertSame([$first->id, $last->id], $this->ids('filter[earned_from]=2026-10-01&filter[earned_to]=2026-10-31'));
    }

    public function test_an_unreadable_or_listed_date_is_a_422(): void
    {
        $this->actingAsApi($this->admin);

        $this->getJson('/api/commissions?filter[paid_from]=demain')->assertStatus(422);
        $this->getJson('/api/commissions?filter[earned_to][]=2026-10-01')->assertStatus(422);
    }

    public function test_include_lease_property_gives_the_property_and_its_quarter(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Villa Almadies']);
        Address::factory()->create(['addressable_type' => $property->getMorphClass(), 'addressable_id' => $property->id, 'neighborhood' => 'Almadies']);
        $line = $this->line(lease: Lease::factory()->create(['agency_id' => $this->agency->id, 'property_id' => $property->id]));

        $row = collect($this->actingAsApi($this->admin)->getJson('/api/commissions?include=lease.property')->assertOk()->json('data'))->firstWhere('id', $line->id);
        $this->assertSame(['id' => $property->id, 'title' => 'Villa Almadies', 'quarter' => 'Almadies'], $row['lease']['property']);

        // `include=lease` seul : le bail, sans son bien.
        $row = collect($this->getJson('/api/commissions?include=lease')->json('data'))->firstWhere('id', $line->id);
        $this->assertArrayNotHasKey('property', $row['lease']);
    }
}
