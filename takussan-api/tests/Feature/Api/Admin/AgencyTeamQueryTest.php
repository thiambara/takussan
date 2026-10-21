<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1137 (P87.04) — `GET /api/admin/agencies/{id}/team` : `filter[status]` s'applique aux deux
 * branches de l'équipe (agents et propriétaires), un `sort=` demandé passe en premier, et l'ordre
 * par défaut (prénom, nom) suit `COLLATE "und-x-icu"` (P87.01).
 *
 * Avant : `whereHas(agents)->orWhereHas(propriétaires)` sans groupe, puis `orderBy('first_name')`
 * avant `buildQuery()` — le filtre ne visait que les propriétaires, et le tri demandé venait après
 * le prénom.
 */
class AgencyTeamQueryTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agentBloque;

    private User $proprietaireActif;

    protected function setUp(): void
    {
        parent::setUp();

        $this->actingAsRole('super_admin');
        $this->agency = Agency::factory()->create();

        $this->agentBloque = User::factory()->create([
            'first_name' => 'Agent', 'last_name' => 'Bloqué', 'email' => 'b@x.sn', 'status' => UserStatus::Blocked->value,
        ]);
        AgentProfile::factory()->create(['user_id' => $this->agentBloque->id, 'agency_id' => $this->agency->id]);

        $this->proprietaireActif = User::factory()->create([
            'first_name' => 'Proprio', 'last_name' => 'Actif', 'email' => 'a@x.sn', 'status' => UserStatus::Active->value,
        ]);
        OwnerProfile::factory()->create(['user_id' => $this->proprietaireActif->id, 'agency_id' => $this->agency->id]);

        // Hors de l'agence : ne doit jamais sortir, filtre ou non.
        User::factory()->create(['first_name' => 'Étranger', 'status' => UserStatus::Active->value]);
    }

    /** @return list<int> */
    private function ids(string $query = ''): array
    {
        return $this->getJson("/api/admin/agencies/{$this->agency->id}/team?per_page=100{$query}")
            ->assertOk()
            ->json('data.*.id');
    }

    public function test_le_filtre_de_statut_vaut_pour_les_agents_comme_pour_les_proprietaires(): void
    {
        $this->assertSame([$this->proprietaireActif->id], $this->ids('&filter[status]=active'));
        $this->assertSame([$this->agentBloque->id], $this->ids('&filter[status]=blocked'));
    }

    public function test_le_tri_demande_passe_avant_le_prenom(): void
    {
        $this->assertSame([$this->proprietaireActif->id, $this->agentBloque->id], $this->ids('&sort=email'));
        $this->assertSame([$this->agentBloque->id, $this->proprietaireActif->id], $this->ids('&sort=-email'));
    }

    public function test_l_ordre_par_defaut_suit_la_collation_icu(): void
    {
        foreach (['Zeynab', 'awa', 'Élodie'] as $prenom) {
            $user = User::factory()->create(['first_name' => $prenom, 'last_name' => 'Membre']);
            AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);
        }

        $prenoms = $this->getJson("/api/admin/agencies/{$this->agency->id}/team?per_page=100")
            ->assertOk()
            ->json('data.*.first_name');

        $this->assertSame(['Agent', 'awa', 'Élodie', 'Proprio', 'Zeynab'], $prenoms);
    }
}
