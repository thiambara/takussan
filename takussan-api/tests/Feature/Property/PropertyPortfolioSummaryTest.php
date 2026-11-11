<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2637, AC3 — `GET /api/properties/portfolio-summary` : les comptes des tuiles en un appel, sous
 * la portée de la liste. Chaque compte égale le `meta.total` de la liste filtrée correspondante,
 * pour l'admin d'agence, pour l'agent sous « mes biens » (`filter[user_id]`) et pour un bailleur.
 */
class PropertyPortfolioSummaryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private const TUILES = [
        'total' => '',
        'occupied' => '&filter[occupancy]=occupied',
        'vacant' => '&filter[occupancy]=vacant',
        'notice' => '&filter[occupancy]=notice',
        'rent_late' => '&filter[rent_late]=1',
        'online' => '&filter[public]=1',
    ];

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->personnel($this->agency);
        $this->owner = $this->bailleur($this->agency);
        $other = $this->bailleur($this->agency);

        $published = ['visibility' => 'public', 'published_at' => '2026-10-01 10:00:00'];

        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Payé', $published), 'Awa Ndiaye'), '2026-11-05', PaymentStatus::Paid);
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Retard'), 'Moussa Fall'), '2026-11-05', PaymentStatus::Late, [
            'late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-11-08 00:00:00',
        ]);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Préavis'), 'Fatou Diop', ['status' => LeaseStatus::Terminating]);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Vacant 90 j', $published), 'Ancien Un', ['status' => LeaseStatus::Expired, 'start_date' => '2025-08-01', 'end_date' => '2026-08-12']);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Vacant 30 j'), 'Ancien Deux', ['status' => LeaseStatus::Terminated, 'terminated_at' => '2026-10-12 10:00:00']);
        $this->bienLoue($this->agency, $this->owner, 'Jamais loué', $published);
        $this->bienLoue($this->agency, $this->owner, 'Archivé', ['status' => 'archived']);

        // Les biens saisis par l'agent (« mes biens ») : un en retard, un vacant en ligne.
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->agent, 'Agent retard'), 'Ibou Sarr'), '2026-11-03', PaymentStatus::Pending, ['amount' => 200_000]);
        $this->bienLoue($this->agency, $this->agent, 'Agent vacant', $published);

        $this->bail($this->bienLoue($this->agency, $other, 'Autre bailleur'), 'Aïda Ba');
    }

    /** @return array<string, mixed> */
    private function summary(User $user, string $query = ''): array
    {
        $this->actingAsApi($user);

        return $this->getJson('/api/properties/portfolio-summary?'.ltrim($query, '&'))->assertOk()->json('data');
    }

    private function total(User $user, string $query): int
    {
        $this->actingAsApi($user);

        return (int) $this->getJson('/api/properties?per_page=1'.$query)->assertOk()->json('meta.total');
    }

    private function assertTuilesEgalesAuxListes(User $user, string $scope = ''): array
    {
        $summary = $this->summary($user, $scope);
        foreach (self::TUILES as $key => $filter) {
            $this->assertSame($this->total($user, $scope.$filter), $summary[$key], "tuile {$key}");
        }
        $this->assertSame($summary['total'], $summary['occupied'] + $summary['vacant'], 'occupés + vacants = tous');

        return $summary;
    }

    public function test_ac3_admin_d_agence(): void
    {
        $summary = $this->assertTuilesEgalesAuxListes($this->admin);

        $this->assertSame([9, 5, 4, 1, 2, 4, 1], [$summary['total'], $summary['occupied'], $summary['vacant'], $summary['notice'], $summary['rent_late'], $summary['online'], $summary['vacant_over_60_days']]);
        // Le reste dû des loyers en retard du mois (le calcul d'`amount_due` de l'historique).
        $this->assertEquals(500000, $summary['rent_late_amount']);
    }

    public function test_ac3_agent_sous_mes_biens(): void
    {
        $summary = $this->assertTuilesEgalesAuxListes($this->agent, '&filter[user_id]='.$this->agent->id);

        $this->assertSame([2, 1, 1, 1, 1], [$summary['total'], $summary['occupied'], $summary['vacant'], $summary['rent_late'], $summary['online']]);
        $this->assertEquals(200000, $summary['rent_late_amount']);
    }

    public function test_ac3_bailleur(): void
    {
        $summary = $this->assertTuilesEgalesAuxListes($this->owner);

        $this->assertSame([6, 3, 3, 1, 1], [$summary['total'], $summary['occupied'], $summary['vacant'], $summary['notice'], $summary['rent_late']]);
        $this->assertEquals(300000, $summary['rent_late_amount']);
    }

    public function test_les_archives_suivent_include_archived(): void
    {
        $this->assertSame(10, $this->assertTuilesEgalesAuxListes($this->admin, '&include_archived=1')['total']);
    }
}
