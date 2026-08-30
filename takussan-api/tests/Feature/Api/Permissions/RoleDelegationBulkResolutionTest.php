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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-457 — le balayage des 45 capacités faisait un `SELECT` sur
 * `role_delegations` **par capacité refusée en propre**.
 *
 * ⚠ **La sortie n'est PAS un cache, et ce fichier est ce qui fait la
 * différence.** Une mémoïsation par `(user, agence, capacité)` a été essayée en
 * revue de TCK-395 : elle passe le compte de requêtes, et fait rougir 4 des 10
 * cas de `RoleDelegationCapabilityTest`. Ce qui est fait ici est un CHARGEMENT
 * GROUPÉ, borné à une passe de résolution : rien ne survit à la passe, donc il
 * n'y a rien à invalider — et la fenêtre, qui n'émet aucun événement quand
 * l'horloge franchit `ends_at`, reste réévaluée à chaque requête HTTP.
 *
 * Les cas de fraîcheur ci-dessous sont là pour ça : ils enchaînent DEUX requêtes
 * HTTP dans le même test, ce qu'un cache d'instance ou une liaison `scoped`
 * ne survivrait pas.
 */
class RoleDelegationBulkResolutionTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $delegant;

    private User $beneficiaire;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        $this->agency = Agency::factory()->create([
            'kind' => AgencyKind::Standard,
            'primary_admin_id' => null,
        ]);

        $this->delegant = $this->adminAvecCapacites(Capability::agencyAssignable());
        $this->beneficiaire = $this->membreSansCapacite();
    }

    /**
     * AC1 — le compte de requêtes sur `role_delegations`, mesuré sur le parcours
     * du ticket : le balayage des 45 capacités par `GET /api/me/capabilities`.
     *
     * Le bénéficiaire ne tient AUCUNE capacité en propre : les 45 passent donc
     * toutes par la branche délégation. C'est le pire cas, et c'est celui qu'il
     * faut mesurer — un utilisateur dont les profils accordent tout ne
     * traverserait jamais la branche.
     *
     * Mesuré le 2026-08-29 : **45 avant, 1 après**.
     */
    public function test_le_balayage_des_capacites_ne_charge_les_delegations_quune_fois(): void
    {
        $this->deleguer('agent');

        [$total, $surDelegations] = $this->compterLesRequetes(function (): void {
            Sanctum::actingAs($this->beneficiaire->fresh());
            $this->getJson("/api/me/capabilities?agency_id={$this->agency->id}")->assertOk();
        });

        fwrite(STDERR, "\n[TCK-457] requêtes totales={$total} dont role_delegations={$surDelegations}\n");

        $this->assertLessThanOrEqual(
            1,
            $surDelegations,
            'Le balayage des capacités charge les délégations plus d’une fois : la résolution est '
            ."restée en N+1 ({$surDelegations} SELECT sur `role_delegations`).",
        );
    }

    /**
     * AC1 bis — la même mesure sur `agency_roles`, que la passe groupée charge
     * aussi une seule fois. Sans elle, une délégation présente coûtait un
     * `SELECT` de rôle système **par capacité**, en plus du `SELECT` de
     * délégation : le N+1 se serait déplacé au lieu de disparaître.
     */
    public function test_le_balayage_ne_recharge_pas_le_role_systeme_a_chaque_capacite(): void
    {
        $this->deleguer('agent');

        $surRoles = 0;
        DB::listen(function ($query) use (&$surRoles): void {
            if (str_contains($query->sql, '"agency_roles"') && str_starts_with($query->sql, 'select')) {
                $surRoles++;
            }
        });

        Sanctum::actingAs($this->beneficiaire->fresh());
        $this->getJson("/api/me/capabilities?agency_id={$this->agency->id}")->assertOk();

        fwrite(STDERR, "\n[TCK-457] SELECT sur agency_roles = {$surRoles}\n");

        $this->assertLessThanOrEqual(
            2,
            $surRoles,
            "La passe recharge les rôles système à chaque capacité ({$surRoles} SELECT sur `agency_roles`).",
        );
    }

    /**
     * AC3 — révocation : la capacité tombe à la requête HTTP SUIVANTE, sans
     * purge et sans TTL. C'est le cas qu'une liaison `scoped` ou un cache
     * statique ne passerait pas : deux requêtes HTTP se suivent dans le même
     * test, donc dans le même conteneur.
     */
    public function test_une_delegation_revoquee_cesse_daccorder_a_la_requete_suivante(): void
    {
        $delegation = $this->deleguer('agency_admin');
        $temoin = Capability::TeamInvite->value;

        $this->assertContains($temoin, $this->capacitesParHttp(), 'Le témoin est cassé : la délégation n’accorde rien.');

        $delegation->update(['status' => RoleDelegationStatus::Revoked]);

        $this->assertNotContains(
            $temoin,
            $this->capacitesParHttp(),
            'Une délégation révoquée accorde encore à la requête suivante : le chargement groupé s’est mué en cache.',
        );
    }

    /**
     * AC3 — expiration par l'HORLOGE, et c'est celle qui tranche : aucun
     * événement n'est émis quand `now()` franchit `ends_at`. Le statut reste
     * `Active` tant que `ProcessRoleDelegationsJob` n'est pas passé (5 min).
     * Un cache avec TTL laisserait ouvert exactement l'intervalle que cette
     * borne existe pour fermer.
     */
    public function test_une_delegation_echue_par_lhorloge_cesse_daccorder_a_la_requete_suivante(): void
    {
        $delegation = $this->deleguer('agency_admin');
        $temoin = Capability::TeamInvite->value;

        $this->assertContains($temoin, $this->capacitesParHttp());

        $delegation->forceFill(['ends_at' => now()->subMinute()])->save();
        $this->assertSame(RoleDelegationStatus::Active, $delegation->fresh()->status);

        $this->assertNotContains(
            $temoin,
            $this->capacitesParHttp(),
            'Une délégation échue accorde encore : la fenêtre n’est plus réévaluée à chaque requête.',
        );
    }

    /**
     * AC3 — le délégant dépouillé. La borne est évaluée à la LECTURE (TCK-395) ;
     * un chargement groupé ne doit pas la figer.
     */
    public function test_un_delegant_depouille_cesse_de_conferer_a_la_requete_suivante(): void
    {
        $this->deleguer('agency_admin');
        $temoin = Capability::TeamInvite->value;

        $this->assertContains($temoin, $this->capacitesParHttp());

        $role = AgencyRole::query()
            ->where('agency_id', $this->agency->id)
            ->whereHas('agencyAdminProfiles', fn ($q) => $q->where('user_id', $this->delegant->id))
            ->firstOrFail();
        $role->capabilities()->where('capability', $temoin)->delete();
        app(AgencyRoleCapabilityCache::class)->forget((int) $role->id);

        $this->assertNotContains(
            $temoin,
            $this->capacitesParHttp(),
            'Le bénéficiaire conserve une capacité que son délégant a perdue.',
        );
    }

    // ---------------------------------------------------------------- outillage

    /** @return list<string> */
    private function capacitesParHttp(): array
    {
        Sanctum::actingAs($this->beneficiaire->fresh());

        return $this->getJson("/api/me/capabilities?agency_id={$this->agency->id}")
            ->assertOk()
            ->json('data.capabilities');
    }

    /** @return array{0:int,1:int} total, dont `role_delegations` */
    private function compterLesRequetes(callable $parcours): array
    {
        $total = 0;
        $surDelegations = 0;
        DB::listen(function ($query) use (&$total, &$surDelegations): void {
            $total++;
            if (str_contains($query->sql, '"role_delegations"')) {
                $surDelegations++;
            }
        });

        $parcours();

        return [$total, $surDelegations];
    }

    private function deleguer(string $role): RoleDelegation
    {
        return RoleDelegation::query()->create([
            'user_id' => $this->beneficiaire->id,
            'delegator_id' => $this->delegant->id,
            'agency_id' => $this->agency->id,
            'role' => $role,
            'starts_at' => null,
            'ends_at' => now()->addWeek(),
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            'user_native_roles_snapshot' => [],
        ]);
    }

    private function adminAvecCapacites(array $capabilities): User
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);

        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $this->agency->id]);

        AgencyAdminProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);

        return $user->fresh();
    }

    /** Cf. `RoleDelegationCapabilityTest` : le shim TCK-142 attache un `OwnerProfile` doté du rôle système. */
    private function membreSansCapacite(): User
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);

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
}
