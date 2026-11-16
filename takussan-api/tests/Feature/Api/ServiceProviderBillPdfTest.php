<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2897 (ADR-0099, amendement du 2026-11-15) — `GET service-provider-bills/{bill}/pdf` : le PDF d'une
 * facture d'intervention, au prestataire de la facture (brouillon compris), au personnel de l'agence
 * (hors brouillon) et au bailleur du bien pour une facture qui lui est refacturée (validée ou payée).
 * Un autre prestataire de l'agence : 403 ; hors de l'agence : 404. Le coffre du prestataire le sert.
 */
class ServiceProviderBillPdfTest extends TestCase
{
    use MaintenanceActors;
    use RefreshDatabase;

    /** @return array{bill: ServiceProviderBill, provider: User, landlord: User, agency: Agency, property: Property} */
    private function scenario(array $attributes = []): array
    {
        ['agency' => $agency, 'property' => $property, 'landlord' => $landlord, 'provider' => $provider, 'mr' => $mr] = $this->maintenanceScenario(MaintenanceStatus::Completed);
        $bill = ServiceProviderBill::factory()->create(array_merge([
            'maintenance_request_id' => $mr->id,
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'provider_id' => $provider->id,
            'reference_number' => 'SPB-TCK2897',
            'amount' => 185_000,
            'status' => ServiceProviderBillStatus::PendingValidation,
        ], $attributes));

        return compact('bill', 'provider', 'landlord', 'agency', 'property');
    }

    public function test_ac4_le_prestataire_auteur_recoit_le_pdf_de_sa_facture_en_xof_sans_sous_unite(): void
    {
        ['bill' => $bill, 'provider' => $provider] = $this->scenario();

        $pdf = Pdf::fake();
        Sanctum::actingAs($provider);
        $reponse = $this->get("/api/service-provider-bills/{$bill->id}/pdf");

        $reponse->assertOk();
        $this->assertStringStartsWith('application/pdf', (string) $reponse->headers->get('Content-Type'));
        $html = (string) $pdf->html;
        $this->assertStringContainsString('SPB-TCK2897', $html);
        $this->assertMatchesRegularExpression('/185\D{1,3}000/u', $html);
        $this->assertDoesNotMatchRegularExpression('/185\D{1,3}000[,.]00/u', $html);
    }

    /** Le gabarit se rend pour de vrai (pilote local, sans double) : un PDF, pas seulement du HTML. */
    public function test_le_pdf_se_rend_sous_le_vrai_pilote(): void
    {
        ['bill' => $bill, 'provider' => $provider] = $this->scenario(['provider_reference' => 'FAC-2026-118']);

        Sanctum::actingAs($provider);
        $reponse = $this->get("/api/service-provider-bills/{$bill->id}/pdf");

        $reponse->assertOk();
        $this->assertStringStartsWith('%PDF', (string) $reponse->getContent());
    }

    public function test_ac4_le_prestataire_lit_aussi_son_brouillon_que_le_personnel_ne_lit_pas(): void
    {
        ['bill' => $bill, 'provider' => $provider, 'agency' => $agency] = $this->scenario(['status' => ServiceProviderBillStatus::Draft]);

        Pdf::fake();
        Sanctum::actingAs($provider);
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertOk();

        Sanctum::actingAs($this->agentOf($agency));
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertNotFound();
    }

    public function test_ac4_le_personnel_de_l_agence_recoit_le_pdf(): void
    {
        ['bill' => $bill, 'agency' => $agency] = $this->scenario();

        Pdf::fake();
        Sanctum::actingAs($this->agentOf($agency));
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertOk();
    }

    public function test_ac4_un_autre_prestataire_de_l_agence_403_et_hors_agence_404(): void
    {
        ['bill' => $bill, 'agency' => $agency] = $this->scenario();
        ['agency' => $ailleurs] = $this->maintenanceScenario();

        Pdf::fake();
        Sanctum::actingAs($this->providerFor($agency));
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertForbidden();

        Sanctum::actingAs($this->providerFor($ailleurs));
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertNotFound();

        Sanctum::actingAs($this->agentOf($ailleurs));
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertNotFound();

        Sanctum::actingAs(User::factory()->create());
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertNotFound();
    }

    public function test_le_bailleur_du_bien_lit_la_facture_qui_lui_est_refacturee_et_seulement_elle(): void
    {
        ['bill' => $bill, 'landlord' => $landlord] = $this->scenario(['status' => ServiceProviderBillStatus::Validated, 'rechargeable_to_landlord' => true]);

        Pdf::fake();
        Sanctum::actingAs($landlord);
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertOk();

        // Non refacturable : la facture ne lui est pas imputée.
        $bill->forceFill(['rechargeable_to_landlord' => false])->save();
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertForbidden();

        // Refacturable mais pas encore validée : elle ne lui est pas (encore) imputée.
        $bill->forceFill(['rechargeable_to_landlord' => true, 'status' => ServiceProviderBillStatus::PendingValidation])->save();
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertForbidden();

        // Un autre bailleur de l'agence : rien ne le relie à la facture.
        $bill->forceFill(['status' => ServiceProviderBillStatus::Paid])->save();
        Sanctum::actingAs($this->landlordOf($bill->agency));
        $this->get("/api/service-provider-bills/{$bill->id}/pdf")->assertNotFound();
    }

    public function test_l_entree_du_coffre_sert_ce_pdf(): void
    {
        ['bill' => $bill, 'provider' => $provider] = $this->scenario();
        $profile = ServiceProviderProfile::query()->where('user_id', $provider->id)->sole();

        Pdf::fake();
        Sanctum::actingAs($provider);
        $bills = collect($this->withHeader('X-Profile-Id', "service_provider:{$profile->id}")
            ->getJson('/api/me/document-vault')->assertOk()->json('data.folders'))->firstWhere('key', 'bills');

        $this->assertSame(["/api/service-provider-bills/{$bill->id}/pdf"], array_column($bills['entries'], 'download_path'));
        $this->get($bills['entries'][0]['download_path'])->assertOk();
    }
}
