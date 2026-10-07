<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\Capability;
use App\Models\Guarantor;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §2, AC5) — supprimer est jugé par l'ability `delete`, plus par `view` ni
 * `update`.
 *
 * `CustomerController::destroy` et `GuarantorController::destroy` autorisaient par `view` : qui
 * pouvait lire un client le supprimait, et un bailleur de l'agence lisait — donc supprimait — les
 * clients de l'agence. Par HTTP, jamais par appel direct de policy : c'est le contrôleur qui
 * choisissait la mauvaise ability.
 */
class DestroyAuthorizationTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $bailleur;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);
        $this->bailleur = User::factory()->withOwnerProfile($this->agency)->create();
    }

    public function test_un_bailleur_ne_supprime_pas_le_client_de_l_agence_qu_il_n_a_pas_ajoute(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);

        $this->actingAsApi($this->bailleur)->deleteJson("/api/customers/{$customer->id}")->assertForbidden();
        $this->assertNotSoftDeleted($customer);
    }

    /**
     * Le cas qui distingue `delete` de `view` : l'auteur LIT le client qu'il a ajouté, mais ne le
     * supprime que s'il est du personnel (« auteur personnel », ADR-0031 §2). Sur le client d'un
     * autre, `view` refuse déjà depuis ce ticket.
     */
    public function test_un_bailleur_auteur_lit_son_client_d_agence_sans_pouvoir_le_supprimer(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->bailleur->id]);

        $this->actingAsApi($this->bailleur);
        $this->getJson("/api/customers/{$customer->id}")->assertOk();
        $this->deleteJson("/api/customers/{$customer->id}")->assertForbidden();
        $this->assertNotSoftDeleted($customer);
    }

    public function test_un_bailleur_ne_supprime_pas_le_garant_ajoute_par_le_personnel(): void
    {
        $guarantor = Guarantor::factory()->create(['added_by_id' => $this->agent->id]);

        $this->actingAsApi($this->bailleur)->deleteJson("/api/guarantors/{$guarantor->id}")->assertForbidden();
        $this->assertNotNull($guarantor->fresh());
    }

    public function test_le_personnel_tenant_crm_view_all_supprime_le_client_d_un_collegue(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);

        $this->actingAsApi($this->agencyAgent($this->agency))
            ->deleteJson("/api/customers/{$customer->id}")
            ->assertStatus(204);
        $this->assertSoftDeleted($customer);
    }

    public function test_sans_crm_view_all_l_agent_ne_supprime_que_ses_clients(): void
    {
        $restreint = $this->agentWithout($this->agency, Capability::CrmViewAll);
        $duCollegue = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);
        $leSien = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $restreint->id]);

        $this->actingAsApi($restreint);
        $this->deleteJson("/api/customers/{$duCollegue->id}")->assertForbidden();
        $this->deleteJson("/api/customers/{$leSien->id}")->assertStatus(204);
    }

    public function test_le_personnel_de_l_agence_de_l_auteur_supprime_le_garant(): void
    {
        $guarantor = Guarantor::factory()->create(['added_by_id' => $this->agent->id]);

        $this->actingAsApi($this->agencyAdmin($this->agency))
            ->deleteJson("/api/guarantors/{$guarantor->id}")
            ->assertSuccessful();
    }

    /**
     * Comportement constant (contrainte 6) : `DocumentPolicy::delete()` reprend `update()` — seul
     * l'auteur. Sans la surcharge, `BasePolicy::delete()` ne connaît aucune capacité de suppression
     * de document et ne laisse passer que le super-admin : l'auteur recevrait 403.
     */
    public function test_l_auteur_du_document_le_supprime_et_un_autre_membre_non(): void
    {
        $property = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agency->id]);
        $document = Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $this->bailleur->id,
        ]);

        $this->actingAsApi($this->agent)->deleteJson("/api/documents/{$document->id}")->assertForbidden();
        $this->assertNotNull($document->fresh());

        $this->actingAsApi($this->bailleur)->deleteJson("/api/documents/{$document->id}")->assertSuccessful();
        $this->assertNull(Document::query()->find($document->id));
    }
}
