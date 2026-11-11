<?php

namespace Tests\Feature\Lease;

use App\Http\Controllers\Api\LeaseSummaryController;
use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Services\Lease\LeaseAttention;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2642, AC4 — `GET /api/leases/summary` : chaque compte égale le `meta.total` du filtre de la
 * liste qui lui correspond, pour le même appelant et sous les mêmes autres paramètres
 * (`filter[search]` compris). Les comptes et la liste lisent la même portée et la même règle.
 */
class LeaseSummaryCountsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private const TAB_FILTERS = [
        'a_traiter' => 'filter[a_traiter]=1',
        'active' => 'filter[status]=active,terminating',
        'onboarding_pending' => 'filter[onboarding_pending]=1',
        'ended' => 'filter[status]=expired,terminated,renewed',
        'draft' => 'filter[status]=draft,pending_signature',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->owner = $this->bailleur($this->agency);

        $lease = fn (string $tenant, array $attributes = []) => $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien '.$tenant), $tenant, $attributes + ['start_date' => '2026-03-01', 'end_date' => '2027-12-31']);

        $lease('Awa SECK');
        $this->loyer($lease('Moussa SECK'), '2026-10-05', PaymentStatus::Pending);
        $lease('Fatou DIOP', ['status' => LeaseStatus::Terminating, 'early_termination_requested_at' => '2026-11-01 08:00:00']);
        $lease('Omar DIOP', ['status' => LeaseStatus::Draft]);
        $lease('Aïda SY', ['status' => LeaseStatus::PendingSignature, 'signature_requested_at' => '2026-11-01 08:00:00']);
        $lease('Ndeye SY', ['status' => LeaseStatus::Expired, 'start_date' => '2024-01-01', 'end_date' => '2025-12-31']);
        $lease('Cheikh BA', ['status' => LeaseStatus::Renewed, 'start_date' => '2024-01-01', 'end_date' => '2025-12-31']);
        $lease('Binta BA', ['end_date' => '2027-01-31']);
        TenantOnboardingChecklist::factory()->create(['lease_id' => $lease('Saliou NDIAYE')->id, 'created_at' => '2026-10-20 09:00:00']);

        $other = $this->agence();
        $this->bail($this->bienLoue($other, $this->bailleur($other), 'Ailleurs'), 'Ailleurs SECK', ['status' => LeaseStatus::Draft]);
    }

    private function assertCountsMatchList(User $as, string $extra = ''): void
    {
        $this->actingAsApi($as);
        $summary = $this->getJson('/api/leases/summary'.($extra === '' ? '' : '?'.$extra))->assertOk()->json('data');
        $total = fn (string $filter): int => $this->getJson('/api/leases?per_page=1&'.$filter.($extra === '' ? '' : '&'.$extra))->assertOk()->json('meta.total');

        $this->assertSame(array_keys(self::TAB_FILTERS), array_keys(array_diff_key($summary, ['motifs' => 1])));
        foreach (self::TAB_FILTERS as $tab => $filter) {
            $this->assertSame($total($filter), $summary[$tab], $tab);
        }
        $this->assertSame(LeaseAttention::MOTIFS, array_keys($summary['motifs']));
        foreach (LeaseAttention::MOTIFS as $motif) {
            $this->assertSame($total("filter[motif]={$motif}"), $summary['motifs'][$motif], $motif);
        }
    }

    public function test_ac4_les_comptes_de_l_admin_egalent_la_liste(): void
    {
        $this->assertCountsMatchList($this->agencyAdmin($this->agency));

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->assertSame(
            ['a_traiter' => 5, 'active' => 5, 'onboarding_pending' => 1, 'ended' => 2, 'draft' => 2],
            array_intersect_key($this->getJson('/api/leases/summary')->json('data'), array_flip(['a_traiter', 'active', 'ended', 'draft', 'onboarding_pending'])),
            'les comptes du jeu, l\'autre agence exclue',
        );
    }

    public function test_ac4_les_comptes_de_l_agent_egalent_la_liste(): void
    {
        $this->assertCountsMatchList($this->agencyAgent($this->agency));
    }

    public function test_les_comptes_du_bailleur_egalent_la_liste_sans_entree_en_attente(): void
    {
        $this->assertCountsMatchList($this->owner);

        $this->actingAsApi($this->owner);
        $this->assertSame(0, $this->getJson('/api/leases/summary')->json('data.onboarding_pending'));
    }

    /** Les comptes suivent la recherche en cours : l'onglet dit combien la liste filtrée en rendra. */
    public function test_les_comptes_suivent_la_recherche(): void
    {
        $this->assertCountsMatchList($this->agencyAdmin($this->agency), 'filter[search]=seck');
    }

    public function test_les_onglets_de_statut_couvrent_tous_les_statuts(): void
    {
        $covered = array_merge(...array_values(LeaseSummaryController::STATUS_TABS));
        $this->assertEqualsCanonicalizing(LeaseStatus::cases(), $covered);
    }
}
