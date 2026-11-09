<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2506 — « L'équipe » d'une fiche d'agence ne liste que ses agents, et son compte est celui
 * du bandeau (`stats.agents`).
 *
 * Avant, l'équipe mêlait aux agents les propriétaires qui publient sous l'enseigne (TCK-276,
 * source 3) : un particulier qui confie son bien à une agence y paraissait, nommé, sans l'avoir
 * choisi — et même s'il l'a choisi, l'annuaire des personnes est sa place, pas l'équipe d'une
 * agence dont il est client.
 */
class PublicAgencyTeamAgentsOnlyTest extends TestCase
{
    use RefreshDatabase;

    private function publieur(string $username, Agency $agence): User
    {
        $user = User::factory()->create(['username' => $username, 'status' => UserStatus::Active]);
        $bien = Property::factory()->published()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
        ]);

        return $user;
    }

    public function test_l_equipe_ne_liste_que_les_agents_et_son_compte_est_celui_du_bandeau(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active, 'slug' => 'sahel-homes']);

        $agent = $this->publieur('moussa-agent', $agence);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $admin = User::factory()->create(['username' => 'admin-sahel', 'status' => UserStatus::Active]);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);

        $proprietaire = $this->publieur('awa-proprietaire', $agence);
        OwnerProfile::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);

        // Même le choix de l'annuaire ne fait pas d'un propriétaire un membre de l'équipe.
        $optant = $this->publieur('fatou-sur-option', $agence);
        $optant->forceFill(['listed_in_public_directory' => true])->save();

        $reponse = $this->getJson('/api/public/agencies/sahel-homes')->assertOk();

        $ids = collect($reponse->json('data.agents'))->pluck('id')->sort()->values()->all();
        $this->assertSame(collect([$agent->id, $admin->id])->sort()->values()->all(), $ids);
        $this->assertSame(['agent'], array_values(array_unique(array_column($reponse->json('data.agents'), 'public_role'))));
        $reponse->assertJsonPath('data.stats.agents', 2);
    }

    public function test_un_agent_d_une_autre_agence_qui_publie_ici_en_bailleur_n_est_pas_de_l_equipe(): void
    {
        $ici = Agency::factory()->create(['status' => AgencyStatus::Active, 'slug' => 'ici']);
        $ailleurs = Agency::factory()->create(['status' => AgencyStatus::Active]);

        $bailleur = $this->publieur('agent-d-ailleurs', $ici);
        AgentProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $ailleurs->id]);

        $this->getJson('/api/public/agencies/ici')
            ->assertOk()
            ->assertJsonCount(0, 'data.agents')
            ->assertJsonPath('data.stats.agents', 0);
    }
}
