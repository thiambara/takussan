<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2906 (AC6) — les comptes des onglets du dossier d'un bail, sur demande : `documents_count`
 * (`include=documentsCount`) est ce que l'onglet « Documents » liste — les pièces déposées sur la cible
 * `lease:{id}` et ses documents générés —, `history_count` (`include=historyCount`) les entrées de
 * l'onglet « Historique » (`GET /api/audit-log/lease/{id}`), absent pour qui ne le lit pas.
 */
class LeaseTabCountsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $tenantUser;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->lease = $this->bail($this->bienLoue($this->agency, $this->bailleur($this->agency), 'Villa Ngor'), 'Awa Ndiaye');
        $this->tenantUser = User::factory()->create();
        $this->lease->tenant->update(['user_id' => $this->tenantUser->id]);

        $agent = $this->agencyAgent($this->agency);
        foreach (range(1, 3) as $i) {
            Document::factory()->create(['documentable_type' => Lease::class, 'documentable_id' => $this->lease->id, 'uploaded_by' => $agent->id]);
        }
        // Une pièce d'un autre bail : hors du compte.
        Document::factory()->create([
            'documentable_type' => Lease::class,
            'documentable_id' => $this->bail($this->bienLoue($this->agency, $this->bailleur($this->agency), 'Autre'), 'Ali Fall')->id,
            'uploaded_by' => $agent->id,
        ]);
        // Deux quittances : des documents générés de la cible.
        $this->loyer($this->lease, '2026-09-05', PaymentStatus::Paid);
        $this->loyer($this->lease, '2026-10-05', PaymentStatus::Paid, ['payment_type' => LeasePaymentType::Rent]);
        activity('Lease')->performedOn($this->lease)->causedBy($this->admin)->event('lease_rent_reviewed')->log('lease_rent_reviewed');
    }

    /** @return array<string, mixed> */
    private function fiche(User $as): array
    {
        return $this->actingAsApi($as)->getJson("/api/leases/{$this->lease->id}?include=documentsCount,historyCount")->assertOk()->json('data');
    }

    private function listes(User $as): int
    {
        $deposes = $this->actingAsApi($as)
            ->getJson("/api/documents?filter[documentable_type]=lease&filter[documentable_id]={$this->lease->id}")
            ->assertOk()->json('meta.total');
        $generes = $this->actingAsApi($as)->getJson("/api/documents/generated?target=lease:{$this->lease->id}")->assertOk()->json('data');

        return $deposes + count($generes);
    }

    public function test_ac6_documents_count_egale_ce_que_l_onglet_liste_et_history_count_l_historique(): void
    {
        $fiche = $this->fiche($this->admin);

        $this->assertSame($this->listes($this->admin), $fiche['documents_count']);
        $this->assertGreaterThan(3, $fiche['documents_count'], 'les trois pièces et au moins une quittance générée');
        $historique = $this->actingAsApi($this->admin)->getJson("/api/audit-log/lease/{$this->lease->id}")->assertOk()->json('meta.total');
        $this->assertGreaterThanOrEqual(1, $historique);
        $this->assertSame($historique, $fiche['history_count']);
    }

    public function test_le_locataire_compte_ses_documents_et_ne_recoit_pas_l_historique(): void
    {
        $fiche = $this->fiche($this->tenantUser);

        $this->assertSame($this->listes($this->tenantUser), $fiche['documents_count']);
        $this->assertArrayNotHasKey('history_count', $fiche);
        $this->actingAsApi($this->tenantUser)->getJson("/api/audit-log/lease/{$this->lease->id}")->assertForbidden();
    }

    public function test_sans_les_inclusions_les_cles_sont_absentes(): void
    {
        $data = $this->actingAsApi($this->admin)->getJson("/api/leases/{$this->lease->id}")->assertOk()->json('data');

        $this->assertArrayNotHasKey('documents_count', $data);
        $this->assertArrayNotHasKey('history_count', $data);
    }
}
