<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use App\Services\Model\CustomerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2757 — l'auteur d'une fiche client n'en est jamais le SUJET. Le bailleur d'une agence qui
 * candidate, réserve ou demande une visite sur un autre bien de la même agence reçoit une fiche
 * créée par `CustomerService::findOrCreateFromUser`, dont il est l'auteur (`added_by_id`) ; son
 * `OwnerProfile` le fait membre de l'agence. Il lisait donc sa fiche, notes du personnel comprises,
 * et la modifiait. La règle vit dans la policy ET dans le scope de liste : les deux disent la même
 * chose, et les lignes déjà écrites sont couvertes.
 */
class CustomerAuthorIsNotSubjectTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $bailleur;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->bailleur = User::factory()->create();
        $this->materializeRoleProfile($this->bailleur, 'owner', $this->agency);
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
    }

    /** La fiche du bailleur candidat : il en est l'auteur ET le sujet, et l'agent y a écrit une note. */
    private function saFiche(): Customer
    {
        $fiche = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->bailleur->id,
            'user_id' => $this->bailleur->id,
        ]);
        $this->actingAsApi($this->agent)
            ->apiPost("/api/customers/{$fiche->id}/notes", ['body' => 'Hésite sur le loyer, relancer jeudi.'])
            ->assertCreated();
        $this->app['auth']->forgetGuards();

        return $fiche;
    }

    public function test_le_bailleur_candidat_ne_lit_ni_ne_modifie_sa_propre_fiche(): void
    {
        $fiche = $this->saFiche();
        $etape = $fiche->refresh()->getRawOriginal('pipeline_stage');
        $api = $this->actingAsApi($this->bailleur);

        $api->apiGet("/api/customers/{$fiche->id}")->assertForbidden();
        $api->apiGet("/api/customers/{$fiche->id}/notes")->assertForbidden();
        $api->apiGet("/api/customers/{$fiche->id}/timeline")->assertForbidden();
        $api->apiGet("/api/customers/{$fiche->id}/activity")->assertForbidden();
        $api->apiPatch("/api/customers/{$fiche->id}", ['first_name' => 'Moi'])->assertForbidden();
        $api->apiPost("/api/customers/{$fiche->id}/notes", ['body' => 'Note', 'is_pinned' => true])->assertForbidden();
        $api->apiPatch("/api/customers/{$fiche->id}/pipeline-stage", ['pipeline_stage' => 'qualified'])->assertForbidden();
        $api->apiPost("/api/customers/{$fiche->id}/contacts", ['channel' => 'whatsapp'])->assertForbidden();

        $this->assertSame($etape, $fiche->refresh()->getRawOriginal('pipeline_stage'));
        $this->assertSame(1, $fiche->notes()->count(), 'seule la note du personnel');
    }

    public function test_sa_fiche_n_est_pas_dans_sa_liste(): void
    {
        $fiche = $this->saFiche();
        $tiers = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->bailleur->id,
            'user_id' => null,
        ]);

        $reponse = $this->actingAsApi($this->bailleur)->apiGet('/api/customers?per_page=50')->assertOk();

        $ids = collect($reponse->json('data'))->pluck('id')->all();
        $this->assertNotContains($fiche->id, $ids);
        $this->assertSame([$tiers->id], $ids);
        $this->assertSame(1, $reponse->json('meta.total'));
    }

    /** Le bailleur auteur de la fiche d'un TIERS la garde (TCK-591), avec ou sans compte au tiers. */
    public function test_la_fiche_d_un_tiers_ajoutee_par_le_bailleur_reste_la_sienne(): void
    {
        $sansCompte = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->bailleur->id, 'user_id' => null]);
        $avecCompte = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->bailleur->id, 'user_id' => User::factory()->create()->id]);
        $api = $this->actingAsApi($this->bailleur);

        foreach ([$sansCompte, $avecCompte] as $fiche) {
            $api->apiGet("/api/customers/{$fiche->id}")->assertOk();
            $api->apiPatch("/api/customers/{$fiche->id}", ['first_name' => 'Awa'])->assertOk();
        }
    }

    /** Le personnel lit la fiche du bailleur candidat comme celle de tout client de l'agence. */
    public function test_le_personnel_lit_la_fiche_du_bailleur_candidat(): void
    {
        $fiche = $this->saFiche();

        $this->actingAsApi($this->agent)->apiGet("/api/customers/{$fiche->id}/notes")->assertOk();
        $this->app['auth']->forgetGuards();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->actingAsApi($admin)->apiGet("/api/customers/{$fiche->id}")->assertOk();
    }

    /** La fiche réellement créée par le geste du bailleur candidat, pas une fabrique. */
    public function test_la_fiche_nee_de_sa_candidature_lui_est_fermee(): void
    {
        $fiche = app(CustomerService::class)->findOrCreateFromUser($this->bailleur);

        $this->assertSame($this->bailleur->id, (int) $fiche->user_id);
        $this->actingAsApi($this->bailleur)->apiGet("/api/customers/{$fiche->id}")->assertForbidden();
    }
}
