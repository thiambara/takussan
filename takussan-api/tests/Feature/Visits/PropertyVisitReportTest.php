<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2578 (ADR-0101) — le compte rendu de visite : verdict, objections, note et suite, écrits par
 * le personnel de l'agence du bien, recopiés en UNE note épinglée `visit_report` sur la fiche
 * client, avec l'étape que Takussan propose — jamais écrite sans l'agent.
 */
class PropertyVisitReportTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    private function visite(array $attributs = [], ?Customer $fiche = null): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributs + [
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $fiche?->user_id,
            'customer_id' => $fiche?->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subHours(3),
            'completed_at' => now()->subHours(2),
        ]);
    }

    private function fiche(CustomerPipelineStage $etape = CustomerPipelineStage::Prospect): Customer
    {
        return $this->ficheClient($this->agence, $this->client(), [
            'pipeline_stage' => $etape,
            'added_by_id' => $this->agent->id,
        ]);
    }

    private function notesDeCompteRendu(Customer $fiche): int
    {
        return CustomerNote::query()
            ->where('customer_id', $fiche->id)
            ->where('kind', CustomerNoteKind::VisitReport->value)
            ->count();
    }

    public function test_ac1_le_compte_rendu_propose_qualifie_sans_changer_l_etape(): void
    {
        $fiche = $this->fiche(CustomerPipelineStage::Prospect);
        $visite = $this->visite([], $fiche);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", [
            'outcome' => 'interested',
            'objections' => ['price', 'size'],
            'note' => 'Aime la lumière, trouve le loyer un peu haut.',
            'follow_up' => 'invite_apply',
        ])
            ->assertCreated()
            ->assertJsonPath('data.report.outcome', 'interested')
            ->assertJsonPath('data.report.objections', ['price', 'size'])
            ->assertJsonPath('data.report.note', 'Aime la lumière, trouve le loyer un peu haut.')
            ->assertJsonPath('data.report.follow_up', 'invite_apply')
            ->assertJsonPath('data.report.reported_by.id', $this->agent->id)
            ->assertJsonPath('suggested_stage', ['from' => 'prospect', 'to' => 'qualified']);

        $this->assertSame(CustomerPipelineStage::Prospect, $fiche->fresh()->pipeline_stage);

        $visite->refresh();
        $this->assertSame('interested', $visite->report_outcome->value);
        $this->assertNotNull($visite->reported_at);
        $this->assertSame($this->agent->id, $visite->reported_by_id);

        $note = CustomerNote::query()->where('customer_id', $fiche->id)->sole();
        $this->assertSame(CustomerNoteKind::VisitReport, $note->kind);
        $this->assertTrue($note->pinned);
        $this->assertSame($this->agent->id, $note->author_id);
        $this->assertSame($visite->id, $note->property_visit_id);
    }

    public function test_suggested_stage_depuis_lead_et_null_ailleurs(): void
    {
        Sanctum::actingAs($this->agent);

        $lead = $this->fiche(CustomerPipelineStage::Lead);
        $this->postJson("/api/property-visits/{$this->visite([], $lead)->id}/report", ['outcome' => 'interested'])
            ->assertCreated()
            ->assertJsonPath('suggested_stage', ['from' => 'lead', 'to' => 'qualified']);

        $negociation = $this->fiche(CustomerPipelineStage::Negotiating);
        $this->postJson("/api/property-visits/{$this->visite([], $negociation)->id}/report", ['outcome' => 'interested'])
            ->assertCreated()
            ->assertJsonPath('suggested_stage', null);

        $prospect = $this->fiche(CustomerPipelineStage::Prospect);
        $this->postJson("/api/property-visits/{$this->visite([], $prospect)->id}/report", ['outcome' => 'thinking'])
            ->assertCreated()
            ->assertJsonPath('suggested_stage', null);
    }

    public function test_ac2_modifier_reecrit_la_note_sans_en_creer_une_seconde(): void
    {
        $fiche = $this->fiche();
        $visite = $this->visite([], $fiche);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", [
            'outcome' => 'thinking',
            'note' => 'Doit en parler à son épouse.',
        ])->assertCreated();
        $this->assertSame(1, $this->notesDeCompteRendu($fiche));

        $this->patchJson("/api/property-visits/{$visite->id}/report", [
            'outcome' => 'interested',
            'note' => 'A rappelé : ils prennent.',
        ])
            ->assertOk()
            ->assertJsonPath('data.report.outcome', 'interested')
            ->assertJsonPath('suggested_stage', ['from' => 'prospect', 'to' => 'qualified']);

        $this->assertSame(1, $this->notesDeCompteRendu($fiche));
        $note = CustomerNote::query()->where('customer_id', $fiche->id)->sole();
        $this->assertSame('A rappelé : ils prennent.', $note->body);
    }

    public function test_patch_garde_les_champs_absents(): void
    {
        $visite = $this->visite([], $this->fiche());

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", [
            'outcome' => 'interested',
            'objections' => ['guarantor'],
            'note' => 'Garant à trouver.',
        ])->assertCreated();

        $this->patchJson("/api/property-visits/{$visite->id}/report", ['follow_up' => 'remind'])
            ->assertOk()
            ->assertJsonPath('data.report.outcome', 'interested')
            ->assertJsonPath('data.report.objections', ['guarantor'])
            ->assertJsonPath('data.report.note', 'Garant à trouver.')
            ->assertJsonPath('data.report.follow_up', 'remind');
    }

    public function test_post_sur_un_compte_rendu_existant_et_patch_sans_compte_rendu_sont_refuses(): void
    {
        $visite = $this->visite([], $this->fiche());

        Sanctum::actingAs($this->agent);
        $this->patchJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'thinking'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'visit.report_missing');

        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'thinking'])->assertCreated();
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'visit.report_exists');

        $this->assertSame('thinking', $visite->fresh()->report_outcome->value);
    }

    public function test_ac3_une_visite_confirmee_passee_est_close_d_un_geste(): void
    {
        $visite = $this->visite([
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->subHours(2),
            'completed_at' => null,
        ], $this->fiche());

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'not_interested', 'objections' => ['neighborhood']])
            ->assertCreated()
            ->assertJsonPath('data.status', 'completed');

        $visite->refresh();
        $this->assertSame(VisitStatus::Completed, $visite->status);
        $this->assertNotNull($visite->completed_at);
        $this->assertSame('not_interested', $visite->report_outcome->value);
    }

    public function test_ac3_une_visite_a_venir_rend_409_et_rien_ne_change(): void
    {
        $fiche = $this->fiche();
        $visite = $this->visite([
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addHours(2),
            'completed_at' => null,
        ], $fiche);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'visit.report_not_closable');

        $visite->refresh();
        $this->assertSame(VisitStatus::Confirmed, $visite->status);
        $this->assertNull($visite->completed_at);
        $this->assertNull($visite->reported_at);
        $this->assertSame(0, $this->notesDeCompteRendu($fiche));
    }

    public function test_les_visites_non_closables_rendent_409(): void
    {
        Sanctum::actingAs($this->agent);

        foreach ([VisitStatus::Scheduled, VisitStatus::Cancelled, VisitStatus::NoShow] as $statut) {
            $visite = $this->visite(['status' => $statut, 'completed_at' => null]);
            $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])
                ->assertStatus(409)
                ->assertJsonPath('code', 'visit.report_not_closable');
            $this->assertNull($visite->fresh()->reported_at, $statut->value);
        }
    }

    public function test_sans_fiche_client_rien_n_est_ecrit_cote_crm(): void
    {
        $visite = $this->visite(['visitor_name' => 'Awa Ndiaye', 'visitor_phone' => '+221770000000']);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])
            ->assertCreated()
            ->assertJsonPath('customer_note', null)
            ->assertJsonPath('suggested_stage', null);

        $this->assertSame(0, CustomerNote::query()->count());
    }

    public function test_la_reponse_cite_la_note_de_la_fiche(): void
    {
        $fiche = $this->fiche();
        $visite = $this->visite([], $fiche);

        Sanctum::actingAs($this->agent);
        $reponse = $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'thinking'])->assertCreated();

        $note = CustomerNote::query()->where('customer_id', $fiche->id)->sole();
        $reponse->assertJsonPath('customer_note.id', $note->id);
    }

    public function test_ac4_le_visiteur_le_bailleur_et_l_agent_d_une_autre_agence_sont_refuses(): void
    {
        $fiche = $this->fiche();
        $bailleur = $this->bailleur($this->agence);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence, $bailleur)->id,
            'visitor_id' => $fiche->user_id,
            'customer_id' => $fiche->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subHours(3),
            'completed_at' => now()->subHours(2),
        ]);

        $refuses = [
            'visiteur' => User::query()->findOrFail($fiche->user_id),
            'bailleur' => $bailleur,
            'autre agence' => $this->personnel($this->agence()),
        ];

        foreach ($refuses as $qui => $user) {
            Sanctum::actingAs($user);
            $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])
                ->assertForbidden();
            $this->patchJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])
                ->assertForbidden();
            $this->assertNull($visite->fresh()->reported_at, $qui);
        }

        Sanctum::actingAs($this->personnel($this->agence));
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested'])->assertCreated();
    }

    public function test_le_refus_precede_la_validation(): void
    {
        $visite = $this->visite([], $this->fiche());

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'banana'])->assertForbidden();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'banana'])->assertUnprocessable();
    }

    public function test_les_listes_fermees_sont_validees(): void
    {
        $visite = $this->visite([], $this->fiche());

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visite->id}/report", [])
            ->assertUnprocessable()->assertJsonValidationErrors(['outcome']);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested', 'objections' => ['weather']])
            ->assertUnprocessable()->assertJsonValidationErrors(['objections.0']);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested', 'follow_up' => 'sign_now'])
            ->assertUnprocessable()->assertJsonValidationErrors(['follow_up']);
        $this->postJson("/api/property-visits/{$visite->id}/report", ['outcome' => 'interested', 'note' => str_repeat('a', 2001)])
            ->assertUnprocessable()->assertJsonValidationErrors(['note']);
    }

    public function test_ac6_l_avis_du_client_garde_sa_fenetre_compte_rendu_pose_ou_non(): void
    {
        $fiche = $this->fiche();
        $visiteur = User::query()->findOrFail($fiche->user_id);
        $recente = $this->visite(['completed_at' => now()->subHours(2)], $fiche);
        $ancienne = $this->visite(['completed_at' => now()->subHours(30)], $fiche);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$recente->id}/report", ['outcome' => 'interested'])->assertCreated();
        $this->postJson("/api/property-visits/{$ancienne->id}/report", ['outcome' => 'interested'])->assertCreated();

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$recente->id}/feedback", ['role' => 'customer', 'rating' => 4, 'comment' => 'Bien.'])
            ->assertOk()
            ->assertJsonPath('data.rating', 4);
        $this->postJson("/api/property-visits/{$ancienne->id}/feedback", ['role' => 'customer', 'rating' => 4])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'visit.feedback_window_closed');

        $sansCompteRendu = $this->visite(['completed_at' => now()->subHours(30)], $fiche);
        $this->postJson("/api/property-visits/{$sansCompteRendu->id}/feedback", ['role' => 'customer', 'rating' => 4])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'visit.feedback_window_closed');
    }
}
