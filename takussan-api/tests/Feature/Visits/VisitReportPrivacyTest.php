<?php

namespace Tests\Feature\Visits;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2578 (ADR-0101 § 2 et § 7) — le compte rendu est interne à l'agence du bien : jamais servi au
 * visiteur, au client, ni au bailleur hors personnel — ni par la visite, ni par la fiche client
 * (notes, `include=notes`, flux d'activité). À l'effacement de la fiche ou du compte du visiteur,
 * le seul texte libre (`report_note`) est vidé ; les codes restent.
 */
class VisitReportPrivacyTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $bailleur;

    private User $visiteur;

    private Customer $fiche;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bailleur = $this->bailleur($this->agence);
        $this->visiteur = $this->client();
        // La fiche a été ajoutée par le bailleur : il la lit (CustomerPolicy::view), sans être du
        // personnel de l'agence.
        $this->fiche = $this->ficheClient($this->agence, $this->visiteur, [
            'pipeline_stage' => CustomerPipelineStage::Prospect,
            'added_by_id' => $this->bailleur->id,
        ]);
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence, $this->bailleur)->id,
            'visitor_id' => $this->visiteur->id,
            'customer_id' => $this->fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subHours(3),
            'completed_at' => now()->subHours(2),
        ]);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$this->visite->id}/report", [
            'outcome' => 'interested',
            'objections' => ['price'],
            'note' => 'Confidentiel : budget serré.',
        ])->assertCreated();
    }

    public function test_ac4_le_visiteur_ne_recoit_aucune_cle_report(): void
    {
        Sanctum::actingAs($this->visiteur);

        $detail = $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk();
        $this->assertArrayNotHasKey('report', $detail->json('data'));
        $this->assertStringNotContainsString('budget serré', $detail->getContent());

        $liste = $this->getJson('/api/property-visits')->assertOk();
        $this->assertSame($this->visite->id, $liste->json('data.0.id'));
        $this->assertArrayNotHasKey('report', $liste->json('data.0'));
        $this->assertStringNotContainsString('budget serré', $liste->getContent());
    }

    public function test_le_bailleur_hors_personnel_ne_lit_pas_le_compte_rendu_sur_la_visite(): void
    {
        Sanctum::actingAs($this->bailleur);

        $detail = $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk();
        $this->assertArrayNotHasKey('report', $detail->json('data'));

        $liste = $this->getJson('/api/property-visits')->assertOk();
        $this->assertArrayNotHasKey('report', $liste->json('data.0'));
        $this->assertStringNotContainsString('budget serré', $liste->getContent());
    }

    public function test_le_personnel_lit_le_compte_rendu_en_detail_et_en_liste(): void
    {
        Sanctum::actingAs($this->personnel($this->agence));

        $this->getJson("/api/property-visits/{$this->visite->id}")->assertOk()
            ->assertJsonPath('data.report.outcome', 'interested')
            ->assertJsonPath('data.report.note', 'Confidentiel : budget serré.');
        $this->getJson('/api/property-visits')->assertOk()
            ->assertJsonPath('data.0.report.objections', ['price']);
    }

    public function test_le_flux_du_client_porte_une_entree_pour_le_personnel_et_aucune_pour_le_bailleur(): void
    {
        $entreesDeCompteRendu = fn (array $data) => collect($data)
            ->filter(fn (array $e) => ($e['changes']['attributes']['kind'] ?? null) === 'visit_report')
            ->values();

        $flux = $this->getJson("/api/customers/{$this->fiche->id}/activity")->assertOk();
        $entrees = $entreesDeCompteRendu($flux->json('data'));
        $this->assertCount(1, $entrees);
        $this->assertSame('interested', $entrees[0]['report']['outcome']);
        $this->assertSame(['price'], $entrees[0]['report']['objections']);
        $this->assertSame($this->visite->id, $entrees[0]['report']['visit_id']);
        // Le flux ne rend jamais le corps d'une note, ni le texte libre du compte rendu.
        $this->assertStringNotContainsString('budget serré', $flux->getContent());

        // Une modification ne crée pas une seconde entrée.
        $this->patchJson("/api/property-visits/{$this->visite->id}/report", ['outcome' => 'thinking', 'note' => 'Autre'])
            ->assertOk();
        $entrees = $entreesDeCompteRendu($this->getJson("/api/customers/{$this->fiche->id}/activity")->json('data'));
        $this->assertCount(1, $entrees);
        $this->assertSame('thinking', $entrees[0]['report']['outcome']);

        Sanctum::actingAs($this->bailleur);
        $flux = $this->getJson("/api/customers/{$this->fiche->id}/activity")->assertOk();
        $this->assertCount(0, $entreesDeCompteRendu($flux->json('data')));
        $this->assertStringNotContainsString('visit_report', $flux->getContent());
    }

    public function test_les_notes_de_la_fiche_cachent_le_compte_rendu_au_bailleur(): void
    {
        $this->getJson("/api/customers/{$this->fiche->id}/notes")->assertOk()
            ->assertJsonPath('data.0.kind', 'visit_report')
            ->assertJsonPath('data.0.property_visit_id', $this->visite->id)
            ->assertJsonPath('data.0.body', 'Confidentiel : budget serré.');

        Sanctum::actingAs($this->bailleur);
        $notes = $this->getJson("/api/customers/{$this->fiche->id}/notes")->assertOk();
        $this->assertSame([], $notes->json('data'));
        $this->assertSame(0, $notes->json('meta.total'));

        // Sans `fields[customers]`, la colonne texte `notes` masque la relation : c'est la forme
        // sparse, colonne non lue, qui sert la relation `notes` chargée par `include=notes`.
        $fiche = $this->getJson("/api/customers/{$this->fiche->id}?fields[customers]=id,first_name&include=notes")->assertOk();
        $this->assertSame([], $fiche->json('data.notes'));
        $this->assertStringNotContainsString('budget serré', $fiche->getContent());
        $this->assertStringNotContainsString('visit_report', $fiche->getContent());

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/customers/{$this->fiche->id}?fields[customers]=id,first_name&include=notes")->assertOk()
            ->assertJsonPath('data.notes.0.kind', 'visit_report');
    }

    public function test_effacer_la_fiche_vide_la_note_du_compte_rendu_et_garde_les_codes(): void
    {
        Sanctum::actingAs($this->personnel($this->agence, 'agency_admin'));
        $this->deleteJson("/api/customers/{$this->fiche->id}")->assertNoContent();

        $visite = $this->visite->fresh();
        $this->assertNull($visite->report_note);
        $this->assertSame('interested', $visite->report_outcome->value);
        $this->assertSame(['price'], $visite->report_objections);
    }

    public function test_effacer_le_compte_du_visiteur_vide_la_note_du_compte_rendu_et_garde_les_codes(): void
    {
        $request = AccountDeletionRequest::factory()->for($this->visiteur)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);

        $visite = $this->visite->fresh();
        $this->assertNull($visite->report_note);
        $this->assertSame('interested', $visite->report_outcome->value);
        $this->assertSame(['price'], $visite->report_objections);
    }
}
