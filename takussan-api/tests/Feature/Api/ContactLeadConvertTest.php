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
            ->assertJsonPath('code', 'lead.already_converted')
            // P182.03 (TCK-1824) — le 409 porte la fiche, sous la forme du 201 : un écran dont la
            // première réponse s'est perdue la montre au lieu d'une erreur.
            ->assertJsonPath('customer.id', $customer->id);
        $this->assertSame(1, Customer::query()->where('agency_id', $x->id)->count());
    }

    /**
     * Vérification adverse (m2) — une demande SANS agence ne devient pas une fiche de l'agence
     * active de l'acteur : 422 codé, aucune fiche.
     */
    public function test_m2_une_demande_sans_agence_ne_se_convertit_pas(): void
    {
        $z = $this->agence();
        $bailleur = $this->bailleur($z);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe(null, $bailleur)->id, 'agency_id' => null, 'recipient_user_id' => $bailleur->id,
        ]);

        Sanctum::actingAs($bailleur);
        $this->postJson("/api/contact-leads/{$lead->id}/convert")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'lead.without_agency');
        $this->assertDatabaseCount('customers', 0);
        $this->assertNull($lead->fresh()->customer_id);
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

    /**
     * TCK-1343 (P125.02) — une fiche de l'agence au même téléphone : la conversion rend 409
     * `customer.duplicate` avec `existing`, comme la création à la main, et ne crée rien ;
     * `allow_duplicate` la force.
     */
    public function test_un_doublon_au_meme_telephone_rend_409_sauf_allow_duplicate(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $existante = Customer::factory()->create([
            'agency_id' => $x->id, 'added_by_id' => $agent->id, 'phone' => '77 123 45 67', 'email' => null,
        ]);
        $this->assertSame('+221771234567', $existante->fresh()->phone);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Awa Diop', 'email' => 'awa@example.com', 'phone' => '+221771234567',
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/contact-leads/{$lead->id}/convert")
            ->assertStatus(409)
            ->assertJsonPath('code', 'customer.duplicate')
            ->assertJsonPath('existing.0.id', $existante->id)
            ->assertJsonPath('existing.0.matched_on', 'phone');
        $this->assertSame(1, Customer::query()->where('agency_id', $x->id)->count());
        $this->assertNull($lead->fresh()->customer_id);
        $this->assertNull($lead->fresh()->handled_at);

        $response = $this->postJson("/api/contact-leads/{$lead->id}/convert", ['allow_duplicate' => true])
            ->assertCreated();
        $this->assertNotSame($existante->id, $response->json('customer.id'));
        $this->assertSame(2, Customer::query()->where('agency_id', $x->id)->count());
    }

    /** TCK-1343 — même règle sur l'e-mail replié, comme `CustomerDuplicateDetector`. */
    public function test_un_doublon_au_meme_email_rend_409(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        Customer::factory()->create([
            'agency_id' => $x->id, 'added_by_id' => $agent->id, 'phone' => null, 'email' => 'Awa@Example.com',
        ]);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Awa Diop', 'email' => 'awa@example.com', 'phone' => null,
        ]);

        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert")
            ->assertStatus(409)
            ->assertJsonPath('existing.0.matched_on', 'email');
        $this->assertSame(1, Customer::query()->where('agency_id', $x->id)->count());
    }

    /** TCK-1343 — `allow_duplicate` se valide comme à la création : un booléen. */
    public function test_allow_duplicate_doit_etre_un_booleen(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
        ]);

        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['allow_duplicate' => 'oui'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('allow_duplicate');
    }
}
