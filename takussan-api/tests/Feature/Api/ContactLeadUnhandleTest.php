<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Lead\ContactLeadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2884 — « Annuler » un traitement : `POST /api/contact-leads/{lead}/unhandle`.
 *
 * ADR-0103 : répondre ne vaut pas traiter — dé-traiter ne défait ni la première réponse, ni les
 * gestes de contact du journal, ni le rattachement à une fiche.
 */
class ContactLeadUnhandleTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $destinataire;

    private PropertyContactLead $lead;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->destinataire = $this->personnel($this->x);
        $this->lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->x)->id,
            'agency_id' => $this->x->id,
            'recipient_user_id' => $this->destinataire->id,
            'handled_at' => null,
            'handled_by_id' => null,
            'customer_id' => null,
        ]);
    }

    /** AC1 — traitée, puis dé-traitée : elle revient dans `filter[handled]=0`, ses gestes restent. */
    public function test_ac1_la_demande_revient_a_traiter_et_garde_ses_gestes(): void
    {
        Sanctum::actingAs($this->destinataire);

        $this->postJson("/api/contact-leads/{$this->lead->id}/contacts", ['channel' => 'whatsapp'])->assertNoContent();
        $this->postJson("/api/contact-leads/{$this->lead->id}/handle")->assertOk();
        $premiereReponse = $this->lead->fresh()->first_responded_at;
        $this->assertNotNull($premiereReponse);
        $this->getJson('/api/contact-leads?filter[handled]=0')->assertOk()->assertJsonPath('meta.total', 0);

        $this->postJson("/api/contact-leads/{$this->lead->id}/unhandle")
            ->assertOk()
            ->assertJsonPath('data.handled_at', null)
            ->assertJsonPath('data.handled_by_id', null)
            ->assertJsonPath('data.first_response_channel', 'whatsapp');

        $ids = collect($this->getJson('/api/contact-leads?filter[handled]=0')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$this->lead->id], $ids);

        $frais = $this->lead->fresh();
        $this->assertNull($frais->handled_at);
        $this->assertNull($frais->handled_by_id);
        $this->assertTrue($frais->first_responded_at->equalTo($premiereReponse));
        $this->assertSame($this->destinataire->id, $frais->first_responded_by_id);

        // Le geste de contact reste au journal ; l'annulation y est écrite, avec qui l'avait traitée.
        $journal = Activity::query()->where('subject_type', $this->lead->getMorphClass())->where('subject_id', $this->lead->id);
        $this->assertSame(1, (clone $journal)->where('event', 'contacted')->count());
        $annulation = (clone $journal)->where('event', ContactLeadService::UNHANDLED_EVENT)->sole();
        $this->assertSame($this->destinataire->id, (int) $annulation->causer_id);
        $this->assertSame($this->destinataire->id, $annulation->properties['handled_by_id']);
    }

    /** Une demande convertie reste rattachée à sa fiche : seul le traitement est annulé. */
    public function test_une_demande_convertie_reste_rattachee_a_sa_fiche(): void
    {
        Sanctum::actingAs($this->destinataire);
        $customerId = $this->postJson("/api/contact-leads/{$this->lead->id}/convert")->assertCreated()->json('customer.id');
        $this->assertNotNull($this->lead->fresh()->handled_at);

        $this->postJson("/api/contact-leads/{$this->lead->id}/unhandle")
            ->assertOk()
            ->assertJsonPath('data.customer_id', $customerId)
            ->assertJsonPath('data.handled_at', null);
    }

    /** AC2 — dé-traiter une demande non traitée : 422 `lead.not_handled`, rien n'est journalisé. */
    public function test_ac2_une_demande_non_traitee_rend_422(): void
    {
        Sanctum::actingAs($this->destinataire);

        $this->postJson("/api/contact-leads/{$this->lead->id}/unhandle")
            ->assertStatus(422)
            ->assertJsonPath('code', 'lead.not_handled');

        $this->assertSame(0, Activity::query()->where('event', ContactLeadService::UNHANDLED_EVENT)->count());
    }

    /** AC2 — qui ne lit pas la demande reçoit 403 (même règle que `handle`), avant le 422. */
    public function test_ac2_qui_ne_la_lit_pas_recoit_403(): void
    {
        $this->lead->update(['handled_at' => now(), 'handled_by_id' => $this->destinataire->id]);

        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();
        $sansVueGlobale = $this->personnel($this->x, agencyRole: $role);

        foreach ([$sansVueGlobale, $this->personnel($this->agence()), $this->bailleur($this->x)] as $intrus) {
            Sanctum::actingAs($intrus);
            $this->postJson("/api/contact-leads/{$this->lead->id}/unhandle")->assertForbidden();
        }

        $this->assertNotNull($this->lead->fresh()->handled_at);

        // Même non traitée, l'intrus lit 403 et non 422 : la réponse ne dit rien de l'état de la demande.
        $this->lead->update(['handled_at' => null, 'handled_by_id' => null]);
        Sanctum::actingAs($sansVueGlobale);
        $this->postJson("/api/contact-leads/{$this->lead->id}/unhandle")->assertForbidden();
    }
}
