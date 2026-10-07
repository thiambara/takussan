<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\ContactLeadChannel;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 AC16 — une demande devient une fiche client de l'agence de la demande, à l'étape `lead`,
 * nom découpé, `customer_id` posé et demande traitée ; une seconde conversion est refusée.
 */
class ContactLeadConvertTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_convertir_cree_la_fiche_dans_l_agence_de_la_demande(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Awa Diop Ndiaye', 'email' => 'awa@example.com', 'phone' => '+221771234567',
        ]);

        Sanctum::actingAs($agent);

        $response = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated();

        $customer = Customer::query()->findOrFail($response->json('customer.id'));
        $this->assertSame($x->id, $customer->agency_id);
        $this->assertSame('lead', $customer->pipeline_stage->value);
        $this->assertSame('Awa', $customer->first_name);
        $this->assertSame('Diop Ndiaye', $customer->last_name);
        $this->assertSame('+221771234567', $customer->phone);
        $this->assertSame('awa@example.com', $customer->email);

        $lead->refresh();
        $this->assertSame($customer->id, $lead->customer_id);
        $this->assertNotNull($lead->handled_at);
        $this->assertSame($agent->id, $lead->handled_by_id);

        $this->postJson("/api/contact-leads/{$lead->id}/convert")
            ->assertStatus(409)
            ->assertJsonPath('code', 'lead_already_converted');
        $this->assertSame(1, Customer::query()->where('agency_id', $x->id)->count());
    }

    public function test_un_clic_ne_se_convertit_pas_et_un_tiers_est_refuse(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $clic = PropertyContactLead::factory()->click(ContactLeadChannel::Call)->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
        ]);

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->postJson("/api/contact-leads/{$clic->id}/convert")->assertForbidden();

        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$clic->id}/convert")->assertUnprocessable();
        $this->assertDatabaseCount('customers', 0);
    }
}
