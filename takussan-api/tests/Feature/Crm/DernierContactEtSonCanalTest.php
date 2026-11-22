<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LastContactChannel;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2766 — la fiche client dit par quel canal s'est fait son dernier contact :
 * `customers.last_contact_channel`, écrit par la même requête que `last_contacted_at`
 * (`ContactGestureService::touchCustomer()`), et `last_contact {channel, at}` servi, sur demande de
 * `fields[customers]`, au seul lecteur de `last_contacted_at`.
 *
 * Chaque contact part d'une fiche dont le canal est DIFFÉRENT de celui attendu : un appelant qui
 * n'écrirait rien rougit.
 */
class DernierContactEtSonCanalTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $bailleurAuteur;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00'));

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bailleurAuteur = $this->bailleur($this->agence);
    }

    /** Une fiche ajoutée par le bailleur, déjà contactée la veille par `$canal`. */
    private function fiche(?string $canal = 'sms', ?string $le = '2026-11-09 10:00:00'): Customer
    {
        $fiche = $this->ficheClient($this->agence, $this->client(), ['added_by_id' => $this->bailleurAuteur->id]);
        $fiche->forceFill([
            'last_contacted_at' => $le !== null ? Carbon::parse($le) : null,
            'last_contact_channel' => $canal,
        ])->saveQuietly();

        return $fiche;
    }

    /** @return array{0: ?string, 1: ?string} l'instant et le canal, lus sur la LIGNE */
    private function ligne(Customer $fiche): array
    {
        $l = DB::table('customers')->where('id', $fiche->id)->first(['last_contacted_at', 'last_contact_channel']);

        return [$l->last_contacted_at !== null ? Carbon::parse($l->last_contacted_at)->format('Y-m-d H:i:s') : null, $l->last_contact_channel];
    }

    private function lire(User $lecteur, Customer $fiche, string $champs = 'id,last_contacted_at,last_contact'): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/customers/{$fiche->id}?fields[customers]={$champs}")->assertOk()->json('data');
    }

    private function lireEnListe(User $lecteur, Customer $fiche): array
    {
        Sanctum::actingAs($lecteur);

        return collect($this->getJson('/api/customers?fields[customers]=id,last_contacted_at,last_contact&per_page=100')
            ->assertOk()->json('data'))->firstWhere('id', $fiche->id);
    }

    public function test_ac1_un_appel_donne_le_canal_au_personnel_et_rien_au_bailleur_auteur(): void
    {
        $fiche = $this->fiche('whatsapp');

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 09:30:00'));
        $this->postJson("/api/customers/{$fiche->id}/contacts", ['channel' => 'call'])->assertNoContent();

        $this->assertSame(['2026-11-10 09:30:00', 'call'], $this->ligne($fiche));

        foreach (['fiche' => $this->lire($this->agent, $fiche), 'liste' => $this->lireEnListe($this->agent, $fiche)] as $ou => $lu) {
            $this->assertSame(['channel' => 'call', 'at' => '2026-11-10T09:30:00+00:00'], $lu['last_contact'], $ou);
            $this->assertSame($lu['last_contacted_at'], $lu['last_contact']['at'], $ou);
        }

        foreach (['fiche' => $this->lire($this->bailleurAuteur, $fiche), 'liste' => $this->lireEnListe($this->bailleurAuteur, $fiche)] as $ou => $lu) {
            $this->assertArrayHasKey('last_contact', $lu, $ou);
            $this->assertNull($lu['last_contact'], $ou);
            $this->assertNull($lu['last_contacted_at'], $ou);
        }
    }

    /** Le lecteur est celui de `last_contacted_at` : l'auteur d'une fiche SANS agence la lit. */
    public function test_ac1_l_auteur_d_une_fiche_sans_agence_lit_son_dernier_contact(): void
    {
        $fiche = $this->fiche('call', '2026-11-09 10:00:00');
        $fiche->forceFill(['agency_id' => null])->saveQuietly();

        $lu = $this->lire($this->bailleurAuteur, $fiche);
        $this->assertSame('2026-11-09T10:00:00+00:00', $lu['last_contacted_at']);
        $this->assertSame(['channel' => 'call', 'at' => '2026-11-09T10:00:00+00:00'], $lu['last_contact']);
    }

    public function test_last_contact_n_est_rendu_que_s_il_est_demande(): void
    {
        $fiche = $this->fiche('call');

        $this->assertArrayNotHasKey('last_contact', $this->lire($this->agent, $fiche, 'id,last_contacted_at'));
    }

    public function test_ac2_un_contact_plus_ancien_ne_change_ni_l_instant_ni_le_canal(): void
    {
        $fiche = $this->fiche(null, null);
        $service = app(ContactGestureService::class);

        $service->touchCustomer($fiche, LastContactChannel::Call, Carbon::parse('2026-11-10 12:00:00'));
        $this->assertSame(['2026-11-10 12:00:00', 'call'], $this->ligne($fiche));

        $service->touchCustomer($fiche->id, LastContactChannel::Note, Carbon::parse('2026-11-09 09:00:00'));
        $service->touchCustomer($fiche, LastContactChannel::Visit, Carbon::parse('2026-11-10 12:00:00'));

        $this->assertSame(['2026-11-10 12:00:00', 'call'], $this->ligne($fiche));
        $this->assertSame(LastContactChannel::Call, $fiche->last_contact_channel);
        $this->assertFalse($fiche->isDirty(), 'l’instance suit la ligne sans se croire modifiée');

        $service->touchCustomer($fiche, LastContactChannel::Whatsapp, Carbon::parse('2026-11-10 12:00:01'));
        $this->assertSame(['2026-11-10 12:00:01', 'whatsapp'], $this->ligne($fiche));
        $this->assertSame(LastContactChannel::Whatsapp, $fiche->last_contact_channel);
        $this->assertFalse($fiche->isDirty());
    }

    public function test_ac3_une_note_pose_note(): void
    {
        $fiche = $this->fiche('call');

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 14:00:00'));
        $this->postJson("/api/customers/{$fiche->id}/notes", ['body' => 'Rappelé, rappellera lundi.'])->assertCreated();

        $this->assertSame(['2026-11-10 14:00:00', 'note'], $this->ligne($fiche));
    }

    public function test_ac3_une_visite_terminee_pose_visit(): void
    {
        $fiche = $this->fiche('sms');
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $fiche->user_id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => Carbon::parse('2026-11-10 10:00:00'),
        ]);

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 11:00:00'));
        $this->postJson("/api/property-visits/{$visite->id}/complete")->assertOk();

        $this->assertSame(['2026-11-10 11:00:00', 'visit'], $this->ligne($fiche));
    }

    public function test_ac3_un_compte_rendu_pose_visit(): void
    {
        $fiche = $this->fiche('whatsapp');
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $fiche->user_id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => Carbon::parse('2026-11-09 10:00:00'),
            'completed_at' => Carbon::parse('2026-11-09 09:00:00'),
        ]);

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 16:20:00'));
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])->assertCreated();

        $this->assertSame(['2026-11-10 16:20:00', 'visit'], $this->ligne($fiche));
    }

    public function test_un_geste_sur_la_demande_convertie_pose_son_canal(): void
    {
        $fiche = $this->fiche('call');
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'agency_id' => $this->agence->id,
            'recipient_user_id' => $this->agent->id,
            'customer_id' => $fiche->id,
        ]);

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 09:30:00'));
        $this->postJson("/api/contact-leads/{$lead->id}/contacts", ['channel' => 'email'])->assertNoContent();

        $this->assertSame(['2026-11-10 09:30:00', 'email'], $this->ligne($fiche));
    }

    public function test_ac4_une_fiche_contactee_avant_le_canal_rend_son_instant_sans_canal(): void
    {
        $fiche = $this->fiche(null, '2026-11-01 08:15:00');

        $lu = $this->lire($this->agent, $fiche);
        $this->assertSame(['channel' => null, 'at' => '2026-11-01T08:15:00+00:00'], $lu['last_contact']);

        $jamais = $this->fiche(null, null);
        $this->assertNull($this->lire($this->agent, $jamais)['last_contact']);
    }
}
