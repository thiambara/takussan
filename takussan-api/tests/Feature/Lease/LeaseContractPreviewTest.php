<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2906 (AC5) — `POST /api/leases/contract-preview` rend le contrat que la création écrirait, depuis le
 * formulaire, SANS RIEN ÉCRIRE : ni bail, ni garant rattaché, ni média, ni journal. L'autorisation
 * (`LeasePolicy::createOn` sur le bien) précède la validation, qui est celle de la création ; les refus du
 * locataire et du garant sont ceux de la création.
 */
class LeaseContractPreviewTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Property $property;

    private Customer $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->agent = $this->agencyAgent($this->agency);
        $this->property = $this->bienLoue($this->agency, $this->bailleur($this->agency), 'Villa Ngor');
        $this->tenant = Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Awa', 'last_name' => 'Diopsène']);
    }

    /** @return array<string, mixed> */
    private function formulaire(array $extra = []): array
    {
        return $extra + [
            'property_id' => $this->property->id,
            'tenant_id' => $this->tenant->id,
            'type' => 'residential_rent',
            'start_date' => '2026-12-01',
            'end_date' => '2027-11-30',
            'monthly_rent' => 487000,
            'deposit_amount' => 974000,
            'notice_period_days' => 90,
        ];
    }

    /** @return array<string, int> */
    private function comptes(): array
    {
        return collect(['leases', 'media', 'activity_log', 'lease_guarantor', 'documents'])
            ->mapWithKeys(fn (string $table) => [$table => DB::table($table)->count()])->all();
    }

    public function test_ac5_le_contrat_de_l_apercu_porte_le_locataire_et_le_loyer_et_rien_n_est_ecrit(): void
    {
        $garant = Guarantor::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id, 'first_name' => 'Moussa', 'last_name' => 'Garantfall']);
        $avant = $this->comptes();
        $pdf = Pdf::fake();

        $reponse = $this->actingAsApi($this->agent)->post('/api/leases/contract-preview', $this->formulaire(['guarantor_id' => $garant->id]));

        $reponse->assertOk();
        $this->assertStringStartsWith('application/pdf', (string) $reponse->headers->get('Content-Type'));
        $html = (string) $pdf->html;
        $this->assertStringContainsString('Diopsène', $html);
        $this->assertMatchesRegularExpression('/487\D{1,3}000/u', $html, 'le loyer du formulaire');
        $this->assertStringContainsString('90 jour(s) (3 mois)', $html, 'le préavis du formulaire');
        $this->assertStringContainsString('Garantfall', $html, 'le garant du formulaire');
        $this->assertStringContainsString('aperçu, bail non encore créé', $html);
        $this->assertSame($avant, $this->comptes(), 'aucune ligne écrite');
    }

    public function test_ac5_sans_le_droit_d_ouvrir_un_bail_sur_ce_bien_403_meme_pour_un_corps_invalide(): void
    {
        $etranger = $this->agencyAgent($this->agence());

        $this->actingAsApi($etranger)->postJson('/api/leases/contract-preview', $this->formulaire())->assertForbidden();
        $this->actingAsApi($etranger)->postJson('/api/leases/contract-preview', $this->formulaire(['notice_period_days' => 0]))->assertForbidden();
        $this->actingAsApi($etranger)->postJson('/api/leases/contract-preview', ['property_id' => $this->property->id])->assertForbidden();
    }

    public function test_les_regles_sont_celles_de_la_creation(): void
    {
        $this->actingAsApi($this->agent)->postJson('/api/leases/contract-preview', $this->formulaire(['notice_period_days' => 400]))
            ->assertUnprocessable()->assertJsonValidationErrors('notice_period_days');
        $this->actingAsApi($this->agent)->postJson('/api/leases/contract-preview', $this->formulaire(['start_date' => null]))
            ->assertUnprocessable()->assertJsonValidationErrors('start_date');
    }

    /** Le locataire d'une autre agence ne s'imprime pas : le refus de la création, avant tout rendu. */
    public function test_un_locataire_hors_de_l_agence_du_bien_est_refuse(): void
    {
        $ailleurs = Customer::factory()->create(['agency_id' => $this->agence()->id, 'last_name' => 'Ailleursdiop']);
        $pdf = Pdf::fake();

        $this->actingAsApi($this->agent)->postJson('/api/leases/contract-preview', $this->formulaire(['tenant_id' => $ailleurs->id]))
            ->assertForbidden();
        $this->assertStringNotContainsString('Ailleursdiop', (string) $pdf->html);
    }
}
