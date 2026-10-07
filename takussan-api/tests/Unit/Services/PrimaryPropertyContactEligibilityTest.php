<?php

namespace Tests\Unit\Services;

use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Notifications\NewContactLeadNotification;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-590 AC18b — **le contact principal est quelqu'un qui est encore là.**
 *
 * `PrimaryPropertyContact::agentPrincipal` ne filtrait que `user !== null`. Un agent BLOQUÉ
 * (statut seul) ou RETIRÉ de l'agence (profil supprimé, ligne de collaboration intacte) restait
 * destinataire du lead, de la notification, et son numéro était affiché aux visiteurs.
 *
 * Chaque cas croise les quatre surfaces que la règle sert : la piste (`recipient_user_id`), la
 * notification, `GET …/contact` et `primary_contact` de la fiche.
 */
class PrimaryPropertyContactEligibilityTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** @return array{0: Property, 1: User, 2: User, 3: User} [bien, ancien, suivant, propriétaire] */
    private function bienADeuxAgents(): array
    {
        $agency = $this->agence();
        $owner = $this->bailleur($agency, ['phone' => '+221770000001']);
        $ancien = $this->personnel($agency, attributes: ['phone' => '+221770000002']);
        $suivant = $this->personnel($agency, attributes: ['phone' => '+221770000003']);

        $property = $this->bienDe($agency, $owner);
        $this->collaborateur($property, $ancien, '2026-01-10 09:00:00');
        $this->collaborateur($property, $suivant, '2026-05-20 09:00:00');

        return [$property, $ancien, $suivant, $owner];
    }

    /** Les quatre surfaces désignent `$attendu`, et la notification ne part que chez lui. */
    private function assertLesQuatreSurfacesDesignent(Property $property, User $attendu, User $ecarte): void
    {
        Notification::fake();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop',
            'phone' => '+221771234567',
            'message' => 'Bonjour, ce bien est-il encore disponible ?',
        ])->assertCreated();

        $this->assertSame($attendu->id, PropertyContactLead::query()->sole()->recipient_user_id);
        Notification::assertSentTo($attendu, NewContactLeadNotification::class);
        Notification::assertNotSentTo($ecarte, NewContactLeadNotification::class);

        $this->getJson("/api/public/properties/{$property->slug}/contact")
            ->assertOk()
            ->assertExactJson(['phone' => $attendu->phone]);

        $this->getJson("/api/public/properties/{$property->slug}")
            ->assertOk()
            ->assertJsonPath('data.primary_contact.id', $attendu->id);
    }

    public function test_l_agent_bloque_n_est_plus_le_contact_principal(): void
    {
        [$property, $ancien, $suivant] = $this->bienADeuxAgents();
        $ancien->update(['status' => UserStatus::Blocked]);

        $this->assertLesQuatreSurfacesDesignent($property, $suivant, $ancien);
    }

    public function test_l_agent_retire_de_l_agence_n_est_plus_le_contact_principal(): void
    {
        [$property, $ancien, $suivant] = $this->bienADeuxAgents();
        // `AgentInvitationService::remove` : le profil est supprimé, la collaboration reste.
        AgentProfile::query()->where('user_id', $ancien->id)->first()->delete();
        $this->assertDatabaseHas('property_collaborators', ['property_id' => $property->id, 'user_id' => $ancien->id]);

        $this->assertLesQuatreSurfacesDesignent($property, $suivant, $ancien);
    }

    public function test_sans_collaborateur_eligible_le_proprietaire_repond(): void
    {
        [$property, $ancien, $suivant, $owner] = $this->bienADeuxAgents();
        $ancien->update(['status' => UserStatus::Blocked]);
        AgentProfile::query()->where('user_id', $suivant->id)->first()->delete();

        $this->assertLesQuatreSurfacesDesignent($property, $owner, $ancien);
    }

    public function test_un_proprietaire_bloque_n_est_pas_un_repli(): void
    {
        $owner = User::factory()->create(['status' => UserStatus::Blocked]);
        $property = $this->bienDe(null, $owner);

        $this->assertNull(PrimaryPropertyContact::for($property->load(PrimaryPropertyContact::eagerLoads())));
    }

    /** Vérification adverse (m1) — un collaborateur au profil SUSPENDU n'est pas contact principal. */
    public function test_l_agent_suspendu_n_est_plus_le_contact_principal(): void
    {
        [$property, $ancien, $suivant] = $this->bienADeuxAgents();
        AgentProfile::query()->where('user_id', $ancien->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->assertLesQuatreSurfacesDesignent($property, $suivant, $ancien);
    }

    public function test_l_ordre_d_invitation_reste_la_regle_entre_eligibles(): void
    {
        [$property, $ancien] = $this->bienADeuxAgents();

        $this->assertSame($ancien->id, PrimaryPropertyContact::for($property->load(PrimaryPropertyContact::eagerLoads()))?->id);
    }

    /**
     * Depuis TCK-587, juger le personnel est une requête (`isStaffAt`, la définition unique) :
     * l'éligibilité ne doit pas en coûter une par collaborateur. Le coût ne dépend pas de leur
     * nombre — on s'arrête au premier éligible dans l'ordre.
     */
    public function test_l_eligibilite_ne_coute_aucune_requete_par_collaborateur(): void
    {
        $cout = function (Property $property): int {
            $chargee = Property::query()->with(PrimaryPropertyContact::eagerLoads())->findOrFail($property->id);
            DB::flushQueryLog();
            DB::enableQueryLog();
            PrimaryPropertyContact::for($chargee);
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        [$deux] = $this->bienADeuxAgents();
        [$six] = $this->bienADeuxAgents();
        foreach (range(1, 4) as $i) {
            $this->collaborateur($six, $this->personnel($six->agency), "2026-06-0{$i} 09:00:00");
        }

        $this->assertSame($cout($deux), $cout($six));
        $this->assertLessThanOrEqual(3, $cout($six));
    }
}
