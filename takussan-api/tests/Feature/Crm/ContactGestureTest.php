<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2583 (ADR-0103 § 1) — le geste de contact : le premier pose la première réponse de la
 * demande, les suivants ne la déplacent pas, aucun ne la marque traitée ; le journal ne garde que
 * le canal.
 */
class ContactGestureTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    private function demande(array $attributs = []): PropertyContactLead
    {
        return PropertyContactLead::factory()->create($attributs + [
            'property_id' => $this->bienDe($this->agence)->id,
            'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->agent->id,
            'phone' => '+221771234567',
            'email' => 'awa@example.com',
        ]);
    }

    /** @return Collection<int, Activity> */
    private function gestes(string $sujet, int $id)
    {
        return Activity::query()
            ->where('subject_type', $sujet)
            ->where('subject_id', $id)
            ->where('event', 'contacted')
            ->orderBy('id')
            ->get();
    }

    /** AC1 — reçue à 08:00, WhatsApp à 09:30 : première réponse 09:30 ; l'appel de 11:00 ne la déplace pas ; jamais traitée. */
    public function test_ac1_le_premier_geste_pose_la_premiere_reponse_et_le_second_ne_la_deplace_pas(): void
    {
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00'));
        $lead = $this->demande();

        Sanctum::actingAs($this->agent);

        $this->travelTo(Carbon::parse('2026-11-10 09:30:00'));
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'whatsapp'])->assertNoContent();

        $lead->refresh();
        $this->assertSame('2026-11-10 09:30:00', $lead->first_responded_at?->format('Y-m-d H:i:s'));
        $this->assertSame($this->agent->id, $lead->first_responded_by_id);
        $this->assertSame('whatsapp', $lead->first_response_channel);
        $this->assertNull($lead->handled_at);

        $collegue = $this->personnel($this->agence);
        Sanctum::actingAs($collegue);
        $this->travelTo(Carbon::parse('2026-11-10 11:00:00'));
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'call'])->assertNoContent();

        $lead->refresh();
        $this->assertSame('2026-11-10 09:30:00', $lead->first_responded_at?->format('Y-m-d H:i:s'));
        $this->assertSame($this->agent->id, $lead->first_responded_by_id);
        $this->assertSame('whatsapp', $lead->first_response_channel);
        $this->assertNull($lead->handled_at);
        $this->assertNull($lead->handled_by_id);

        // Deux gestes, deux entrées : la première réponse est unique, le journal non.
        $this->assertSame(['whatsapp', 'call'], $this->gestes(PropertyContactLead::class, $lead->id)
            ->map(fn (Activity $a) => $a->properties->get('channel'))->all());

        // La boîte le dit : répondue, pas traitée.
        Sanctum::actingAs($this->agent);
        $this->getJson("/api/contact-leads/{$lead->id}")
            ->assertOk()
            ->assertJsonPath('data.first_responded_at', '2026-11-10T09:30:00+00:00')
            ->assertJsonPath('data.first_responded_by_id', $this->agent->id)
            ->assertJsonPath('data.first_response_channel', 'whatsapp')
            ->assertJsonPath('data.handled_at', null);
    }

    /** Le journal ne garde que le canal — ni le téléphone ni l'adresse du demandeur. */
    public function test_le_journal_ne_porte_que_le_canal(): void
    {
        $lead = $this->demande();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'sms'])->assertNoContent();

        $geste = $this->gestes(PropertyContactLead::class, $lead->id)->sole();
        $this->assertSame(['channel' => 'sms'], $geste->properties->toArray());
        $this->assertSame($this->agent->id, $geste->causer_id);
        $this->assertStringNotContainsString('771234567', (string) json_encode($geste->getAttributes()));
        $this->assertStringNotContainsString('awa@example.com', (string) json_encode($geste->getAttributes()));
    }

    /** Sur une fiche : 204, une entrée sur la fiche, le dernier contact posé, sans toucher `updated_at`. */
    public function test_un_geste_sur_la_fiche(): void
    {
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00'));
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);
        $misAJour = $fiche->fresh()->updated_at?->format('Y-m-d H:i:s');

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 10:15:00'));
        $this->postJson("/api/customers/{$fiche->id}/contacts", ['channel' => 'call'])->assertNoContent();

        $fiche->refresh();
        $this->assertSame('2026-11-10 10:15:00', $fiche->last_contacted_at?->format('Y-m-d H:i:s'));
        $this->assertSame($misAJour, $fiche->updated_at?->format('Y-m-d H:i:s'));
        $this->assertSame(['channel' => 'call'], $this->gestes(Customer::class, $fiche->id)->sole()->properties->toArray());
        // Un contact n'est pas une modification de la fiche : aucune entrée `updated`.
        $this->assertSame(0, Activity::query()->where('subject_type', Customer::class)
            ->where('subject_id', $fiche->id)->where('event', 'updated')->count());
    }

    /** AC5 — un agent d'une autre agence : 403 sur le geste, demande comme fiche ; et 403 avant 422. */
    public function test_ac5_une_autre_agence_recoit_403(): void
    {
        $lead = $this->demande();
        $fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->agent->id]);

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'whatsapp'])->assertForbidden();
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'pigeon'])->assertForbidden();
        $this->postJson("/api/customers/{$fiche->id}/contacts", ['channel' => 'call'])->assertForbidden();

        $this->assertNull($lead->fresh()->first_responded_at);
        $this->assertNull($fiche->fresh()->last_contacted_at);
        $this->assertCount(0, $this->gestes(PropertyContactLead::class, $lead->id));

        // Autorisé, mais canal inconnu : 422.
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'pigeon'])->assertStatus(422);
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", [])->assertStatus(422);
    }
}
