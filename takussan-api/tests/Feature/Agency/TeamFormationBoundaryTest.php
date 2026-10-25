<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-449 — « qui peut constituer une équipe » : la frontière, et le fait
 * qu'elle n'ait qu'UNE définition.
 *
 * ## Pourquoi ce fichier existe à côté d'`InviteAgentTest`
 *
 * TCK-392 avait fermé `POST /agencies/{id}/members` et son alias historique
 * `POST /agencies/{id}/agents`. TCK-2365 (P242.01) les a retirés : un compte
 * existant entre dans l'équipe par l'invitation, au rôle agent OU
 * administrateur. Ce fichier éprouve donc la frontière sur les deux rôles de
 * l'invitation, comme il l'éprouvait sur les deux routes : un rôle couvert et
 * l'autre non est le motif que TCK-392 avait établi.
 *
 * ## AC5 — la définition unique se prouve par ABLATION, pas par lecture
 *
 * `AgencyKindGuard::canFormTeam()` est le seul endroit où la règle s'écrit.
 * Ce que ce fichier éprouve à l'exécution, ce sont ses effets ; ce qui prouve
 * l'unicité, c'est qu'en retirer le `Standard` fait rougir **d'un seul geste**
 * les deux familles — l'invitation (`agents/invite`, aux deux rôles) ET le
 * changement de rôle (`members/{u}/role`). Une règle recopiée n'aurait fait
 * rougir qu'une moitié.
 */
class TeamFormationBoundaryTest extends TestCase
{
    use RefreshDatabase;

    /** Les deux rôles auxquels l'invitation fait entrer un compte dans l'équipe (TCK-2365). */
    private const ROLES_D_EQUIPE = ['agent', 'agency_admin'];

    private function inviter(Agency $agency, User $cible, string $role): TestResponse
    {
        return $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => $cible->email,
            'role' => $role,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ]);
    }

    /**
     * AC1 + AC2 + AC4 — l'invitation refuse, aux deux rôles, sur une agence
     * `individual` **sans souscription**.
     *
     * ⚠ L'absence de souscription n'est pas un détail de mise en scène :
     * c'est LE cas où rien d'autre ne garde. Croire qu'un plan « individual »
     * borne déjà l'équipe est faux dans le cas le plus courant. Le test
     * l'assère plutôt que de le supposer.
     */
    public function test_les_deux_roles_de_l_invitation_refusent_une_agence_individuelle_sans_souscription(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->assertDatabaseMissing('agency_subscriptions', ['agency_id' => $agency->id]);

        foreach (self::ROLES_D_EQUIPE as $role) {
            $this->inviter($agency, User::factory()->create(), $role)->assertStatus(403);
        }

        // Un 403 qui écrit quand même n'est pas un refus.
        $this->assertDatabaseMissing('agent_profiles', ['agency_id' => $agency->id, 'user_id' => null]);
        $this->assertDatabaseMissing('invitations', ['agency_id' => $agency->id]);
    }

    /**
     * AC3 — TÉMOIN. Les deux mêmes rôles restent ouverts sur une agence
     * `standard`, elle aussi sans souscription.
     *
     * Sans ce témoin, une garde qui refuserait tout le monde cocherait AC1 et
     * AC2 sans rien garder.
     */
    public function test_les_deux_roles_de_l_invitation_restent_ouverts_sur_une_agence_standard(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        foreach (self::ROLES_D_EQUIPE as $role) {
            $this->inviter($agency, User::factory()->create(), $role)->assertCreated();
        }

        $this->assertSame(2, AgentProfile::query()->where('agency_id', $agency->id)->whereNull('user_id')->count());
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

        // Invitation d'un administrateur — le rôle qui remplace le rattachement direct.
        $this->inviter($agency, $cible, 'agency_admin')->assertStatus(403);

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
