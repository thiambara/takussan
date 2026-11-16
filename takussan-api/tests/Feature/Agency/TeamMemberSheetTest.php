<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2926 (ADR-0124) — la fiche d'un membre : `GET /api/agencies/{agency}/team/{user}`, et le filtre
 * `filter[agent]` des biens, qui compte le même ensemble.
 */
class TeamMemberSheetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
    }

    private function sheet(User $member, ?Agency $agency = null)
    {
        $agency ??= $this->agency;

        return $this->getJson("/api/agencies/{$agency->id}/team/{$member->id}");
    }

    public function test_ac1_le_portefeuille_compte_ses_biens_par_statut_et_pas_ceux_d_un_autre(): void
    {
        Property::factory()->count(3)->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id, 'status' => PropertyStatus::Rented]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id, 'status' => PropertyStatus::Available]);
        // Suivi en collaborateur : il compte aussi (la règle de « Mes chiffres »).
        $suivi = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->admin->id, 'status' => PropertyStatus::Available]);
        PropertyCollaborator::query()->create(['property_id' => $suivi->id, 'user_id' => $this->agent->id, 'role' => CollaboratorRole::Agent]);
        // Ceux d'un autre agent, et un bien archivé : jamais.
        $autre = $this->agencyAgent($this->agency);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $autre->id, 'status' => PropertyStatus::Rented]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id, 'status' => PropertyStatus::Archived]);

        $this->actingAsApi($this->admin);
        $response = $this->sheet($this->agent)->assertOk();

        $this->assertSame(['available' => 2, 'rented' => 3], $response->json('data.portfolio.properties'));
        $this->assertSame(5, $response->json('data.portfolio.properties_total'));

        // Le même ensemble que la liste filtrée par agent.
        $liste = $this->getJson("/api/properties?filter[agent]={$this->agent->id}&fields[properties]=id,status&per_page=50")->assertOk();
        $this->assertCount(5, $liste->json('data'));
    }

    public function test_les_clients_actifs_sont_ceux_dont_il_est_le_referent_actif(): void
    {
        foreach ([RelationshipStatus::Active, RelationshipStatus::Active, RelationshipStatus::Ended] as $status) {
            $client = Customer::factory()->create(['agency_id' => $this->agency->id]);
            UserCustomerRelationship::query()->create([
                'user_id' => $this->agent->id, 'customer_id' => $client->id,
                'relationship_type' => RelationshipType::AgentClient, 'status' => $status, 'is_primary' => true,
            ]);
        }

        $this->actingAsApi($this->admin);
        $this->sheet($this->agent)->assertOk()->assertJsonPath('data.portfolio.active_customers', 2);
    }

    public function test_ac2_les_commissions_dues_rendent_le_total_les_baux_et_la_plus_ancienne(): void
    {
        $due = fn (string $date, float $amount) => CommissionEntry::factory()->create([
            'agency_id' => $this->agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $this->agency->id])->id,
            'beneficiary_id' => $this->agent->id,
            'status' => CommissionEntryStatus::Due,
            'amount' => $amount,
            'earned_at' => Carbon::parse($date.' 10:00:00'),
        ]);
        $due('2026-11-05', 45000);
        $due('2026-10-30', 30000);
        // Payée, ou d'une autre agence : hors du compte.
        CommissionEntry::factory()->create([
            'agency_id' => $this->agency->id, 'beneficiary_id' => $this->agent->id,
            'status' => CommissionEntryStatus::Paid, 'paid_at' => now(), 'amount' => 99999, 'earned_at' => Carbon::parse('2026-09-01'),
        ]);

        $this->actingAsApi($this->admin);
        $this->sheet($this->agent)->assertOk()
            ->assertJsonPath('data.commissions_due.amount', 75000)
            ->assertJsonPath('data.commissions_due.leases', 2)
            ->assertJsonPath('data.commissions_due.oldest_due_at', '2026-10-30');
    }

    public function test_la_derniere_connexion_et_la_date_de_la_2fa_sont_servies(): void
    {
        $this->agent->forceFill([
            'last_login_at' => Carbon::parse('2026-11-15 09:12:00'),
            'last_login_device' => 'iPhone · Safari',
            'two_factor_enabled' => true,
        ])->save();

        $this->actingAsApi($this->admin);
        $response = $this->sheet($this->agent)->assertOk()
            ->assertJsonPath('data.last_login.at', '2026-11-15T09:12:00+00:00')
            ->assertJsonPath('data.last_login.device', 'iPhone · Safari')
            ->assertJsonPath('data.last_login.city', null)
            ->assertJsonPath('data.two_factor_enabled', true);
        $this->assertNotNull($response->json('data.two_factor_enabled_at'));
    }

    public function test_un_agent_ne_lit_pas_la_fiche_d_un_autre_agent(): void
    {
        $autre = $this->agencyAgent($this->agency);

        $this->actingAsApi($this->agent);
        $this->sheet($autre)->assertForbidden();
    }

    public function test_une_personne_hors_de_l_agence_rend_404(): void
    {
        $ailleurs = $this->agencyAgent(Agency::factory()->create());

        $this->actingAsApi($this->admin);
        $this->sheet($ailleurs)->assertNotFound()->assertJsonPath('code', 'team.member_not_found');
    }

    public function test_ac5_le_filtre_agent_ne_rend_que_ses_biens_dans_l_agence_de_l_appelant(): void
    {
        $sien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->admin->id]);

        // Un agent d'une autre agence qui collabore sur un bien d'ici : liste vide quand même.
        $autreAgence = Agency::factory()->create();
        $etranger = $this->agencyAgent($autreAgence);
        Property::factory()->create(['agency_id' => $autreAgence->id, 'user_id' => $etranger->id]);
        PropertyCollaborator::query()->create(['property_id' => $sien->id, 'user_id' => $etranger->id, 'role' => CollaboratorRole::Agent]);

        $this->actingAsApi($this->admin);
        $ids = collect($this->getJson("/api/properties?filter[agent]={$this->agent->id}&fields[properties]=id")->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$sien->id], $ids);

        $this->getJson("/api/properties?filter[agent]={$etranger->id}&fields[properties]=id")
            ->assertOk()->assertJsonCount(0, 'data');
    }
}
