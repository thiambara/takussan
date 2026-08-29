<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-449 — « qui peut constituer une équipe » : la frontière, et le fait
 * qu'elle n'ait qu'UNE définition.
 *
 * ## Pourquoi ce fichier existe à côté d'`InviteAgentTest`
 *
 * TCK-392 avait fermé `POST /agencies/{id}/members` et éprouvé le chemin
 * canonique. Il restait **l'alias historique** `POST /agencies/{id}/agents`
 * (`routes/api/agencies.php`) : la même méthode de contrôleur, une seconde
 * route, et aucun test. Un futur découplage des routes en rouvrirait une sans
 * que rien ne bronche — c'est le motif que TCK-392 avait lui-même établi pour
 * `AgencyMemberRoleController@update`.
 *
 * L'inventaire des routes vient de `php artisan route:list`, pas de la
 * mémoire :
 *
 * ```
 * POST api/agencies/{agency}/agents   AgencyController@addAgent
 * POST api/agencies/{agency}/members  AgencyController@addAgent
 * ```
 *
 * ## AC5 — la définition unique se prouve par ABLATION, pas par lecture
 *
 * `AgencyKindGuard::canFormTeam()` est le seul endroit où la règle s'écrit.
 * Ce que ce fichier éprouve à l'exécution, ce sont ses effets ; ce qui prouve
 * l'unicité, c'est qu'en retirer le `Standard` fait rougir **d'un seul geste**
 * les deux familles — l'invitation (`agents/invite`) ET le rattachement
 * (`members`, `agents`, `members/{u}/role`). Une règle recopiée n'aurait fait
 * rougir qu'une moitié.
 */
class TeamFormationBoundaryTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les DEUX routes qui mènent à `AgencyController@addAgent`, dérivées de
     * `route:list`. Écrire la liste ici et boucler dessus est ce qui empêche
     * qu'un chemin reste couvert et l'autre non.
     *
     * @return list<string>
     */
    private function routesDeRattachement(Agency $agency): array
    {
        return [
            "/api/agencies/{$agency->id}/members",
            "/api/agencies/{$agency->id}/agents",
        ];
    }

    /**
     * AC1 + AC2 + AC4 — les deux routes refusent, sur une agence
     * `individual` **sans souscription**.
     *
     * ⚠ L'absence de souscription n'est pas un détail de mise en scène :
     * c'est LE cas où rien d'autre ne garde. `QuotaResolver::assertCanAddAgent()`
     * sort immédiatement quand l'agence n'a pas de souscription — croire qu'un
     * plan « individual » borne déjà l'équipe est faux dans le cas le plus
     * courant. Le test l'assère plutôt que de le supposer.
     */
    public function test_les_deux_routes_de_rattachement_refusent_une_agence_individuelle_sans_souscription(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        // Le garde de quota ne peut rien garder ici, et on le montre.
        $this->assertDatabaseMissing('agency_subscriptions', ['agency_id' => $agency->id]);

        foreach ($this->routesDeRattachement($agency) as $route) {
            $cible = User::factory()->create();

            $this->postJson($route, [
                'email' => $cible->email,
                'role' => 'agent',
            ])->assertStatus(403);

            // Un 403 qui écrit quand même n'est pas un refus.
            $this->assertDatabaseMissing('agent_profiles', [
                'user_id' => $cible->id,
                'agency_id' => $agency->id,
            ]);
        }
    }

    /**
     * AC3 — TÉMOIN. Les deux mêmes routes restent ouvertes sur une agence
     * `standard`, elle aussi sans souscription.
     *
     * Sans ce témoin, une garde qui refuserait tout le monde cocherait AC1 et
     * AC2 sans rien garder.
     */
    public function test_les_deux_routes_de_rattachement_restent_ouvertes_sur_une_agence_standard(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        foreach ($this->routesDeRattachement($agency) as $route) {
            $cible = User::factory()->create();

            $this->postJson($route, [
                'email' => $cible->email,
                'role' => 'agent',
            ])->assertOk();

            $this->assertDatabaseHas('agent_profiles', [
                'user_id' => $cible->id,
                'agency_id' => $agency->id,
            ]);
        }
    }

    /**
     * AC5 — l'invitation et le rattachement lisent la MÊME définition.
     *
     * Les deux familles sont éprouvées dans un seul test, sur la même agence,
     * pour que l'ablation de `AgencyKindGuard::canFormTeam()` les fasse rougir
     * ensemble : c'est cette simultanéité qui dit « une seule définition »,
     * et qu'aucune lecture de code ne peut affirmer.
     */
    public function test_invitation_et_rattachement_partagent_la_meme_definition(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $cible = User::factory()->create();
        $membre = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $membre->id, 'agency_id' => $agency->id]);

        // Rattachement — les deux routes.
        foreach ($this->routesDeRattachement($agency) as $route) {
            $this->postJson($route, ['email' => $cible->email, 'role' => 'agent'])
                ->assertStatus(403);
        }

        // Changement de rôle — les deux routes de la même méthode.
        $this->putJson("/api/agencies/{$agency->id}/members/{$membre->id}/role", ['role' => 'agency_admin'])
            ->assertStatus(403);
        $this->patchJson("/api/agencies/{$agency->id}/members/{$membre->id}", ['role' => 'agency_admin'])
            ->assertStatus(403);

        // Invitation d'agent.
        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'nouvel.agent@example.com',
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ])->assertStatus(403);

        // Invitation de propriétaire — libellé différent, même règle.
        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'nouveau.proprio@example.com',
            'first_name' => 'Modou',
            'last_name' => 'Fall',
            'owner_type' => 'individual',
        ])->assertStatus(403);

        $this->assertDatabaseMissing('agent_profiles', [
            'user_id' => $cible->id,
            'agency_id' => $agency->id,
        ]);
        $this->assertDatabaseMissing('agency_admin_profiles', [
            'user_id' => $membre->id,
            'agency_id' => $agency->id,
        ]);
        $this->assertDatabaseMissing('invitations', ['agency_id' => $agency->id]);
    }
}
