<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Lease;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2642, AC5 (décision du porteur, famille 4 n° 3a) — « Entrées en attente » devient un filtre de
 * la liste des baux : `filter[onboarding_pending]=1` rend les baux de l'endpoint dédié
 * (`GET /api/agencies/{agency}/tenant-onboarding-pending`), servis par la même règle
 * (`TenantOnboardingChecklist::scopePending()`). La file reste interne (TCK-378) : ni le bailleur,
 * ni le locataire ne la lisent.
 */
class LeaseOnboardingPendingFilterTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->owner = $this->bailleur($this->agency);
    }

    private function lease(string $tenant, ?string $checklistOpenedAt = null, array $checklist = []): Lease
    {
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Bien '.$tenant), $tenant, ['end_date' => '2027-12-31']);
        if ($checklistOpenedAt !== null) {
            TenantOnboardingChecklist::factory()->create($checklist + ['lease_id' => $lease->id, 'created_at' => $checklistOpenedAt]);
        }

        return $lease;
    }

    /** @return list<int> */
    private function endpointLeaseIds(User $as): array
    {
        $this->actingAsApi($as);
        $ids = array_column($this->getJson("/api/agencies/{$this->agency->id}/tenant-onboarding-pending?per_page=100")->assertOk()->json('data'), 'lease_id');
        sort($ids);

        return $ids;
    }

    /** @return list<int> */
    private function filterLeaseIds(User $as): array
    {
        $this->actingAsApi($as);
        $ids = array_column($this->getJson('/api/leases?per_page=100&filter[onboarding_pending]=1&fields[leases]=id')->assertOk()->json('data'), 'id');
        sort($ids);

        return $ids;
    }

    public function test_ac5_le_filtre_et_l_endpoint_rendent_les_memes_baux(): void
    {
        $old = $this->lease('Ancien ENTRANT', '2026-10-01 09:00:00');
        $eight = $this->lease('Huit JOURS', '2026-11-03 09:00:00');
        $this->lease('Trois JOURS', '2026-11-08 09:00:00');
        $this->lease('Complet ENTRANT', '2026-10-01 09:00:00', ['completed_at' => '2026-10-15 09:00:00']);
        $this->lease('Sans LISTE');
        $other = $this->agence();
        TenantOnboardingChecklist::factory()->create([
            'lease_id' => $this->bail($this->bienLoue($other, $this->bailleur($other), 'Ailleurs'), 'Autre AGENCE')->id,
            'created_at' => '2026-10-01 09:00:00',
        ]);

        $admin = $this->agencyAdmin($this->agency);
        $expected = [$old->id, $eight->id];
        sort($expected);

        $this->assertSame($expected, $this->endpointLeaseIds($admin));
        $this->assertSame($expected, $this->filterLeaseIds($admin));
        $agent = $this->agencyAgent($this->agency);
        $this->assertSame($expected, $this->endpointLeaseIds($agent));
        $this->assertSame($expected, $this->filterLeaseIds($agent));
    }

    public function test_le_bailleur_n_a_ni_l_endpoint_ni_le_filtre(): void
    {
        $this->lease('Ancien ENTRANT', '2026-10-01 09:00:00');

        $this->actingAsApi($this->owner);
        $this->getJson("/api/agencies/{$this->agency->id}/tenant-onboarding-pending")->assertForbidden();
        $this->assertSame([], $this->filterLeaseIds($this->owner));
        $this->assertCount(1, $this->getJson('/api/leases?fields[leases]=id')->assertOk()->json('data'), 'le bailleur lit pourtant le bail');
    }

    public function test_un_filtre_faux_ou_absent_ne_restreint_rien(): void
    {
        $this->lease('Ancien ENTRANT', '2026-10-01 09:00:00');
        $this->lease('Sans LISTE');

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->assertCount(2, $this->getJson('/api/leases?filter[onboarding_pending]=0&fields[leases]=id')->assertOk()->json('data'));
        $this->getJson('/api/leases?filter[onboarding_pending]=bof')->assertStatus(422);
    }
}
