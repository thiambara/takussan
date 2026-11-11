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
 * TCK-2637 — `include=occupancy` sur la liste et la fiche des biens : occupé, en préavis ou vacant,
 * par qui, jusqu'à quand, le loyer du mois, et depuis quand le bien est vide. Le bail courant est
 * celui qui OCCUPE le bien aujourd'hui (`Occupation`, la règle de l'occupation du tableau de bord) ;
 * l'état du mois est celui du relevé du bailleur (`RentMonthStatus`), et ses montants ceux de
 * l'historique des paiements.
 */
class PropertyOccupancyTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->owner = $this->bailleur($this->agency);
    }

    /** @return array<string, array<string, mixed>> les lignes, par titre */
    private function rows(string $query = ''): array
    {
        $this->actingAsApi($this->admin);
        $data = $this->getJson('/api/properties?include=occupancy&per_page=100'.$query)->assertOk()->json('data');

        return array_column($data, null, 'title');
    }

    /** @return list<string> */
    private function titles(string $query): array
    {
        $this->actingAsApi($this->admin);

        return array_column($this->getJson('/api/properties?per_page=100&fields[properties]=id,title'.$query)->assertOk()->json('data'), 'title');
    }

    /** AC1 — échéance de novembre échue depuis 6 jours et non payée, puis payée. */
    public function test_ac1_un_bien_loue_en_retard_de_six_jours_puis_paye(): void
    {
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'F3 Mermoz'), 'Yacine DIOUF', [], '+221771234567');
        $rent = $this->loyer($lease, '2026-11-05', PaymentStatus::Late);

        $occupancy = $this->rows()['F3 Mermoz']['occupancy'];
        $this->assertSame('occupied', $occupancy['state']);
        $this->assertSame('late', $occupancy['current_month']['status']);
        $this->assertSame(6, $occupancy['current_month']['days_late']);
        $this->assertSame('2026-11-05', $occupancy['current_month']['due_date']);
        $this->assertSame(['Yacine', 'DIOUF', '+221771234567'], [$occupancy['tenant']['first_name'], $occupancy['tenant']['last_name'], $occupancy['tenant']['phone']]);
        $this->assertSame([$lease->id, $lease->reference_number, 'residential_rent', '2026-01-01', '2026-12-31'], array_values(array_intersect_key($occupancy['lease'], array_flip(['id', 'reference_number', 'type', 'start_date', 'end_date']))));
        $this->assertEquals(300000, $occupancy['rent']['amount']);
        $this->assertSame('monthly', $occupancy['rent']['payment_frequency']);
        $this->assertNull($occupancy['vacant_since']);

        $rent->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-11-10 09:00:00'])->save();

        $current = $this->rows()['F3 Mermoz']['occupancy']['current_month'];
        $this->assertSame('paid', $current['status']);
        $this->assertNull($current['days_late']);
    }

    /** Les montants du mois sont ceux de l'historique des paiements, ligne pour ligne. */
    public function test_le_montant_du_et_la_penalite_sont_ceux_de_l_historique(): void
    {
        $lease = $this->bail($this->bienLoue($this->agency, $this->owner, 'Studio Ouakam'), 'Awa Ndiaye');
        $rent = $this->loyer($lease, '2026-11-05', PaymentStatus::Late, [
            'late_fee_amount' => 15_000, 'late_fee_applied_at' => '2026-11-08 00:00:00',
            'metadata' => ['paid_amount' => 100_000],
        ]);

        $current = $this->rows()['Studio Ouakam']['occupancy']['current_month'];
        $history = collect($this->getJson('/api/payments/history?per_page=100')->assertOk()->json('data'))
            ->firstWhere('id', $rent->id);

        $this->assertNotNull($history);
        $this->assertEquals($history['amount_due'], $current['amount_due']);
        $this->assertEquals($history['late_fee_outstanding'], $current['late_fee_outstanding']);
        $this->assertEquals(15000, $current['late_fee_outstanding']);
    }

    public function test_un_bail_en_preavis_rend_notice(): void
    {
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Préavis Statut'), 'Moussa Fall', ['status' => LeaseStatus::Terminating]);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Préavis Demande'), 'Fatou Diop', ['early_termination_requested_at' => '2026-11-01 10:00:00']);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Occupé'), 'Ibou Sarr');

        $rows = $this->rows();
        $this->assertSame('notice', $rows['Préavis Statut']['occupancy']['state']);
        $this->assertSame('notice', $rows['Préavis Demande']['occupancy']['state']);
        $this->assertSame('occupied', $rows['Occupé']['occupancy']['state']);
    }

    /** `vacant_since` : la fin effective du dernier bail — résiliation, sinon terme ; jamais loué : `null`. */
    public function test_vacant_depuis_la_fin_du_dernier_bail_et_jamais_loue(): void
    {
        $resilie = $this->bienLoue($this->agency, $this->owner, 'Résilié');
        $this->bail($resilie, 'Ancien Un', ['status' => LeaseStatus::Expired, 'start_date' => '2025-01-01', 'end_date' => '2025-12-31']);
        $this->bail($resilie, 'Ancien Deux', ['status' => LeaseStatus::Terminated, 'terminated_at' => '2026-08-31 12:00:00']);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Échu'), 'Ancien Trois', ['status' => LeaseStatus::Expired, 'end_date' => '2026-09-30']);
        // Un bail actif dont le terme est passé n'occupe plus le bien.
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Terme passé'), 'Ancien Quatre', ['end_date' => '2026-10-31']);
        // Un bail en attente de signature n'occupe pas encore.
        $this->bail($this->bienLoue($this->agency, $this->owner, 'À signer'), 'Futur Locataire', ['status' => LeaseStatus::PendingSignature, 'start_date' => '2026-12-01', 'end_date' => '2027-11-30']);
        $this->bienLoue($this->agency, $this->owner, 'Jamais loué');

        $rows = $this->rows();
        $state = fn (string $t) => [$rows[$t]['occupancy']['state'], $rows[$t]['occupancy']['vacant_since']];
        $this->assertSame(['vacant', '2026-08-31'], $state('Résilié'));
        $this->assertSame(['vacant', '2026-09-30'], $state('Échu'));
        $this->assertSame(['vacant', '2026-10-31'], $state('Terme passé'));
        $this->assertSame(['vacant', null], $state('À signer'));
        $this->assertSame(['vacant', null], $state('Jamais loué'));
        $this->assertNull($rows['Jamais loué']['occupancy']['lease']);
        $this->assertNull($rows['Jamais loué']['occupancy']['tenant']);
        $this->assertNull($rows['Jamais loué']['occupancy']['current_month']);
    }

    /**
     * Plusieurs baux courants (lots) : le bien prend le plus récent — `start_date`, puis `id`. Le
     * bloc, le filtre `tenant` et le filtre `rent_late` lisent le même bail.
     */
    public function test_deux_baux_courants_le_plus_recent_l_emporte_partout(): void
    {
        $lots = $this->bienLoue($this->agency, $this->owner, 'Immeuble');
        $ancien = $this->bail($lots, 'Ancien Lot', ['start_date' => '2026-02-01']);
        $this->loyer($ancien, '2026-11-05', PaymentStatus::Late);
        $this->bail($lots, 'Récent Lot', ['start_date' => '2026-03-01']);

        $this->assertSame('Récent', $this->rows()['Immeuble']['occupancy']['tenant']['first_name']);
        $this->assertSame([], $this->titles('&filter[tenant]=ancien'));
        $this->assertSame(['Immeuble'], $this->titles('&filter[tenant]=récent'));
        $this->assertSame([], $this->titles('&filter[rent_late]=1'));

        // Même début : le plus grand identifiant.
        $jumeau = $this->bail($lots, 'Jumeau Lot', ['start_date' => '2026-03-01']);
        $this->assertSame($jumeau->id, $this->rows()['Immeuble']['occupancy']['lease']['id']);
    }

    public function test_filtre_d_occupation(): void
    {
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Occupé'), 'Ibou Sarr');
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Préavis'), 'Moussa Fall', ['status' => LeaseStatus::Terminating]);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Sortie demandée'), 'Aïda Ba', ['early_termination_requested_at' => '2026-11-01 10:00:00']);
        $this->bienLoue($this->agency, $this->owner, 'Vacant');

        // « Occupé » compte le bien en préavis : occupés + vacants = tous.
        $this->assertEqualsCanonicalizing(['Occupé', 'Préavis', 'Sortie demandée'], $this->titles('&filter[occupancy]=occupied'));
        $this->assertEqualsCanonicalizing(['Préavis', 'Sortie demandée'], $this->titles('&filter[occupancy]=notice'));
        $this->assertSame(['Vacant'], $this->titles('&filter[occupancy]=vacant'));

        $this->actingAsApi($this->admin);
        $this->getJson('/api/properties?filter[occupancy]=loue')->assertStatus(422);
        // ADR-0075 — une valeur en liste vaut un filtre absent.
        $this->assertCount(4, $this->getJson('/api/properties?filter[occupancy][]=vacant')->assertOk()->json('data'));
    }

    /** AC5 — le locataire du bail EN COURS seulement, casse repliée, prénom et nom. */
    public function test_ac5_filtre_locataire_sur_le_bail_en_cours(): void
    {
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Loué à Diouf'), 'Yacine DIOUF');
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Ex-Diouf'), 'Yacine DIOUF', ['status' => LeaseStatus::Terminated, 'terminated_at' => '2026-06-30 10:00:00']);
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Loué à Fall'), 'Moussa Fall');

        $this->assertSame(['Loué à Diouf'], $this->titles('&filter[tenant]=diouf'));
        $this->assertSame(['Loué à Diouf'], $this->titles('&filter[tenant]=Yacine Diouf'));
        $this->assertSame([], $this->titles('&filter[tenant]=yacine fall'));
    }

    /** `filter[rent_late]=1` et `sort=retard` : le loyer du mois en retard, le plus ancien d'abord. */
    public function test_filtre_et_tri_des_retards(): void
    {
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Retard 6 j'), 'Awa Ndiaye'), '2026-11-05', PaymentStatus::Late);
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Retard 9 j'), 'Moussa Fall'), '2026-11-02', PaymentStatus::Pending);
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Payé'), 'Fatou Diop'), '2026-11-05', PaymentStatus::Paid);
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'À venir'), 'Ibou Sarr'), '2026-11-20', PaymentStatus::Pending);
        // Un mois antérieur impayé n'est pas « le loyer du mois » (TCK-2637, état du mois).
        $this->loyer($this->bail($this->bienLoue($this->agency, $this->owner, 'Octobre impayé'), 'Aïda Ba'), '2026-10-05', PaymentStatus::Late);
        $this->bienLoue($this->agency, $this->owner, 'Vacant');

        $this->assertEqualsCanonicalizing(['Retard 6 j', 'Retard 9 j'], $this->titles('&filter[rent_late]=1'));
        $sorted = $this->titles('&sort=retard');
        $this->assertSame(['Retard 9 j', 'Retard 6 j'], array_slice($sorted, 0, 2));
        $this->assertCount(6, $sorted);

        $rows = $this->rows();
        $this->assertSame('due', $rows['À venir']['occupancy']['current_month']['status']);
        $this->assertSame('none', $rows['Octobre impayé']['occupancy']['current_month']['status']);
    }

    /** Rien n'est servi sans être demandé. */
    public function test_rien_sans_include_ni_champ(): void
    {
        $this->bail($this->bienLoue($this->agency, $this->owner, 'Occupé'), 'Ibou Sarr');
        $this->actingAsApi($this->admin);

        $row = $this->getJson('/api/properties?fields[properties]=id,title')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('occupancy', $row);
        $this->assertArrayNotHasKey('is_online', $row);
    }

    /** La fiche rend le même bloc sur `include=occupancy`. */
    public function test_la_fiche_rend_le_bloc_sur_demande(): void
    {
        $property = $this->bienLoue($this->agency, $this->owner, 'Fiche');
        $this->loyer($this->bail($property, 'Yacine DIOUF'), '2026-11-05', PaymentStatus::Late);
        $this->actingAsApi($this->admin);

        $this->assertArrayNotHasKey('occupancy', $this->getJson("/api/properties/{$property->id}")->assertOk()->json('data'));
        $occupancy = $this->getJson("/api/properties/{$property->id}?include=occupancy")->assertOk()->json('data.occupancy');
        $this->assertSame(['occupied', 'late', 6, 'DIOUF'], [$occupancy['state'], $occupancy['current_month']['status'], $occupancy['current_month']['days_late'], $occupancy['tenant']['last_name']]);
    }
}
