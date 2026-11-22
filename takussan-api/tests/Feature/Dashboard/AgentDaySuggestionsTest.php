<?php

namespace Tests\Feature\Dashboard;

use App\Models\Address;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2855 — `GET /api/dashboard/me?include=suggestions` : le client de l'agent qui attend sa relance
 * depuis le plus longtemps, et celui qui a le plus de biens rapprochés non encore proposés. « De
 * l'agent » : il en est le référent (`filter[referent]=me`), dans l'agence active, et la fiche lui est
 * lisible (`CustomerPolicy::view`, par `Customer::scopeVisibleTo`).
 */
class AgentDaySuggestionsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = $this->agence();
        $this->agent = $this->personnel($this->agency);
        $this->collegue = $this->personnel($this->agency);
    }

    private function referent(Customer $fiche, User $agent): void
    {
        UserCustomerRelationship::query()->create([
            'user_id' => $agent->id, 'customer_id' => $fiche->id, 'relationship_type' => 'agent_client',
            'status' => 'active', 'is_primary' => true,
        ]);
    }

    /** Une fiche dont `$agent` est le référent, sans contact depuis `$jours` jours. */
    private function fiche(string $prenom, string $nom, int $jours, ?User $agent = null, array $attributes = [], ?Agency $agence = null): Customer
    {
        $fiche = $this->ficheClient($agence ?? $this->agency, null, $attributes + [
            'first_name' => $prenom, 'last_name' => $nom, 'added_by_id' => ($agent ?? $this->agent)->id,
            'pipeline_stage' => CustomerPipelineStage::Prospect,
            'created_at' => now()->subDays(60), 'last_contacted_at' => now()->subDays($jours),
        ]);
        $this->referent($fiche, $agent ?? $this->agent);

        return $fiche;
    }

    private function bien(string $quartier, array $overrides = []): Property
    {
        $bien = Property::factory()->create($overrides + [
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
            'type' => PropertyType::Apartment,
            'price' => 250_000,
            'bedrooms' => 3,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Private,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'city' => 'Dakar', 'neighborhood' => $quartier,
        ]);

        return $bien;
    }

    /** @return array<string, mixed>|null */
    private function suggestions(?User $lecteur = null): ?array
    {
        Sanctum::actingAs($lecteur ?? $this->agent);

        return $this->getJson('/api/dashboard/me?include=suggestions')->assertOk()
            ->assertJsonPath('data.role', 'agent')->json('data.suggestions');
    }

    public function test_sans_include_aucune_suggestion_n_est_calculee(): void
    {
        Sanctum::actingAs($this->agent);

        $this->assertArrayNotHasKey('suggestions', $this->getJson('/api/dashboard/me')->assertOk()->json('data'));
    }

    public function test_rien_a_suggerer_rend_des_cles_nulles(): void
    {
        // Une fiche contactée hier : rien à relancer ; aucun critère : rien à rapprocher.
        $this->fiche('Awa', 'Diop', 1);
        $this->bien('Mermoz');

        $this->assertSame(['follow_up' => null, 'matches' => null], $this->suggestions());
    }

    /** AC3 — Ibrahima Sarr attend depuis 9 jours, un autre depuis 2 : Ibrahima Sarr, 9 jours. */
    public function test_le_client_qui_attend_depuis_le_plus_longtemps(): void
    {
        $ibrahima = $this->fiche('Ibrahima', 'Sarr', 9);
        // L'autre : contacté hier, mais une tâche échue depuis 2 jours.
        $autre = $this->fiche('Moussa', 'Ba', 1);
        Task::create([
            'title' => 'Rappeler', 'taskable_type' => Customer::class, 'taskable_id' => $autre->id,
            'assigned_to_id' => $this->agent->id, 'created_by_id' => $this->agent->id,
            'status' => TaskStatus::Open, 'priority' => TaskPriority::Medium, 'due_at' => now()->subDays(2),
        ]);
        // Le client d'un collègue attend depuis 30 jours : ce n'est pas celui de l'agent.
        $this->fiche('Fatou', 'Ndiaye', 30, $this->collegue);
        // Un client gagné n'attend plus de relance.
        $this->fiche('Cheikh', 'Fall', 40, attributes: ['pipeline_stage' => CustomerPipelineStage::Converted]);

        $suggestions = $this->suggestions();

        $this->assertSame(['id' => $ibrahima->id, 'full_name' => 'Ibrahima Sarr'], $suggestions['follow_up']['customer']);
        $this->assertSame(9, $suggestions['follow_up']['waiting_days']);
    }

    /** AC4 — Mariama Fall a 3 biens rapprochés à Mermoz et Ouakam, non encore proposés. */
    public function test_le_client_qui_a_le_plus_de_biens_a_proposer(): void
    {
        $criteres = ['seeking_contract_type' => 'rent', 'budget_max' => 300_000];
        $mariama = $this->fiche('Mariama', 'Fall', 1, attributes: $criteres);
        $autre = $this->fiche('Ousmane', 'Gueye', 1, attributes: $criteres + ['min_bedrooms' => 4]);

        $mermoz = $this->bien('Mermoz');
        $this->bien('Ouakam');
        $this->bien('Mermoz');
        $this->bien('Ouakam', ['bedrooms' => 4]);
        // Déjà proposés à Mariama : visité, ou demandé.
        $visite = $this->bien('Fann');
        PropertyVisit::factory()->create([
            'property_id' => $visite->id, 'customer_id' => $mariama->id, 'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDays(3),
        ]);
        $demande = $this->bien('Fann');
        Booking::factory()->create([
            'property_id' => $demande->id, 'customer_id' => $mariama->id, 'agency_id' => $this->agency->id,
            'status' => BookingStatus::Pending,
        ]);
        // Hors rapprochement : trop cher, ou loué.
        $this->bien('Mermoz', ['price' => 400_000]);
        $this->bien('Mermoz', ['status' => PropertyStatus::Rented]);

        $matches = $this->suggestions()['matches'];

        // Mariama : 4 biens rapprochés (3 + celui à 4 chambres), Ousmane : 1. Mariama l'emporte.
        $this->assertSame(['id' => $mariama->id, 'first_name' => 'Mariama'], $matches['customer']);
        $this->assertSame(4, $matches['count']);
        $this->assertCount(3, $matches['sample']);
        $this->assertSame(['Mermoz', 'Ouakam'], collect($matches['sample'])->pluck('neighborhood')->unique()->sort()->values()->all());
        $this->assertSame(['id', 'title', 'neighborhood'], array_keys($matches['sample'][0]));
        $this->assertNotContains($visite->id, collect($matches['sample'])->pluck('id')->all());
        $this->assertNotNull($mermoz->id);
        $this->assertNotSame($autre->id, $matches['customer']['id']);
    }

    /** AC4, la lettre du ticket : trois biens à Mermoz et Ouakam → `count = 3`, deux quartiers. */
    public function test_trois_biens_a_mermoz_et_ouakam(): void
    {
        $this->fiche('Mariama', 'Fall', 1, attributes: ['seeking_contract_type' => 'rent', 'budget_max' => 300_000]);
        $this->bien('Mermoz');
        $this->bien('Ouakam');
        $this->bien('Mermoz');

        $matches = $this->suggestions()['matches'];

        $this->assertSame('Mariama', $matches['customer']['first_name']);
        $this->assertSame(3, $matches['count']);
        $this->assertSame(['Mermoz', 'Ouakam'], collect($matches['sample'])->pluck('neighborhood')->unique()->sort()->values()->all());
    }

    /**
     * AC5 — cloisonnement : le client d'une autre agence (l'agent en est référent) et, pour un agent
     * sans `crm.view_all`, la fiche ajoutée par un collègue dont il est référent, n'y paraissent pas.
     */
    public function test_le_client_d_une_autre_agence_n_est_jamais_suggere(): void
    {
        // L'agent est aussi personnel d'une autre agence, où il a ajouté une fiche dont il est
        // référent : il la lit (son ajout), mais sous le profil de CETTE agence, elle n'est pas à lui.
        $ailleurs = $this->agence();
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $ailleurs->id]);
        $this->fiche('Aminata', 'Sow', 30, attributes: ['seeking_contract_type' => 'rent'], agence: $ailleurs);
        Property::factory()->create([
            'agency_id' => $ailleurs->id, 'contract_type' => ContractType::Rent, 'status' => PropertyStatus::Available,
        ]);

        $profilIci = AgentProfile::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agency->id)->value('id');
        Sanctum::actingAs($this->agent);
        $suggestions = $this->withHeaders(['X-Profile-Id' => "agent:{$profilIci}"])
            ->getJson('/api/dashboard/me?include=suggestions')->assertOk()
            ->assertJsonPath('data.role', 'agent')->json('data.suggestions');

        $this->assertSame(['follow_up' => null, 'matches' => null], $suggestions);
    }

    public function test_sans_crm_view_all_la_fiche_ajoutee_par_un_collegue_reste_invisible(): void
    {
        $role = AgencyRole::factory()->for($this->agency)->withCapabilities([Capability::PropertiesCreate])->create();
        $restreint = $this->personnel($this->agency, agencyRole: $role);
        $this->assertFalse($restreint->can(Capability::CrmViewAll->value));

        // Il en est le référent, mais c'est le collègue qui l'a ajoutée.
        $this->fiche('Khady', 'Mbaye', 20, $restreint, ['added_by_id' => $this->collegue->id, 'seeking_contract_type' => 'rent']);
        $this->bien('Mermoz');

        $this->assertSame(['follow_up' => null, 'matches' => null], $this->suggestions($restreint));

        // Le même agent voit la fiche qu'il a lui-même ajoutée.
        $sienne = $this->fiche('Ndeye', 'Faye', 20, $restreint, ['seeking_contract_type' => 'rent']);
        $suggestions = $this->suggestions($restreint);
        $this->assertSame($sienne->id, $suggestions['follow_up']['customer']['id']);
        $this->assertSame($sienne->id, $suggestions['matches']['customer']['id']);
    }
}
