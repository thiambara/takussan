<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Maintenance\MaintenanceQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 (AC5) — `GET /api/maintenance-requests/summary` : chaque compte égale le `meta.total` de
 * `filter[file]` correspondant, pour l'admin, pour un prestataire et pour un bailleur — chacun ne
 * compte que ce que l'index lui montre.
 */
class MaintenanceSummaryCountsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private User $admin;

    private User $provider;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();

        ['agency' => $agency, 'property' => $property, 'landlord' => $this->landlord, 'provider' => $this->provider, 'tenant' => $tenant]
            = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => now()->subDays(2)]);
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $agency->id]);

        // Un second bailleur de la même agence : l'admin compte ses demandes, le premier bailleur non.
        $otherLandlord = $this->landlordOf($agency);
        $otherProperty = Property::factory()->create(['user_id' => $otherLandlord->id, 'agency_id' => $agency->id]);

        $make = fn (Property $p, MaintenanceStatus $status, array $extra = []) => MaintenanceRequest::factory()->create(array_merge([
            'property_id' => $p->id, 'requester_id' => $tenant->id, 'status' => $status,
        ], $extra));

        $make($property, MaintenanceStatus::Open);
        $make($property, MaintenanceStatus::Open, ['assigned_to' => $this->provider->id]);
        $make($property, MaintenanceStatus::InProgress, ['assigned_to' => $this->provider->id, 'accepted_at' => now(), 'scheduled_at' => now()->addDay()]);
        $make($property, MaintenanceStatus::AwaitingOwner, ['assigned_to' => $this->provider->id, 'priority' => MaintenancePriority::Urgent]);
        $make($property, MaintenanceStatus::Completed, ['assigned_to' => $this->provider->id, 'completed_at' => now()]);
        $make($property, MaintenanceStatus::Closed);
        $make($otherProperty, MaintenanceStatus::Open);
        $make($otherProperty, MaintenanceStatus::QuoteSubmitted, ['assigned_to' => $this->provider->id, 'priority' => MaintenancePriority::Urgent]);
        $make($otherProperty, MaintenanceStatus::Cancelled);

        // Une autre agence : personne ici ne la compte.
        $elsewhere = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $make($elsewhere, MaintenanceStatus::Open);
        $make($elsewhere, MaintenanceStatus::Completed);
    }

    /** @return array<string, int> */
    private function totalsByFilter(string $extra = ''): array
    {
        $totals = [];
        foreach ([...MaintenanceQueue::FILES, MaintenanceQueue::A_ACCEPTER] as $file) {
            $totals[$file] = $this->getJson("/api/maintenance-requests?filter[file]={$file}{$extra}")->assertOk()->json('meta.total');
        }

        return $totals;
    }

    /** AC5. */
    public function test_ac5_each_count_equals_the_total_of_its_filter_for_admin_provider_and_landlord(): void
    {
        $expected = [
            'admin' => ['a_dispatcher' => 2, 'en_retard' => 1, 'chez_le_bailleur' => 1, 'en_cours' => 3, 'a_confirmer' => 1, 'terminees' => 2, 'a_accepter' => 0],
            // `a_accepter` : l'assignée en retard, l'ouverte, celle chez le bailleur et le devis soumis,
            // toutes sans acceptation — la rendue et l'acceptée n'y sont pas.
            'provider' => ['a_dispatcher' => 0, 'en_retard' => 1, 'chez_le_bailleur' => 1, 'en_cours' => 3, 'a_confirmer' => 1, 'terminees' => 0, 'a_accepter' => 4],
            'landlord' => ['a_dispatcher' => 1, 'en_retard' => 1, 'chez_le_bailleur' => 1, 'en_cours' => 2, 'a_confirmer' => 1, 'terminees' => 1, 'a_accepter' => 0],
        ];

        foreach (['admin' => $this->admin, 'provider' => $this->provider, 'landlord' => $this->landlord] as $who => $user) {
            Sanctum::actingAs($user);
            $summary = $this->getJson('/api/maintenance-requests/summary')->assertOk()->json('data');

            $this->assertSame($expected[$who], $summary, $who);
            $this->assertSame($this->totalsByFilter(), $summary, $who);
        }
    }

    /** Les autres filtres de la requête s'appliquent aux comptes ; `filter[file]` est ignoré. */
    public function test_other_filters_apply_and_the_file_filter_is_ignored(): void
    {
        Sanctum::actingAs($this->admin);

        $summary = $this->getJson('/api/maintenance-requests/summary?filter[priority]=urgent&filter[file]=terminees')->assertOk()->json('data');

        $this->assertSame(1, $summary['chez_le_bailleur']);
        $this->assertSame(1, $summary['en_cours']);
        $this->assertSame(0, $summary['terminees']);
        $this->assertSame($this->totalsByFilter('&filter[priority]=urgent'), $summary);
    }

    /** Deux requêtes, quel que soit le nombre de demandes. */
    public function test_the_summary_costs_a_constant_number_of_queries(): void
    {
        Sanctum::actingAs($this->admin);
        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/maintenance-requests/summary')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $few = $count();
        $property = Property::query()->where('user_id', $this->landlord->id)->firstOrFail();
        MaintenanceRequest::factory()->count(8)->create(['property_id' => $property->id, 'status' => MaintenanceStatus::Open]);

        $this->assertSame($few, $count());
    }
}
