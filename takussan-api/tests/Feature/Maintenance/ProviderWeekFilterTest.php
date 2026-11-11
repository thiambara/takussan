<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 (AC6) — « Ma semaine » du prestataire : `filter[scheduled_from]=lundi` et
 * `filter[scheduled_to]=dimanche` (TCK-2623, déjà servis) rendent ses seules demandes de la semaine,
 * bornes incluses à l'heure de Dakar.
 */
class ProviderWeekFilterTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private function at(string $dakar): Carbon
    {
        return Carbon::parse($dakar, 'Africa/Dakar')->utc();
    }

    /** AC6. */
    public function test_ac6_the_week_filter_returns_the_providers_own_requests_of_the_week(): void
    {
        $this->travelTo(Carbon::parse('2026-11-11 08:00:00', 'Africa/Dakar'));
        ['mr' => $monday, 'provider' => $provider, 'property' => $property, 'agency' => $agency, 'tenant' => $tenant]
            = $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => $this->at('2026-11-09 00:00:00')]);
        $make = fn (string $dakar, ?int $assignee = null) => MaintenanceRequest::factory()->create([
            'property_id' => $property->id, 'requester_id' => $tenant->id,
            'assigned_to' => $assignee ?? $provider->id, 'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => $dakar === '' ? null : $this->at($dakar),
        ]);

        $sunday = $make('2026-11-15 23:59:00');
        $make('2026-11-08 23:59:00');                     // dimanche d'avant
        $make('2026-11-16 00:00:00');                     // lundi d'après
        $make('');                                        // sans créneau
        $make('2026-11-12 10:00:00', $this->providerFor($agency)->id); // un autre prestataire, même semaine

        Sanctum::actingAs($provider);
        $ids = array_column($this->getJson('/api/maintenance-requests?filter[scheduled_from]=2026-11-09&filter[scheduled_to]=2026-11-15')->assertOk()->json('data'), 'id');
        sort($ids);

        $this->assertSame([$monday->id, $sunday->id], $ids);
    }
}
