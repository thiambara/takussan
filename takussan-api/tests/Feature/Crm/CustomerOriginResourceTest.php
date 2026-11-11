<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2582 (ADR-0101) — la fiche dit d'où elle vient : `origin` (`include=origin` : la demande, sa
 * date, le message cité, le bien) et `interested_property` (`include=interestedProperty`). Au seul
 * personnel de l'agence de la fiche : le message n'est jamais recopié vers un compte hors du
 * personnel, ni par l'origine ni par la note `lead_message`.
 */
class CustomerOriginResourceTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** @return array{0: Customer, 1: PropertyContactLead, 2: Property, 3: Agency, 4: User} */
    private function ficheConvertie(): array
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'message' => 'Je suis fonctionnaire, disponible le samedi.',
        ]);

        Sanctum::actingAs($agent);
        $id = $this->postJson("/api/contact-leads/{$lead->id}/convert")->assertCreated()->json('customer.id');

        return [Customer::query()->findOrFail($id), $lead->fresh(), $bien, $x, $agent];
    }

    public function test_le_personnel_lit_l_origine_et_le_bien(): void
    {
        [$fiche, $lead, $bien, , $agent] = $this->ficheConvertie();

        Sanctum::actingAs($agent);
        $this->getJson("/api/customers/{$fiche->id}?include=origin,interestedProperty")
            ->assertOk()
            ->assertJsonPath('data.origin.contact_lead_id', $lead->id)
            ->assertJsonPath('data.origin.received_at', $lead->created_at->toIso8601String())
            ->assertJsonPath('data.origin.message', 'Je suis fonctionnaire, disponible le samedi.')
            ->assertJsonPath('data.origin.property.id', $bien->id)
            ->assertJsonPath('data.origin.property.slug', $bien->slug)
            ->assertJsonPath('data.interested_property.id', $bien->id)
            ->assertJsonPath('data.interested_property.title', $bien->title);
    }

    /** Sous `fields[customers]` sans l'agence, l'origine reste servie au personnel (fiche relue). */
    public function test_sous_sparse_fieldsets_sans_agence(): void
    {
        [$fiche, $lead, $bien, , $agent] = $this->ficheConvertie();

        Sanctum::actingAs($agent);
        $this->getJson('/api/customers?include=origin,interestedProperty&fields[customers]=id,first_name,source_contact_lead_id,interested_property_id')
            ->assertOk()
            ->assertJsonPath('data.0.id', $fiche->id)
            ->assertJsonPath('data.0.origin.contact_lead_id', $lead->id)
            ->assertJsonPath('data.0.interested_property.id', $bien->id);
    }

    /** Sans `include`, ni clé ni requête de plus. */
    public function test_sans_include_rien(): void
    {
        [$fiche, , , , $agent] = $this->ficheConvertie();

        Sanctum::actingAs($agent);
        $data = $this->getJson("/api/customers/{$fiche->id}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('origin', $data);
        $this->assertArrayNotHasKey('interested_property', $data);
    }

    /**
     * Le bailleur AUTEUR d'une fiche de l'agence la lit (TCK-591 §9), mais ni l'origine ni la note
     * `lead_message` : ce que le prospect a écrit à l'agence reste au personnel.
     */
    public function test_le_bailleur_auteur_ne_lit_ni_l_origine_ni_le_message(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x, 'agency_admin');
        $bailleur = $this->bailleur($x);
        $fiche = $this->ficheClient($x, null, ['added_by_id' => $bailleur->id, 'phone' => '+221778103538', 'email' => null]);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'phone' => '+221778103538', 'message' => 'Message confidentiel à l\'agence.',
        ]);
        Sanctum::actingAs($agent);
        $this->postJson("/api/contact-leads/{$lead->id}/convert", ['customer_id' => $fiche->id])->assertCreated();

        Sanctum::actingAs($bailleur);
        $data = $this->getJson("/api/customers/{$fiche->id}?include=origin,interestedProperty,notes")->assertOk()->json('data');
        $this->assertArrayNotHasKey('origin', $data);
        $this->assertArrayNotHasKey('interested_property', $data);
        $this->assertStringNotContainsString('confidentiel', json_encode($data['notes'] ?? []));

        $notes = $this->getJson("/api/customers/{$fiche->id}/notes")->assertOk()->json('data');
        $this->assertSame([], $notes);

        // Le personnel, lui, lit la note.
        Sanctum::actingAs($agent);
        $this->getJson("/api/customers/{$fiche->id}/notes")->assertOk()
            ->assertJsonPath('data.0.kind', 'lead_message')
            ->assertJsonPath('data.0.body', 'Message confidentiel à l\'agence.');
    }
}
