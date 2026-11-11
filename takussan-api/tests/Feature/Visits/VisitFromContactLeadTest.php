<?php

namespace Tests\Feature\Visits;

use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\PlatformProfile;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Membership\SystemRoleCapabilities;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2582 (ADR-0101) — la visite naît de la demande : `POST /api/property-visits` reçoit
 * `contact_lead_id`. Le bien vient de la demande ; avec `create_customer`, la demande est convertie
 * et la visite rattachée à la fiche ; sans, le nom et le téléphone viennent de la demande ; la
 * demande est marquée traitée ; la visite naît confirmée. Hors de l'agence de la demande : 403.
 */
class VisitFromContactLeadTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** AC4 — une fiche neuve, portant la note `lead_message`, et la visite confirmée rattachée. */
    public function test_ac4_avec_create_customer_la_demande_devient_la_fiche_de_la_visite(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Mouhamed Dieng', 'phone' => '+221778103538', 'message' => 'Je suis fonctionnaire.',
            'source' => 'facebook',
        ]);

        Sanctum::actingAs($agent);
        $response = $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id,
            'scheduled_at' => $this->creneau(),
            'create_customer' => true,
        ])->assertCreated()
            ->assertJsonPath('data.status', VisitStatus::Confirmed->value)
            ->assertJsonPath('data.property_id', $bien->id);

        $lead->refresh();
        $visit = PropertyVisit::query()->findOrFail($response->json('data.id'));
        $this->assertNotNull($lead->customer_id);
        $this->assertNotNull($lead->handled_at);
        $this->assertSame($lead->customer_id, $visit->customer_id);
        $this->assertSame($lead->id, $visit->contact_lead_id);
        $this->assertSame('facebook', $visit->source);
        $this->assertSame($agent->id, $visit->agent_id);
        $this->assertSame('+221778103538', $visit->visitor_phone);
        $this->assertSame(1, CustomerNote::query()->where('customer_id', $lead->customer_id)->where('kind', 'lead_message')->count());
        $this->assertSame($bien->id, Customer::query()->findOrFail($lead->customer_id)->interested_property_id);
    }

    /** Sans `create_customer` : pas de fiche, le visiteur vient de la demande, qui est traitée. */
    public function test_sans_create_customer_le_visiteur_vient_de_la_demande(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'name' => 'Mouhamed Dieng', 'phone' => '77 810 35 38', 'email' => 'm.dieng@example.com',
        ]);

        Sanctum::actingAs($agent);
        $id = $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id,
            'scheduled_at' => $this->creneau(),
        ])->assertCreated()->json('data.id');

        $visit = PropertyVisit::query()->findOrFail($id);
        $this->assertSame(VisitStatus::Confirmed, $visit->status);
        $this->assertNull($visit->customer_id);
        $this->assertSame('Mouhamed Dieng', $visit->visitor_name);
        $this->assertSame('+221778103538', $visit->visitor_phone);
        $this->assertSame('m.dieng@example.com', $visit->visitor_email);
        $this->assertSame($lead->id, $visit->contact_lead_id);
        $this->assertNull($lead->fresh()->customer_id);
        $this->assertNotNull($lead->fresh()->handled_at);
        $this->assertSame($agent->id, $lead->fresh()->handled_by_id);
        $this->assertSame(0, Customer::query()->count());
    }

    /** Une demande déjà convertie : la visite rejoint sa fiche, sans seconde conversion. */
    public function test_une_demande_deja_convertie_rattache_la_visite_a_sa_fiche(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $fiche = $this->ficheClient($x);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id,
            'customer_id' => $fiche->id, 'handled_at' => now()->subDay(),
        ]);

        Sanctum::actingAs($agent);
        $id = $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => $this->creneau(), 'create_customer' => true,
        ])->assertCreated()->json('data.id');

        $this->assertSame($fiche->id, PropertyVisit::query()->findOrFail($id)->customer_id);
        $this->assertSame(1, Customer::query()->count());
    }

    /** Un agent d'une autre agence : 403, même sur un corps mal formé (l'autorisation prime). */
    public function test_hors_agence_403_avant_la_validation(): void
    {
        $x = $this->agence();
        $bien = $this->bienDe($x);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id]);
        $autre = $this->personnel($this->agence(), 'agency_admin');

        Sanctum::actingAs($autre);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => 'pas-une-date', 'create_customer' => true,
        ])->assertForbidden();

        // Versant autorisé : le même corps mal formé, par le personnel de l'agence → 422.
        Sanctum::actingAs($this->personnel($x, 'agency_admin'));
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => 'pas-une-date', 'create_customer' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);

        $this->assertNull($lead->fresh()->handled_at);
        $this->assertSame(0, PropertyVisit::query()->count());
    }

    /** Le bien donné doit être de l'agence de la demande : un bien d'une autre agence → 403. */
    public function test_un_bien_d_une_autre_agence_que_la_demande_est_refuse(): void
    {
        $x = $this->agence();
        $y = $this->agence();
        $lead = PropertyContactLead::factory()->create(['property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id]);
        $agentY = $this->personnel($y, 'agency_admin');

        Sanctum::actingAs($agentY);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'property_id' => $this->bienDe($y)->id, 'scheduled_at' => $this->creneau(),
            'visitor_name' => 'X', 'visitor_phone' => '+221771234567',
        ])->assertForbidden();
    }

    /** Une demande sur un agent (sans bien) : la visite exige `property_id` → 422. */
    public function test_une_demande_sans_bien_exige_property_id(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $lead = PropertyContactLead::factory()->create(['property_id' => null, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id]);

        Sanctum::actingAs($agent);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => $this->creneau(), 'create_customer' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors(['property_id']);

        $this->assertNull($lead->fresh()->customer_id);
        $this->assertNull($lead->fresh()->handled_at);
    }

    /** Un créneau pris (chevauchement) : rien n'est écrit — ni fiche, ni note, ni demande traitée. */
    public function test_un_chevauchement_ne_laisse_pas_une_demande_convertie_sans_visite(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $creneau = $this->creneau();
        PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'status' => VisitStatus::Confirmed->value,
            'scheduled_at' => $creneau, 'duration_minutes' => 60,
        ]);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id]);

        Sanctum::actingAs($agent);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => $creneau, 'create_customer' => true,
        ])->assertStatus(422)->assertJsonPath('code', 'visit.slot_overlap');

        $this->assertNull($lead->fresh()->customer_id);
        $this->assertNull($lead->fresh()->handled_at);
        $this->assertSame(0, Customer::query()->count());
        $this->assertSame(0, CustomerNote::query()->count());
    }

    /** Un visiteur qui réserve pour lui-même ne cite jamais une demande : 403. */
    public function test_un_visiteur_ne_cite_pas_une_demande(): void
    {
        $x = $this->agence();
        $bien = $this->bienDe($x);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id]);

        Sanctum::actingAs($this->client());
        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'contact_lead_id' => $lead->id, 'scheduled_at' => $this->creneau(),
        ])->assertForbidden();
        $this->assertNull($lead->fresh()->handled_at);
    }

    /**
     * Le bailleur destinataire LIT et CONVERTIT la demande sur son bien, mais n'est pas du personnel :
     * il ne planifie pas une visite confirmée depuis elle (`managesProperty`) → 403.
     */
    public function test_le_bailleur_destinataire_ne_planifie_pas_depuis_la_demande(): void
    {
        $x = $this->agence();
        $bailleur = $this->bailleur($x);
        $bien = $this->bienDe($x, $bailleur);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $bailleur->id]);
        $this->assertTrue($bailleur->can('convert', $lead));

        Sanctum::actingAs($bailleur);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'scheduled_at' => $this->creneau(), 'create_customer' => true,
        ])->assertForbidden();
        $this->assertNull($lead->fresh()->handled_at);
    }

    /** Le super-admin convertit toute demande, mais pas vers le bien d'une autre agence que la sienne → 403. */
    public function test_le_bien_doit_etre_de_l_agence_de_la_demande_meme_pour_le_super_admin(): void
    {
        $x = $this->agence();
        $lead = PropertyContactLead::factory()->create(['property_id' => $this->bienDe($x)->id, 'agency_id' => $x->id]);
        $super = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $super->id]);
        $this->assertTrue($super->fresh()->can('convert', $lead));

        Sanctum::actingAs($super->fresh());
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'property_id' => $this->bienDe($this->agence())->id,
            'scheduled_at' => $this->creneau(), 'create_customer' => true,
        ])->assertForbidden();
        $this->assertNull($lead->fresh()->customer_id);
    }

    /** Rattacher depuis la visite suit la route `convert` : un clic ne devient l'origine de rien → 422. */
    public function test_un_clic_ne_se_rattache_pas_depuis_la_visite(): void
    {
        $x = $this->agence();
        $agent = $this->personnel($x, 'agency_admin');
        $bien = $this->bienDe($x);
        $fiche = $this->ficheClient($x);
        $clic = PropertyContactLead::factory()->click(ContactLeadChannel::Call)->create(['property_id' => $bien->id, 'agency_id' => $x->id]);

        Sanctum::actingAs($agent);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $clic->id, 'customer_id' => $fiche->id, 'scheduled_at' => $this->creneau(),
        ])->assertUnprocessable()->assertJsonPath('code', 'lead.not_convertible');
        $this->assertNull($fiche->fresh()->source_contact_lead_id);
        $this->assertSame(0, PropertyVisit::query()->count());
    }

    /** Un agent n'écrit pas la demande dans la fiche d'un collègue qu'il ne lit pas → 403, rien d'écrit. */
    public function test_le_rattachement_exige_de_lire_la_fiche(): void
    {
        $x = $this->agence();
        // Un agent sans `crm.view_all` : il ne lit que ses propres fiches.
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)->withCapabilities(array_values(array_filter(
            app(SystemRoleCapabilities::class)->for(AgencyRoleBaseType::Agent),
            static fn (Capability $c): bool => $c !== Capability::CrmViewAll,
        )))->create(['agency_id' => $x->id]);
        $agent = $this->personnel($x, 'agent', $role);
        $collegue = $this->personnel($x);
        $bien = $this->bienDe($x);
        $fiche = $this->ficheClient($x, null, ['added_by_id' => $collegue->id]);
        $lead = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'agency_id' => $x->id, 'recipient_user_id' => $agent->id]);
        $this->assertFalse($agent->can('view', $fiche));

        Sanctum::actingAs($agent);
        $this->postJson('/api/property-visits', [
            'contact_lead_id' => $lead->id, 'customer_id' => $fiche->id, 'scheduled_at' => $this->creneau(),
        ])->assertForbidden();
        $this->assertNull($lead->fresh()->customer_id);
        $this->assertSame(0, CustomerNote::query()->count());
        $this->assertSame(0, PropertyVisit::query()->count());
    }
}
