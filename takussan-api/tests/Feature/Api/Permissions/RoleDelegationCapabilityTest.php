<?php

namespace Tests\Feature\Api\Permissions;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\AgencyRoleCapabilityCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-395 — ce que la délégation accorde, et à qui il est permis de déléguer.
 *
 * Trois défauts mesurés le 2026-08-27, chacun couvert ici par un cas :
 *
 *  1. `delegable_roles` offrait `agent` et `owner` alors que les six sites
 *     d'appel du dépôt n'interrogeaient QUE `'agency_admin'` : les déléguer
 *     écrivait une ligne, émettait trois événements, envoyait deux
 *     notifications, s'affichait « Active » — et n'accordait rien.
 *  2. Le délégant pouvait accorder PLUS qu'il ne détenait : la délégation était
 *     le seul chemin du dépôt où une capacité s'obtenait sans passer par le
 *     pivot `agency_role_capabilities`.
 *  3. `RoleDelegationPolicy` gardait par TYPE DE PROFIL, et le catalogue
 *     `Capability` n'avait aucun cas pour ce geste.
 */
class RoleDelegationCapabilityTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        // L'invitation d'agent — le geste que ce fichier exécute derrière la
        // délégation — envoie un mail dont le rendu de vue produirait un 500
        // sans ce double. Patron de `InviteAgentTest`.
        Mail::fake();

        // `primary_admin_id` reste NUL : ce court-circuit épargne son porteur de
        // toute vérification de capacité, et un test qui l'emprunterait ne
        // mesurerait pas ce qu'il croit.
        $this->agency = Agency::factory()->create([
            'kind' => AgencyKind::Standard,
            'primary_admin_id' => null,
        ]);
    }

    /**
     * Un `agency_admin` dont le rôle personnalisé porte exactement
     * `$capabilities` — et rien d'autre.
     */
    private function adminAvecCapacites(array $capabilities): User
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $this->agency->id]);

        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        AgencyAdminProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);

        return $user;
    }

    private function agentMembre(): User
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);

        return $user;
    }

    /**
     * Un membre de l'agence dont **aucun** profil ne porte la moindre capacité :
     * tout ce qu'il peut faire vient alors de la délégation, et de rien d'autre.
     *
     * ⚠ Mesuré en écrivant ce fichier, et c'est le piège du harnais :
     * `User::factory()->create(['agency_id' => …])` crée AUSSI un `OwnerProfile`
     * sur cette agence — un shim de compatibilité de TCK-142, porté par
     * l'observateur `created` du modèle `User`, pour les dizaines de tests
     * écrits avant la chute de la colonne `users.agency_id`. Ce profil arrive
     * avec le rôle SYSTÈME `owner`, donc avec `properties.update_own`. Un
     * bénéficiaire qu'on croyait vierge détenait déjà la capacité qu'on
     * s'apprêtait à mesurer, et le cas « owner » d'AC2 mesurait alors zéro.
     *
     * On réaffecte donc chaque profil au rôle vide, plutôt que d'en créer un
     * de plus par-dessus : le résolveur est ADDITIF (OR entre profils), un
     * profil oublié suffit à fausser la mesure.
     */
    private function membreSansCapacite(): User
    {
        $user = $this->agentMembre();

        $roleVide = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([])
            ->create(['agency_id' => $this->agency->id]);

        foreach ([AgentProfile::class, OwnerProfile::class, AgencyAdminProfile::class] as $classe) {
            $classe::query()
                ->where('user_id', $user->id)
                ->where('agency_id', $this->agency->id)
                ->update(['agency_role_id' => $roleVide->id]);
        }

        return $user->fresh();
    }

    private function deleguer(User $delegant, User $beneficiaire, string $role): RoleDelegation
    {
        return RoleDelegation::query()->create([
            'user_id' => $beneficiaire->id,
            'delegator_id' => $delegant->id,
            'agency_id' => $this->agency->id,
            'role' => $role,
            'starts_at' => null,
            'ends_at' => now()->addWeek(),
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            // NOT NULL en base. Le champ est un instantané d'AUDIT des profils
            // natifs du bénéficiaire (TCK-278) et n'entre dans aucune
            // résolution d'autorisation — le laisser vide ne fausse rien ici.
            'user_native_roles_snapshot' => [],
        ]);
    }

    /**
     * AC1 — la borne, prouvée **par exécution d'un geste** derrière la
     * délégation et non par un assert sur un champ.
     *
     * Les deux délégants sont `agency_admin`, tous deux peuvent déléguer
     * (`team.delegate_role`), et tous deux délèguent la chaîne `'agency_admin'`.
     * Seul l'un des deux détient `team.invite`. Avant TCK-395, les six sites
     * d'appel honoraient la chaîne telle quelle : les DEUX bénéficiaires
     * auraient pu inviter.
     */
    public function test_une_delegation_naccorde_pas_ce_que_le_delegant_ne_detient_pas(): void
    {
        $delegantComplet = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);
        $delegantDepouille = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
        ]);

        $beneficiaireOk = $this->agentMembre();
        $beneficiaireKo = $this->agentMembre();

        $this->deleguer($delegantComplet, $beneficiaireOk, 'agency_admin');
        $this->deleguer($delegantDepouille, $beneficiaireKo, 'agency_admin');

        $charge = fn (string $email): array => [
            'email' => $email,
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
        ];

        // Le délégant détenait `team.invite` : le bénéficiaire invite.
        $this->actingAs($beneficiaireOk)
            ->postJson("/api/agencies/{$this->agency->id}/agents/invite", $charge('ok@exemple.sn'))
            ->assertCreated();

        // Le délégant ne le détenait pas : la même délégation, le même rôle
        // délégué, le même geste — et 403.
        $this->actingAs($beneficiaireKo)
            ->postJson("/api/agencies/{$this->agency->id}/agents/invite", $charge('ko@exemple.sn'))
            ->assertForbidden();
    }

    /**
     * La borne est évaluée à la LECTURE : dépouiller le délégant après coup
     * retire au bénéficiaire ce que la délégation lui conférait. Un instantané
     * pris à la création ne saurait pas le faire.
     */
    public function test_la_borne_suit_le_delegant_apres_la_creation(): void
    {
        $delegant = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);
        $beneficiaire = $this->agentMembre();
        $this->deleguer($delegant, $beneficiaire, 'agency_admin');

        $this->assertTrue($beneficiaire->canActAt(Capability::TeamInvite, $this->agency));

        // Le rôle du délégant perd `team.invite`.
        $role = AgencyRole::query()
            ->where('agency_id', $this->agency->id)
            ->whereHas('agencyAdminProfiles', fn ($q) => $q->where('user_id', $delegant->id))
            ->firstOrFail();
        $role->capabilities()->where('capability', Capability::TeamInvite->value)->delete();
        app(AgencyRoleCapabilityCache::class)->forget((int) $role->id);

        $this->assertFalse(
            $beneficiaire->fresh()->canActAt(Capability::TeamInvite, $this->agency),
            'Le bénéficiaire conserve une capacité que son délégant a perdue.',
        );
    }

    /**
     * AC2 — chaque valeur de `delegable_roles` accorde un droit mesurable.
     *
     * Le test ÉNUMÈRE la configuration : ajouter demain une entrée inerte à
     * `delegable_roles` le fait rougir, ce qui est exactement ce que le ticket
     * demande. Avant TCK-395, `agent` et `owner` échouaient ici.
     */
    public function test_chaque_role_delegable_accorde_un_droit_mesurable(): void
    {
        $roles = config('role_delegations.delegable_roles');
        $this->assertNotEmpty($roles);

        $delegant = $this->adminAvecCapacites(Capability::agencyAssignable());

        foreach ($roles as $role) {
            $type = AgencyRoleBaseType::tryFrom((string) $role);
            $this->assertNotNull($type, "`{$role}` n'est pas un type de rôle d'agence : il ne peut rien accorder.");

            $roleSysteme = AgencyRole::query()
                ->where('agency_id', $this->agency->id)
                ->where('base_profile_type', $type)
                ->where('is_system', true)
                ->firstOrFail();

            $accordees = $roleSysteme->capabilities()->pluck('capability')->all();
            $this->assertNotEmpty(
                $accordees,
                "Le rôle système `{$role}` ne porte aucune capacité : le déléguer n'accorderait rien.",
            );

            $beneficiaire = $this->membreSansCapacite();

            $temoin = Capability::from($accordees[0]);
            $this->assertFalse(
                $beneficiaire->canActAt($temoin, $this->agency),
                "Le bénéficiaire détient déjà `{$temoin->value}` : ce cas ne mesurerait pas la délégation.",
            );

            $delegation = $this->deleguer($delegant, $beneficiaire, (string) $role);

            $this->assertTrue(
                $beneficiaire->fresh()->canActAt($temoin, $this->agency),
                "Déléguer `{$role}` n'accorde rien : c'est un geste offert par la configuration dont le résultat est vide.",
            );

            // Et la révocation reprend ce qu'elle avait accordé.
            $delegation->update(['status' => RoleDelegationStatus::Revoked]);
            $this->assertFalse(
                $beneficiaire->fresh()->canActAt($temoin, $this->agency),
                "Révoquer `{$role}` laisse la capacité en place.",
            );
        }
    }

    /**
     * AC3 — la policy interroge une capacité, et non la présence d'un profil.
     */
    public function test_un_agency_admin_prive_de_la_capacite_recoit_403(): void
    {
        $sansCapacite = $this->adminAvecCapacites([Capability::TeamInvite]);

        $this->actingAs($sansCapacite)
            ->getJson("/api/agencies/{$this->agency->id}/role-delegations")
            ->assertForbidden();

        $this->actingAs($sansCapacite)
            ->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
                'user_id' => $this->agentMembre()->id,
                'role' => 'agent',
                'ends_at' => now()->addWeek()->toIso8601String(),
            ])
            ->assertForbidden();
    }

    public function test_un_agency_admin_porteur_de_la_capacite_est_admis(): void
    {
        $avecCapacite = $this->adminAvecCapacites([Capability::TeamDelegateRole]);

        $this->actingAs($avecCapacite)
            ->getJson("/api/agencies/{$this->agency->id}/role-delegations")
            ->assertOk();
    }

    /**
     * Une délégation ne se re-délègue pas : `delegationAllows()` interroge le
     * délégant par `resolveDirect()`, qui ne consulte aucune délégation. Sans
     * cette borne, deux délégations en chaîne fabriqueraient une capacité que
     * personne dans l'agence ne détient.
     */
    public function test_la_delegation_nest_pas_transitive(): void
    {
        $racine = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);
        $intermediaire = $this->agentMembre();
        $final = $this->agentMembre();

        $this->deleguer($racine, $intermediaire, 'agency_admin');
        $this->assertTrue($intermediaire->canActAt(Capability::TeamInvite, $this->agency));

        // L'intermédiaire ne détient `team.invite` QUE par délégation.
        $this->deleguer($intermediaire, $final, 'agency_admin');

        $this->assertFalse(
            $final->fresh()->canActAt(Capability::TeamInvite, $this->agency),
            'Une délégation adossée à une délégation accorde un droit que personne ne détient en propre.',
        );
    }
}
