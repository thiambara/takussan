<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Support\Masking;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;

/**
 * TCK-2640 — la fiche d'un bailleur du carnet (`GET /api/owners/{id}`) : réservée à l'admin de
 * l'agence du profil (404 hors de l'agence, 403 pour l'agent et une agence `individual`), et ses
 * chiffres sont ceux du relevé servi (`/api/owner-statements`) pour la même période.
 */
class OwnerProfileShowTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-09-20 10:00:00');
    }

    private function profileOf(User $landlord, Agency $agency): OwnerProfile
    {
        return OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->firstOrFail();
    }

    public function test_l_admin_lit_la_fiche_et_ses_chiffres_sont_ceux_du_releve(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $this->septemberOf($lease);
        $profile = $this->profileOf($landlord, $agency);
        $profile->forceFill(['works_approval_threshold' => 75000])->save();
        Payout::factory()->create([
            'agency_id' => $agency->id, 'landlord_id' => $landlord->id, 'payee_role' => PayeeRole::Landlord,
            'status' => PayoutStatus::Completed, 'processed_at' => '2026-09-15 09:00:00', 'net_amount' => 50_000,
            'payment_method' => PaymentMethod::Wave,
        ]);

        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $data = $this->apiGet("/api/owners/{$profile->id}")->assertOk()->json('data');

        $this->assertSame($profile->id, $data['id']);
        $this->assertSame($landlord->id, $data['user_id']);
        $this->assertSame(1, $data['properties_count']);
        $this->assertSame(1, $data['occupied_properties_count']);
        $this->assertEquals(75000, $data['works_approval_threshold']);
        $this->assertEquals(8, $data['agency_commission_rate']);
        $this->assertEquals([10], $data['lease_commission_rates']);
        $this->assertSame('2026-09-15T09:00:00+00:00', $data['last_payout']['processed_at']);
        $this->assertEquals(50000, $data['last_payout']['net_amount']);
        $this->assertSame('wave', $data['last_payout']['payment_method']);

        // Les chiffres du mois : ceux que le bailleur lit sur son propre relevé.
        $this->assertSame('2026-09', $data['figures']['period']);
        $this->actingAs($landlord, 'sanctum');
        $totals = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data.totals');
        $this->assertEquals($totals['gross'], $data['figures']['collected']);
        $this->assertEquals($totals['commission'], $data['figures']['commission']);
        $this->assertEquals($totals['net'], $data['figures']['net']);
        $this->assertEquals($totals['paid_out'], $data['figures']['paid_out']);
        $this->assertEquals($totals['remaining_to_pay'], $data['figures']['remaining_to_pay']);
        $this->assertEquals(198000 - 50000, $data['figures']['remaining_to_pay']);

        // Une autre période, demandée explicitement.
        $this->actingAs($admin, 'sanctum');
        $this->apiGet("/api/owners/{$profile->id}?period=2026-08")->assertOk()
            ->assertJsonPath('data.figures.period', '2026-08')
            ->assertJsonPath('data.figures.net', 0);
        $this->apiGet("/api/owners/{$profile->id}?period=août")->assertUnprocessable();
    }

    /**
     * TCK-2641 — la fiche porte les identifiants sensibles MASQUÉS, jamais leur valeur (ADR-0044) :
     * la valeur ne sort que par `/sensitive`, journalisé. Un identifiant absent rend `null`.
     */
    public function test_la_fiche_rend_les_identifiants_masques_jamais_la_valeur(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $profile = $this->profileOf($landlord, $agency);
        $profile->forceFill(['rib' => 'SN08SN0100152000048500014471', 'tax_id' => '004567890 2G3', 'id_document_number' => null])->save();

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $response = $this->apiGet("/api/owners/{$profile->id}")->assertOk();
        $data = $response->json('data');

        $this->assertSame(Masking::iban('SN08SN0100152000048500014471'), $data['rib_masked']);
        $this->assertSame(Masking::tail('004567890 2G3'), $data['tax_id_masked']);
        $this->assertNull($data['id_document_number_masked']);
        $this->assertStringNotContainsString('0100152000048500', $response->getContent());
        $this->assertStringNotContainsString('004567890', $response->getContent());
        foreach (['rib', 'tax_id', 'id_document_number'] as $clear) {
            $this->assertArrayNotHasKey($clear, $data);
        }
    }

    public function test_un_bailleur_d_une_autre_agence_rend_404(): void
    {
        $agency = $this->moneyAgency();
        $other = $this->moneyAgency();
        $profile = $this->profileOf($this->landlordOf($other), $other);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiGet("/api/owners/{$profile->id}")->assertNotFound();
        $this->apiGet('/api/owners/999999999')->assertNotFound();
    }

    public function test_l_agent_de_l_agence_rend_403(): void
    {
        $agency = $this->moneyAgency();
        $profile = $this->profileOf($this->landlordOf($agency), $agency);

        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $this->apiGet("/api/owners/{$profile->id}")->assertForbidden();
        // L'autorisation précède la validation : un agent ne lit pas les règles du paramètre.
        $this->apiGet("/api/owners/{$profile->id}?period=août")->assertForbidden();
    }

    public function test_une_agence_individuelle_rend_403(): void
    {
        $agency = $this->moneyAgency(['kind' => 'individual']);
        $profile = OwnerProfile::factory()->create(['agency_id' => $agency->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->apiGet("/api/owners/{$profile->id}")->assertForbidden();
    }

    /**
     * Un bailleur n'est pas du personnel de l'agence (ADR-0031) : ni sa propre fiche du carnet ni
     * celle d'un autre bailleur n'existent pour lui — 404, il ne sonde pas les ids.
     */
    public function test_un_bailleur_de_l_agence_ne_lit_aucune_fiche_du_carnet(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $other = $this->profileOf($this->landlordOf($agency), $agency);

        $this->actingAs($landlord, 'sanctum');
        $this->getJson("/api/owners/{$this->profileOf($landlord, $agency)->id}")->assertNotFound();
        $this->getJson("/api/owners/{$other->id}")->assertNotFound();
    }

    public function test_un_brouillon_d_invitation_n_a_pas_de_chiffres(): void
    {
        $agency = $this->moneyAgency();
        $draft = OwnerProfile::factory()->draft()->create(['agency_id' => $agency->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $data = $this->apiGet("/api/owners/{$draft->id}")->assertOk()->json('data');

        $this->assertNull($data['user_id']);
        $this->assertNull($data['figures']);
        $this->assertSame(0, $data['properties_count']);
        $this->assertSame($draft->metadata['first_name'], $data['contact']['first_name']);
    }
}
