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
    private function adminAvecCapacites(array $capabilities, ?Agency $agency = null): User
    {
        $agency ??= $this->agency;

        $user = User::factory()->create(['agency_id' => $agency->id]);

        return $this->faireAdminDe($user, $agency, $capabilities);
    }

    /** Ajoute à `$user` un `AgencyAdminProfile` dans `$agency`, portant exactement `$capabilities`. */
    private function faireAdminDe(User $user, Agency $agency, array $capabilities): User
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $agency->id]);

        AgencyAdminProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $role->id,
        ]);

        return $user->fresh();
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
     * BORNE DU PIVOT — relevée par la passe adverse : elle n'était gardée par
     * AUCUN test, alors qu'elle donne son titre au commit.
     *
     * Ablation qui doit faire rougir ce cas : retirer l'appel à
     * `systemRoleAllows()` dans `MembershipCapabilityResolver::delegationAllows()`.
     * Sans lui, déléguer `owner` — le type le plus faible — confère TOUT ce que
     * le délégant détient en propre, et la délégation cesse de passer par le
     * pivot `agency_role_capabilities`.
     *
     * Les cas d'AC1 et d'AC2 ne pouvaient pas l'attraper, et c'est instructif :
     * AC1 délègue `agency_admin`, dont le rôle système porte `team.invite` ;
     * AC2 prend pour témoin une capacité que le rôle délégué porte justement.
     * Il fallait le couple exact « le délégant l'a, le rôle délégué ne l'a pas ».
     */
    public function test_une_delegation_naccorde_que_ce_que_le_role_delegue_porte(): void
    {
        $delegant = $this->adminAvecCapacites(Capability::agencyAssignable());
        $beneficiaire = $this->membreSansCapacite();

        $this->deleguer($delegant, $beneficiaire, 'owner');
        $beneficiaire = $beneficiaire->fresh();

        // Le rôle système `owner` porte `properties.update_own` : la délégation
        // accorde bien quelque chose — sans ce témoin, le cas passerait aussi
        // si la branche délégation était entièrement débranchée.
        $this->assertTrue(
            $beneficiaire->canActAt(Capability::PropertiesUpdateOwn, $this->agency),
            'Déléguer `owner` n’accorde même pas ce que le rôle système owner porte.',
        );

        // Il ne porte PAS `team.invite`. Le délégant, lui, la détient.
        $this->assertTrue($delegant->canActAt(Capability::TeamInvite, $this->agency));
        $this->assertFalse(
            $beneficiaire->canActAt(Capability::TeamInvite, $this->agency),
            'Déléguer `owner` confère une capacité que le rôle système owner ne porte pas : '.
            'la délégation ne passe plus par le pivot `agency_role_capabilities`.',
        );
    }

    /**
     * BORNE DE FENÊTRE — relevée par la passe adverse, non gardée.
     *
     * Ablation : retirer le `where(ends_at NULL OR ends_at > now())` de
     * `delegationAllows()`.
     *
     * Le cas n'est pas théorique. `ProcessRoleDelegationsJob` ne passe que
     * toutes les 5 minutes : entre l'échéance et son balayage, une délégation
     * porte `ends_at` dans le passé ET `status = Active`. La colonne de statut
     * ne peut donc pas servir seule de fenêtre — c'est précisément l'intervalle
     * pendant lequel un privilège doit être déjà retiré.
     */
    public function test_une_delegation_echue_naccorde_plus_rien_avant_meme_le_passage_du_job(): void
    {
        $delegant = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);
        $beneficiaire = $this->membreSansCapacite();

        $delegation = $this->deleguer($delegant, $beneficiaire, 'agency_admin');

        // Témoin : dans sa fenêtre, elle confère.
        $this->assertTrue($beneficiaire->fresh()->canActAt(Capability::TeamInvite, $this->agency));

        // Échue, mais le job n'est pas passé : le statut est TOUJOURS `Active`.
        $delegation->forceFill(['ends_at' => now()->subMinute()])->save();
        $this->assertSame(RoleDelegationStatus::Active, $delegation->fresh()->status);

        $this->assertFalse(
            $beneficiaire->fresh()->canActAt(Capability::TeamInvite, $this->agency),
            'Une délégation échue confère encore tant que le job de balayage n’est pas passé.',
        );
    }

    /**
     * BORNE D'AGENCE — relevée par la passe adverse, non gardée.
     *
     * Ablation : retirer le `where('agency_id', $agencyId)` de
     * `delegationAllows()`.
     *
     * C'est le principe non négociable n°2 — *l'agence est la frontière
     * d'isolation* — appliqué au seul chemin d'autorisation que TCK-395 ouvre.
     * Une délégation reçue dans l'agence A ne doit rien conférer dans B, même
     * quand le même utilisateur est membre des deux et que B porte les mêmes
     * rôles système.
     */
    public function test_une_delegation_ne_franchit_pas_la_frontiere_dagence(): void
    {
        $autre = Agency::factory()->create([
            'kind' => AgencyKind::Standard,
            'primary_admin_id' => null,
        ]);

        // ⚠ Le délégant est administrateur des DEUX agences, et c'est ce qui
        // rend ce cas sensible à son ablation. Première rédaction : il n'était
        // admin que de la première, et le test restait VERT sans le scope
        // d'agence — parce que la borne du délégant l'attrapait à sa place
        // (`resolveDirect($delegant, …, $autre)` rendait faux). Une borne en
        // masquait une autre, et le test ne gardait rien.
        //
        // *Deux bornes qui se recouvrent ne se gardent pas l'une l'autre : il
        // faut construire le cas où la seconde ne peut pas répondre.*
        $delegant = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);
        $this->faireAdminDe($delegant, $autre, [
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);

        $beneficiaire = $this->membreSansCapacite();
        AgentProfile::query()->create([
            'user_id' => $beneficiaire->id,
            'agency_id' => $autre->id,
        ]);

        // La délégation n'existe QUE dans la première agence.
        $this->deleguer($delegant, $beneficiaire, 'agency_admin');
        $beneficiaire = $beneficiaire->fresh();

        $this->assertTrue(
            $beneficiaire->canActAt(Capability::TeamInvite, $this->agency),
            'La délégation ne confère pas dans SON agence : le témoin est cassé.',
        );
        $this->assertFalse(
            $beneficiaire->canActAt(Capability::TeamInvite, $autre),
            'Une délégation reçue dans une agence confère dans une AUTRE : '.
            'la frontière d’isolation est franchie (principe non négociable n°2).',
        );
    }

    /**
     * Le droit de déléguer n'est PAS délégable — relevé par la passe adverse.
     *
     * Ablation : rendre à `RoleDelegationPolicy::viewAny()` son
     * `canActAt(...)` (au lieu de `canActDirectlyAt(...)`).
     *
     * `canActAt()` consulte les délégations depuis TCK-395. Un délégué, sans
     * `AgencyAdminProfile`, obtenait donc 200 sur la liste et **201 sur la
     * création** — contre 403 et 403 avant le ticket. Et la sous-délégation
     * ainsi créée n'aurait rien accordé, par la non-transitivité que ce même
     * ticket installe : c'est mot pour mot la Mesure 1 du ticket, réintroduite
     * par sa propre correction. *Fermer la porte et rouvrir la fenêtre.*
     */
    public function test_un_delegue_ne_peut_pas_sous_deleguer(): void
    {
        $delegant = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);
        $delegue = $this->membreSansCapacite();
        $this->deleguer($delegant, $delegue, 'agency_admin');

        // Le délégué tient bien `team.delegate_role` PAR DÉLÉGATION — sans ce
        // témoin, le cas serait vert même si la délégation n'accordait rien.
        $this->assertTrue($delegue->fresh()->canActAt(Capability::TeamDelegateRole, $this->agency));
        $this->assertFalse($delegue->fresh()->canActDirectlyAt(Capability::TeamDelegateRole, $this->agency));

        $this->actingAs($delegue)
            ->getJson("/api/agencies/{$this->agency->id}/role-delegations")
            ->assertForbidden();

        $this->actingAs($delegue)
            ->postJson("/api/agencies/{$this->agency->id}/role-delegations", [
                'user_id' => $this->agentMembre()->id,
                'role' => 'agent',
                'ends_at' => now()->addDays(3)->toIso8601String(),
            ])
            ->assertForbidden();
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
