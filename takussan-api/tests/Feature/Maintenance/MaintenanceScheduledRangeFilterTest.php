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
 * TCK-2623 — `filter[scheduled_from]` / `filter[scheduled_to]` : « mes interventions du jour » du
 * prestataire. Dates seules, lues à l'heure de Dakar, bornes incluses ; elles s'ajoutent aux filtres
 * existants, et le cloisonnement reste celui de `visibleTo()`.
 */
class MaintenanceScheduledRangeFilterTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const CHAMPS = '&fields[maintenance_requests]=id,scheduled_at';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00', 'Africa/Dakar'));
    }

    private function a(string $aDakar): Carbon
    {
        return Carbon::parse($aDakar, 'Africa/Dakar')->setTimezone(config('app.timezone'));
    }

    /** @return list<int> */
    private function ids(string $requete): array
    {
        $ids = array_column($this->getJson('/api/maintenance-requests?'.$requete.self::CHAMPS)->assertOk()->json('data'), 'id');
        sort($ids);

        return $ids;
    }

    /** AC3. */
    public function test_ac3_les_interventions_du_jour_du_prestataire_et_aucune_autre(): void
    {
        ['mr' => $matin, 'provider' => $provider, 'property' => $property] = $this->maintenanceScenario(
            MaintenanceStatus::Assigned,
            ['scheduled_at' => $this->a('2026-11-10 00:00:00')],
        );
        $creer = fn (string $aDakar, array $etat = []) => MaintenanceRequest::factory()->create(array_merge([
            'property_id' => $property->id,
            'requester_id' => $matin->requester_id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => $this->a($aDakar),
        ], $etat));
        $soir = $creer('2026-11-10 23:59:00');
        $creer('2026-11-09 23:30:00');
        $creer('2026-11-11 00:00:00');
        $creer('2026-11-12 10:00:00');
        // Celle d'un autre prestataire, le même jour : invisible pour celui-ci.
        $this->maintenanceScenario(MaintenanceStatus::Assigned, ['scheduled_at' => $this->a('2026-11-10 10:00:00')]);

        Sanctum::actingAs($provider);

        $attendu = [$matin->id, $soir->id];
        sort($attendu);
        $this->assertSame($attendu, $this->ids('filter[scheduled_from]=2026-11-10&filter[scheduled_to]=2026-11-10'));
    }

    /** Une borne seule vaut une demi-plage ; elle se combine aux filtres existants sans en changer le sens. */
    public function test_une_borne_seule_et_les_filtres_existants(): void
    {
        ['mr' => $aujourdHui, 'provider' => $provider, 'property' => $property] = $this->maintenanceScenario(
            MaintenanceStatus::Assigned,
            ['scheduled_at' => $this->a('2026-11-10 09:00:00')],
        );
        $demain = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $aujourdHui->requester_id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::InProgress,
            'scheduled_at' => $this->a('2026-11-11 09:00:00'),
        ]);
        $sansCreneau = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $aujourdHui->requester_id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => null,
        ]);

        Sanctum::actingAs($provider);

        $this->assertSame([$demain->id], $this->ids('filter[scheduled_from]=2026-11-11'));
        $this->assertSame([$aujourdHui->id], $this->ids('filter[scheduled_to]=2026-11-10'));
        $this->assertSame([$aujourdHui->id], $this->ids('filter[scheduled_from]=2026-11-10&filter[status]=assigned'));
        // Sans borne, rien ne change : l'intervention sans créneau est toujours listée.
        $this->assertContains($sansCreneau->id, $this->ids('filter[status]=assigned'));
    }

    /** Une date illisible ou une liste rend 422, jamais une 500 de PostgreSQL. */
    public function test_une_borne_illisible_rend_422(): void
    {
        ['provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);
        Sanctum::actingAs($provider);

        $this->getJson('/api/maintenance-requests?filter[scheduled_from]=demain')->assertUnprocessable();
        $this->getJson('/api/maintenance-requests?filter[scheduled_to]=2026-11-10,2026-11-11')->assertUnprocessable();
    }
}
