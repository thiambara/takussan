<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2654, lot 4 — « Mes factures » du prestataire nomme l'intervention et le bien de chaque
 * facture : `include=maintenanceRequest,property` les sert, réduits à leur titre ; sans `include`, la
 * ligne n'en porte pas la clé.
 */
class ServiceProviderBillNamesItsWorkTest extends TestCase
{
    use RefreshDatabase;

    private function factureDe(User $prestataire): ServiceProviderBill
    {
        $bien = Property::factory()->create(['title' => 'Bureaux à Ngor']);
        $bill = ServiceProviderBill::factory()->create(['provider_id' => $prestataire->id, 'property_id' => $bien->id]);
        $bill->maintenanceRequest->update(['title' => 'Groupe de sécurité du chauffe-eau', 'property_id' => $bien->id]);

        return $bill;
    }

    public function test_include_sert_le_titre_de_l_intervention_et_du_bien(): void
    {
        $prestataire = User::factory()->create();
        $bill = $this->factureDe($prestataire);

        $this->actingWithStepUp($prestataire);
        $this->getJson('/api/service-provider-bills?include=maintenanceRequest,property'
            .'&fields[service_provider_bills]=id,amount,status,maintenance_request_id,property_id'
            .'&fields[maintenance_requests]=id,title&fields[properties]=id,title')
            ->assertOk()
            ->assertJsonPath('data.0.id', $bill->id)
            ->assertJsonPath('data.0.maintenance_request', ['id' => $bill->maintenance_request_id, 'title' => 'Groupe de sécurité du chauffe-eau'])
            ->assertJsonPath('data.0.property', ['id' => $bill->property_id, 'title' => 'Bureaux à Ngor']);
    }

    public function test_sans_include_la_ligne_ne_porte_ni_l_intervention_ni_le_bien(): void
    {
        $prestataire = User::factory()->create();
        $this->factureDe($prestataire);

        $this->actingWithStepUp($prestataire);
        $ligne = $this->getJson('/api/service-provider-bills')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('maintenance_request', $ligne);
        $this->assertArrayNotHasKey('property', $ligne);
    }

    public function test_un_autre_prestataire_ne_lit_ni_la_facture_ni_ses_titres(): void
    {
        $this->factureDe(User::factory()->create());

        $this->actingWithStepUp(User::factory()->create());
        $this->getJson('/api/service-provider-bills?include=maintenanceRequest,property')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
