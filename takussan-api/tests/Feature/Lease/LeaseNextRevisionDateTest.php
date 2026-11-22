<?php

namespace Tests\Feature\Lease;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2906 (AC2) — `next_revision_date` du dossier d'un bail : le jour où la révision du loyer devient
 * possible. UNE source avec la file « À traiter » (`RentReviewSchedule`) : la veille, le bail n'est pas
 * dans `filter[motif]=rent_review_open` ; le jour même, il y entre, et la date est ce jour-là.
 */
class LeaseNextRevisionDateTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->property = $this->bienLoue($this->agency, $this->bailleur($this->agency), 'Villa Ngor');
    }

    /** @param  array<string, mixed>  $attributes */
    private function bailDu(string $debut, array $attributes = []): Lease
    {
        return $this->bail($this->property, 'Awa Ndiaye', $attributes + [
            'start_date' => $debut, 'end_date' => '2029-06-30', 'rent_review_max_pct' => 10,
        ]);
    }

    private function date(Lease $lease): ?string
    {
        $data = $this->actingAsApi($this->admin)->getJson("/api/leases/{$lease->id}")->assertOk()->json('data');
        $this->assertArrayHasKey('next_revision_date', $data);

        return $data['next_revision_date'];
    }

    private function dansLaFile(Lease $lease): bool
    {
        $ids = array_column($this->actingAsApi($this->admin)
            ->getJson('/api/leases?filter[motif]=rent_review_open&fields[leases]=id&per_page=100')
            ->assertOk()->json('data'), 'id');

        return in_array($lease->id, $ids, true);
    }

    private function revise(Lease $lease, string $le): void
    {
        $log = activity('Lease')->performedOn($lease)->event('lease_rent_reviewed')->log('lease_rent_reviewed');
        Activity::query()->whereKey($log->id)->update(['created_at' => $le]);
    }

    public function test_ac2_un_bail_commence_le_1er_juillet_2026_se_revise_le_1er_juillet_2027(): void
    {
        $bail = $this->bailDu('2026-07-01');

        $this->assertSame('2027-07-01', $this->date($bail));
    }

    public function test_ac2_un_bail_termine_n_a_pas_de_date(): void
    {
        $bail = $this->bailDu('2025-07-01', ['status' => LeaseStatus::Terminated, 'terminated_at' => '2026-10-01 10:00:00']);

        $this->assertNull($this->date($bail));
    }

    public function test_un_brouillon_porte_sa_date_et_une_clause_figee_a_zero_n_en_porte_pas(): void
    {
        $this->assertSame('2027-07-01', $this->date($this->bailDu('2026-07-01', ['status' => LeaseStatus::Draft])));
        $this->assertNull($this->date($this->bailDu('2026-07-01', ['rent_review_max_pct' => 0])));
        // Sans plafond figé, le réglage s'applique (toujours > 0) : la révision reste possible.
        $this->assertSame('2027-07-01', $this->date($this->bailDu('2026-07-01', ['rent_review_max_pct' => null])));
    }

    /** La même règle que la file : la veille hors du motif, le jour même dedans, et la date est ce jour. */
    public function test_la_date_est_celle_ou_le_bail_entre_dans_la_file_a_traiter(): void
    {
        $bail = $this->bailDu('2026-07-01');

        $this->travelTo('2027-06-30 10:00:00');
        $this->assertFalse($this->dansLaFile($bail));
        $this->assertSame('2027-07-01', $this->date($bail));

        $this->travelTo('2027-07-01 10:00:00');
        $this->assertTrue($this->dansLaFile($bail));
        $this->assertSame('2027-07-01', $this->date($bail));
    }

    /** Révisé il y a 3 mois : le prochain anniversaire du début est trop tôt, la date suit la révision. */
    public function test_une_revision_recente_repousse_la_date_d_un_an_apres_elle(): void
    {
        $bail = $this->bailDu('2025-01-10');
        $this->revise($bail, '2026-08-20 15:00:00');

        $this->assertSame('2027-08-20', $this->date($bail));
        $this->assertFalse($this->dansLaFile($bail), 'révisé il y a moins d\'un an');

        $this->travelTo('2027-08-19 10:00:00');
        $this->assertFalse($this->dansLaFile($bail));

        $this->travelTo('2027-08-20 10:00:00');
        $this->assertTrue($this->dansLaFile($bail));
        $this->assertSame('2027-08-20', $this->date($bail));
    }

    /** Une révision ancienne ne retarde rien : la date est passée, la révision est ouverte. */
    public function test_une_revision_ouverte_rend_une_date_passee(): void
    {
        $bail = $this->bailDu('2024-03-01');
        $this->revise($bail, '2025-03-05 09:00:00');

        $this->assertSame('2026-03-05', $this->date($bail));
        $this->assertTrue($this->dansLaFile($bail));
    }
}
