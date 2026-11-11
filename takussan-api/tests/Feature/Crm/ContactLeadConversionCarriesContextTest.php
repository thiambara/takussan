<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2582 (ADR-0101) — la demande devient le dossier : la conversion (ou le rattachement à une
 * fiche existante) emporte le message en note épinglée `lead_message` datée de la demande, le bien
 * qui a fait venir la personne, son origine, et les critères VIDES déduits du bien — jamais un
 * critère déjà saisi.
 */
class ContactLeadConversionCarriesContextTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private function pieceDeOuakam(Agency $agency): Property
    {
        $bien = $this->bienDe($agency);
        $bien->update(['type' => PropertyType::Room->value, 'price' => 85000, 'rent_period' => RentPeriod::Monthly->value]);
        $bien->address()->create(['neighborhood' => 'Ouakam', 'city' => 'Dakar', 'country' => 'SN']);

        return $bien->fresh();
    }

    /** AC1 — la fiche porte le bien, la note épinglée qui cite le message, les critères déduits. */
    public function test_ac1_la_conversion_emporte_message_bien_et_criteres(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $piece = $this->pieceDeOuakam($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $piece->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Mouhamed Dieng', 'phone' => '+221778103538', 'email' => null,
            'message' => 'Bonjour, je suis fonctionnaire et la pièce m\'intéresse.',
            'source' => 'facebook', 'medium' => 'social',
            'created_at' => now()->subDays(3),
        ]);

        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');

        $fiche = Customer::query()->findOrFail($id);
        $this->assertSame($piece->id, $fiche->interested_property_id);
        $this->assertSame($lead->id, $fiche->source_contact_lead_id);
        $this->assertSame('rent', $fiche->seeking_contract_type);
        $this->assertSame(['room'], $fiche->seeking_property_types);
        $this->assertContains('Ouakam', $fiche->seeking_neighborhoods);
        $this->assertSame('102000.00', (string) $fiche->budget_max);
        $this->assertEquals(['source' => 'facebook', 'medium' => 'social'], $fiche->metadata['origin'] ?? null);

        $note = CustomerNote::query()->where('customer_id', $id)->sole();
        $this->assertSame(CustomerNoteKind::LeadMessage, $note->kind);
        $this->assertTrue($note->pinned);
        $this->assertStringContainsString('je suis fonctionnaire', $note->body);
        // Datée de la demande, pas de la conversion.
        $this->assertSame($lead->fresh()->created_at->toIso8601String(), $note->created_at->toIso8601String());
    }

    /** AC2 et rattachement — un critère déjà saisi reste ; seuls les critères vides sont remplis. */
    public function test_ac2_le_rattachement_garde_les_criteres_saisis(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $piece = $this->pieceDeOuakam($x);
        $existante = $this->ficheClient($x, null, [
            'added_by_id' => $agent->id, 'phone' => '+221778103538', 'email' => null,
            'budget_max' => 150000, 'seeking_neighborhoods' => ['Mermoz'],
        ]);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $piece->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Awa Ndiaye', 'phone' => '+221778103538', 'email' => null,
            'message' => 'Toujours intéressée, je suis fonctionnaire.',
        ]);

        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['customer_id' => $existante->id])
            ->assertCreated()
            ->assertJsonPath('customer.id', $existante->id);

        $fiche = $existante->fresh();
        $this->assertSame('150000.00', (string) $fiche->budget_max);
        $this->assertSame(['Mermoz'], $fiche->seeking_neighborhoods);
        // Les critères vides sont remplis, comme à la conversion.
        $this->assertSame('rent', $fiche->seeking_contract_type);
        $this->assertSame($piece->id, $fiche->interested_property_id);
        $this->assertSame(1, CustomerNote::query()->where('customer_id', $existante->id)
            ->where('kind', CustomerNoteKind::LeadMessage->value)->count());
        $this->assertSame($existante->id, $lead->fresh()->customer_id);
        $this->assertNotNull($lead->fresh()->handled_at);
        $this->assertSame(1, Customer::query()->where('agency_id', $x->id)->count());
    }

    /** La première demande reste l'origine : une seconde demande rattachée ne la réécrit pas. */
    public function test_une_seconde_demande_ne_reecrit_pas_l_origine(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $premier = $this->bienDe($x);
        $second = $this->bienDe($x);
        $l1 = PropertyContactLead::factory()->create(['property_id' => $premier->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id, 'phone' => '+221778100001']);
        $l2 = PropertyContactLead::factory()->create(['property_id' => $second->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id, 'phone' => '+221778100001']);

        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$l1->id}/convert")->assertCreated()->json('customer.id');
        $this->postJson("/api/contact-leads/{$l2->id}/convert", ['customer_id' => $id])->assertCreated();

        $fiche = Customer::query()->findOrFail($id);
        $this->assertSame($l1->id, $fiche->source_contact_lead_id);
        $this->assertSame($premier->id, $fiche->interested_property_id);
        $this->assertSame(2, CustomerNote::query()->where('customer_id', $id)->where('kind', 'lead_message')->count());
    }

    /** AC5 — rejouer la conversion rend 409 et n'ajoute pas de seconde note. */
    public function test_ac5_rejouer_n_ajoute_pas_de_seconde_note(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
        ]);

        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');
        $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertStatus(409)->assertJsonPath('code', 'lead.already_converted');
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['customer_id' => $id])->assertStatus(409);

        $this->assertSame(1, CustomerNote::query()->where('customer_id', $id)->where('kind', 'lead_message')->count());
    }

    /** Une demande sur un agent (sans bien) se convertit : la note, sans bien ni critère déduit. */
    public function test_une_demande_sans_bien_se_convertit(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => null, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'message' => 'Je cherche un appartement.',
        ]);

        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');

        $fiche = Customer::query()->findOrFail($id);
        $this->assertNull($fiche->interested_property_id);
        $this->assertSame($lead->id, $fiche->source_contact_lead_id);
        $this->assertNull($fiche->seeking_contract_type);
        $this->assertSame(1, CustomerNote::query()->where('customer_id', $id)->where('kind', 'lead_message')->count());
    }

    /** Un loyer à la nuit ne dit rien d'un budget mensuel : pas de budget déduit. */
    public function test_un_loyer_a_la_nuit_ne_deduit_pas_de_budget(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $bien->update(['price' => 30000, 'rent_period' => RentPeriod::Daily->value]);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id]);

        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');

        $this->assertNull(Customer::query()->findOrFail($id)->budget_max);
    }

    /** Le rattachement à la fiche d'une autre agence est refusé : 403, avant la validation. */
    public function test_le_rattachement_a_une_fiche_d_une_autre_agence_est_refuse(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $ailleurs = $this->ficheClient($this->agence());
        $lead = PropertyContactLead::factory()->create(['property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id]);

        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['customer_id' => $ailleurs->id, 'allow_duplicate' => 'pas-un-booléen'])
            ->assertForbidden();
        $this->assertNull($lead->fresh()->customer_id);
        $this->assertSame(0, CustomerNote::query()->count());
    }
}
