<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-573 — un propriétaire n'est jamais présenté comme agent immobilier.
 *
 * `/agents/{username}` est la fiche de toute personne publiée comme contact d'un bien (TCK-436,
 * option b) ; `properties.user_id` est le bailleur (TCK-142). Rien, dans la charge publique, ne
 * distinguait un propriétaire d'un agent : le front titrait donc « — Agent immobilier » la fiche
 * d'un propriétaire. `public_role` le dit, sur les trois surfaces qui listent des personnes.
 *
 * Chaque test crée les DEUX sortes de personnes et affirme les deux faits : un champ qui vaudrait
 * toujours `owner` (ou toujours `agent`) cocherait la moitié d'une assertion écrite pour une seule.
 */
class PublicRoleTest extends TestCase
{
    use RefreshDatabase;

    private function publieur(string $username, ?Agency $agence = null): User
    {
        $user = User::factory()->create([
            'username' => $username,
            'status' => UserStatus::Active,
        ]);

        $bien = Property::factory()->published()->create([
            'user_id' => $user->id,
            'agency_id' => $agence?->id,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
        ]);

        return $user;
    }

    public function test_la_fiche_dit_owner_pour_un_proprietaire_et_agent_pour_un_agent(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);

        $proprietaire = $this->publieur('awa-proprietaire', $agence);
        OwnerProfile::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);

        $agent = $this->publieur('moussa-agent', $agence);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $this->getJson('/api/public/agents/awa-proprietaire')
            ->assertOk()
            ->assertJsonPath('data.public_role', 'owner');

        $this->getJson('/api/public/agents/moussa-agent')
            ->assertOk()
            ->assertJsonPath('data.public_role', 'agent');
    }

    public function test_un_profil_d_agent_ou_d_admin_suspendu_ne_fait_pas_un_agent_un_admin_actif_et_un_courtier_en_sont(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);

        $suspendu = $this->publieur('agent-suspendu', $agence);
        AgentProfile::factory()->suspended()->create(['user_id' => $suspendu->id, 'agency_id' => $agence->id]);

        $admin = $this->publieur('admin-agence', $agence);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);

        $courtier = $this->publieur('courtier');
        BrokerProfile::factory()->create(['user_id' => $courtier->id]);

        // Le filtre `active()` vaut pour les DEUX profils d'agence : un admin suspendu n'exerce plus
        // (TCK-573, relevé par la vérification — le retirer côté admin laissait la suite verte).
        $adminSuspendu = $this->publieur('admin-suspendu', $agence);
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $adminSuspendu->id, 'agency_id' => $agence->id]);

        $this->getJson('/api/public/agents/agent-suspendu')->assertJsonPath('data.public_role', 'owner');
        $this->getJson('/api/public/agents/admin-suspendu')->assertJsonPath('data.public_role', 'owner');
        $this->getJson('/api/public/agents/admin-agence')->assertJsonPath('data.public_role', 'agent');
        $this->getJson('/api/public/agents/courtier')->assertJsonPath('data.public_role', 'agent');
    }

    /**
     * Seul le statut `active` fait un agent — pas « tout sauf `suspended` ». La vérification a
     * remplacé `active()` par `where('status', '!=', 'suspended')` : le test précédent restait
     * vert, et un profil `draft`, `inactive` ou un admin `archived` aurait été présenté comme
     * « Agent immobilier ».
     *
     * Les statuts sont tirés des ENUMS et non écrits à la main : un statut ajouté demain est
     * éprouvé sans qu'on pense à revenir ici.
     */
    public function test_tout_statut_de_profil_autre_qu_actif_presente_la_personne_en_proprietaire(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $attendus = [];

        foreach (AgentProfileStatus::cases() as $statut) {
            if ($statut === AgentProfileStatus::Active) {
                continue;
            }
            $user = $this->publieur('agent-'.$statut->value, $agence);
            AgentProfile::factory()->create([
                'user_id' => $user->id,
                'agency_id' => $agence->id,
                'status' => $statut->value,
            ]);
            $attendus['agent-'.$statut->value] = 'owner';
        }

        foreach (AgencyAdminProfileStatus::cases() as $statut) {
            if ($statut === AgencyAdminProfileStatus::Active) {
                continue;
            }
            $user = $this->publieur('admin-'.$statut->value, $agence);
            AgencyAdminProfile::factory()->create([
                'user_id' => $user->id,
                'agency_id' => $agence->id,
                'status' => $statut->value,
            ]);
            $attendus['admin-'.$statut->value] = 'owner';
        }

        // Garde contre une boucle vide : draft, inactive, suspended + suspended, archived.
        $this->assertGreaterThanOrEqual(5, count($attendus));

        $obtenus = [];
        foreach (array_keys($attendus) as $slug) {
            $obtenus[$slug] = $this->getJson('/api/public/agents/'.$slug)->assertOk()->json('data.public_role');
        }

        $this->assertSame($attendus, $obtenus);
    }

    public function test_l_index_porte_le_role_de_chaque_ligne(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);

        $proprietaire = $this->publieur('index-proprietaire', $agence);
        OwnerProfile::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);

        $agent = $this->publieur('index-agent', $agence);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $roles = collect($this->getJson('/api/public/agents?per_page=48')->assertOk()->json('data'))
            ->pluck('public_role', 'slug')
            ->all();

        $this->assertSame('owner', $roles['index-proprietaire'] ?? null);
        $this->assertSame('agent', $roles['index-agent'] ?? null);
    }

    public function test_l_equipe_d_une_agence_distingue_les_proprietaires_et_ne_les_compte_pas_comme_agents(): void
    {
        $agence = Agency::factory()->create(['slug' => 'equipe-mixte', 'status' => AgencyStatus::Active]);

        $proprietaire = $this->publieur('equipe-proprietaire', $agence);
        OwnerProfile::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => $agence->id]);

        $agent = User::factory()->create(['username' => 'equipe-agent', 'status' => UserStatus::Active]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);

        $reponse = $this->getJson('/api/public/agencies/equipe-mixte')->assertOk();

        $roles = collect($reponse->json('data.agents'))->pluck('public_role', 'slug')->all();
        $this->assertSame(['equipe-proprietaire' => 'owner', 'equipe-agent' => 'agent'], $roles);
        // Deux personnes dans l'équipe, UN agent : avant TCK-573, la statistique « Agents » valait 2.
        $reponse->assertJsonPath('data.stats.agents', 1)->assertJsonCount(2, 'data.agents');
    }

    /**
     * L'équipe juge le rôle par `rolesPublics()`, jamais par la seule présence d'un `AgentProfile`
     * rattaché à l'agence (reprise du 2026-09-24). Le test précédent n'éprouvait que « propriétaire
     * sans profil » et « agent actif » : la mutation
     * `'public_role' => $profile !== null ? 'agent' : 'owner'` le laissait vert — alors qu'elle
     * présente en agent un profil SUSPENDU (qui reste dans l'équipe : la liste des membres n'est
     * pas filtrée par statut) et en propriétaire un ADMIN d'agence actif ou un COURTIER qui publie
     * sous l'enseigne, tous deux sans `AgentProfile`.
     */
    public function test_l_equipe_suit_la_regle_des_roles_publics_et_non_la_presence_d_un_profil_d_agent(): void
    {
        $agence = Agency::factory()->create(['slug' => 'equipe-statuts', 'status' => AgencyStatus::Active]);

        $suspendu = User::factory()->create(['username' => 'equipe-agent-suspendu', 'status' => UserStatus::Active]);
        AgentProfile::factory()->suspended()->create(['user_id' => $suspendu->id, 'agency_id' => $agence->id]);

        $admin = User::factory()->create(['username' => 'equipe-admin-actif', 'status' => UserStatus::Active]);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);

        $courtier = $this->publieur('equipe-courtier', $agence);
        BrokerProfile::factory()->create(['user_id' => $courtier->id]);

        $reponse = $this->getJson('/api/public/agencies/equipe-statuts')->assertOk();

        $roles = collect($reponse->json('data.agents'))->pluck('public_role', 'slug')->sortKeys()->all();
        $this->assertSame([
            'equipe-admin-actif' => 'agent',
            'equipe-agent-suspendu' => 'owner',
            'equipe-courtier' => 'agent',
        ], $roles);
        $reponse->assertJsonPath('data.stats.agents', 2);
    }

    /**
     * Sur la fiche d'une agence, « agent » veut dire agent DE CETTE AGENCE (reprise du 2026-09-24,
     * vérification adverse) : `rolesPublics()` compte un `AgentProfile` ou un `AgencyAdminProfile`
     * actif dans N'IMPORTE QUELLE agence. Une personne agent actif de l'agence B, qui publie sous
     * l'enseigne A un bien dont elle est le bailleur, était présentée en « agent » dans l'équipe de
     * A — et comptée dans sa statistique « Agents ». Sa propre fiche (`/agents/{slug}`), qui ne
     * parle d'aucune agence, continue de la dire agent.
     */
    public function test_un_agent_d_une_autre_agence_qui_publie_sous_l_enseigne_y_est_presente_en_proprietaire(): void
    {
        $agence = Agency::factory()->create(['slug' => 'equipe-enseigne-a', 'status' => AgencyStatus::Active]);
        $autre = Agency::factory()->create(['slug' => 'equipe-enseigne-b', 'status' => AgencyStatus::Active]);

        $agentAilleurs = $this->publieur('equipe-agent-de-b', $agence);
        AgentProfile::factory()->create(['user_id' => $agentAilleurs->id, 'agency_id' => $autre->id]);

        $adminAilleurs = $this->publieur('equipe-admin-de-b', $agence);
        AgencyAdminProfile::factory()->create(['user_id' => $adminAilleurs->id, 'agency_id' => $autre->id]);

        $agentIci = User::factory()->create(['username' => 'equipe-agent-de-a', 'status' => UserStatus::Active]);
        AgentProfile::factory()->create(['user_id' => $agentIci->id, 'agency_id' => $agence->id]);

        $reponse = $this->getJson('/api/public/agencies/equipe-enseigne-a')->assertOk();

        $roles = collect($reponse->json('data.agents'))->pluck('public_role', 'slug')->sortKeys()->all();
        $this->assertSame([
            'equipe-admin-de-b' => 'owner',
            'equipe-agent-de-a' => 'agent',
            'equipe-agent-de-b' => 'owner',
        ], $roles);
        $reponse->assertJsonPath('data.stats.agents', 1);

        // Hors de toute agence, la personne reste ce qu'elle est : un agent immobilier.
        $this->getJson('/api/public/agents/equipe-agent-de-b')->assertJsonPath('data.public_role', 'agent');
    }
}
