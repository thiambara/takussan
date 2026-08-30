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
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-456 — la fenêtre d'activité d'une délégation était définie TROIS fois :
 * `RoleDelegation::scopeActive()`, `HasProfiles::hasActiveAgencyDelegation()`
 * et `MembershipCapabilityResolver::delegationAllows()`. Rien ne les liait.
 *
 * Ce fichier est la garde qui les lie. Il n'appelle JAMAIS les trois sur un cas
 * nominal — un cas nominal ne discrimine rien, les trois y répondent pareil
 * même quand elles divergent. Il les appelle sur les BORNES, celles où une
 * inclusion large et une inclusion stricte ne disent pas la même chose.
 *
 * ⚠ **Le temps est GELÉ, et c'est une condition de la mesure, pas une
 * précaution.** La borne `ends_at = now()` exactement n'existe que si `now()`
 * vaut la même chose à l'écriture et à la lecture : sans gel, l'horloge avance
 * entre les deux, `ends_at` glisse dans le passé, et les trois définitions se
 * remettent d'accord sur « non ». Le test resterait vert en ne mesurant rien.
 */
class RoleDelegationActivityWindowTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $delegant;

    private User $beneficiaire;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->freezeTime();

        // `primary_admin_id` nul : ce court-circuit épargne son porteur de toute
        // vérification de capacité (patron de `RoleDelegationCapabilityTest`).
        $this->agency = Agency::factory()->create([
            'kind' => AgencyKind::Standard,
            'primary_admin_id' => null,
        ]);

        $this->delegant = $this->adminAvecCapacites([
            Capability::TeamDelegateRole,
            Capability::TeamInvite,
        ]);

        $this->beneficiaire = $this->membreSansCapacite();

        // Témoin de harnais : sans délégation, la troisième définition doit
        // répondre NON. Si elle répondait OUI ici, tous les cas « accordée »
        // ci-dessous seraient verts sans rien mesurer.
        $this->assertFalse(
            $this->beneficiaire->canActAt(Capability::TeamInvite, $this->agency),
            'Le bénéficiaire détient `team.invite` AVANT toute délégation : le témoin ne mesure plus rien.',
        );
    }

    /**
     * Les trois définitions, évaluées sur LA MÊME ligne, dans l'ordre du
     * ticket. La troisième n'est pas publique : on l'atteint par le seul geste
     * qui la traverse — `canActAt()` sur une capacité que le bénéficiaire ne
     * tient d'aucun de ses propres profils.
     *
     * @return array{scopeActive: bool, hasActiveAgencyDelegation: bool, delegationAllows: bool}
     */
    private function troisDefinitions(RoleDelegation $delegation): array
    {
        $beneficiaire = $this->beneficiaire->fresh();

        return [
            'scopeActive' => RoleDelegation::query()
                ->whereKey($delegation->getKey())
                ->active()
                ->exists(),
            'hasActiveAgencyDelegation' => $beneficiaire
                ->hasActiveAgencyDelegation((int) $this->agency->id, 'agency_admin'),
            'delegationAllows' => $beneficiaire
                ->canActAt(Capability::TeamInvite, $this->agency),
        ];
    }

    private function assertLesTroisDisent(bool $attendu, RoleDelegation $delegation, string $borne): void
    {
        $mesure = $this->troisDefinitions($delegation);
        $attenduTriplet = [
            'scopeActive' => $attendu,
            'hasActiveAgencyDelegation' => $attendu,
            'delegationAllows' => $attendu,
        ];

        $this->assertSame(
            $attenduTriplet,
            $mesure,
            "Borne « {$borne} » : les trois définitions de la fenêtre d'activité ne disent pas la même chose. "
            .'Mesuré : '.json_encode($mesure).'.',
        );
    }

    /**
     * BORNE 1 — `ends_at` vaut exactement `now()`.
     *
     * C'est le cas qui sépare une inclusion large d'une inclusion stricte, et
     * lui seul. Avant TCK-456 : `scopeActive` répondait OUI (`>= now()`), les
     * deux autres NON (`> now()`).
     *
     * La sémantique retenue est la STRICTE — celle qui autorise déjà — donc NON
     * pour les trois : à l'instant exact de l'échéance, la délégation est finie.
     */
    public function test_borne_ends_at_egal_a_maintenant(): void
    {
        $delegation = $this->deleguer(starts_at: now()->subDay(), ends_at: now());

        $this->assertLesTroisDisent(false, $delegation, 'ends_at = now() exactement');
    }

    /**
     * BORNE 2 — une ligne `Active` dont le `starts_at` est dans le FUTUR.
     *
     * Avant TCK-456 : `scopeActive` seule la rejetait (clause `starts_at`), les
     * deux autres ne regardaient pas `starts_at` du tout.
     *
     * La clause `starts_at` est ABANDONNÉE (décision du ticket) : une délégation
     * qui n'a pas commencé porte le statut `Scheduled`, pas `Active` — c'est le
     * test de statut qui la couvre, et c'est `RoleDelegationService` qui en
     * répond (cf. {@see self::test_le_statut_couvre_ce_que_la_clause_starts_at_couvrait()}).
     * Les trois doivent donc dire OUI ici.
     */
    public function test_borne_ligne_active_dont_le_starts_at_est_futur(): void
    {
        $delegation = $this->deleguer(starts_at: now()->addDay(), ends_at: now()->addWeek());

        $this->assertLesTroisDisent(true, $delegation, 'status=Active avec starts_at futur');
    }

    /**
     * BORNE 3 — `ends_at` une seconde avant `now()`.
     *
     * Le voisin immédiat de la borne 1, du côté fermé. Il tient le cas 1
     * honnête : sans lui, une définition qui répondrait « non » à TOUT
     * passerait la borne 1 sans rien mesurer.
     */
    public function test_borne_ends_at_une_seconde_dans_le_passe(): void
    {
        $delegation = $this->deleguer(starts_at: now()->subDay(), ends_at: now()->subSecond());

        $this->assertLesTroisDisent(false, $delegation, 'ends_at = now() - 1s');
    }

    /**
     * BORNE 4 — `ends_at` une seconde après `now()`.
     *
     * Le voisin immédiat de la borne 1, du côté ouvert. Symétrique du
     * précédent : sans lui, une définition qui répondrait « oui » à tout
     * passerait la borne 2.
     */
    public function test_borne_ends_at_une_seconde_dans_le_futur(): void
    {
        $delegation = $this->deleguer(starts_at: now()->subDay(), ends_at: now()->addSecond());

        $this->assertLesTroisDisent(true, $delegation, 'ends_at = now() + 1s');
    }

    /**
     * La borne `ends_at IS NULL` du ticket est **INATTEIGNABLE**, et il faut
     * que quelqu'un l'apprenne le jour où elle cesse de l'être.
     *
     * Le tableau de décision de TCK-456 compte `ends_at NULL` parmi les trois
     * axes de divergence — `scopeActive` la rejetait, les deux autres
     * l'acceptaient. Mesuré le 2026-08-29 : la colonne est **NOT NULL** depuis
     * `2026_04_28_000000_create_role_delegations_table` (`$table->dateTime('ends_at')`,
     * sans `->nullable()`). Aucune ligne ne peut porter cet écart, et les trois
     * branches `whereNull('ends_at')` du dépôt sont mortes.
     *
     * *Une divergence inatteignable n'est pas une divergence corrigée : c'est
     * une divergence que le schéma cache.* Rendre la colonne nullable
     * rouvrirait l'axe sans qu'aucun test ne le voie — celui-ci rougit alors et
     * dit quoi ajouter.
     */
    public function test_la_borne_ends_at_null_reste_inatteignable_par_le_schema(): void
    {
        $nullable = DB::selectOne(
            'select is_nullable from information_schema.columns '
            .'where table_name = ? and column_name = ?',
            ['role_delegations', 'ends_at'],
        );

        $this->assertSame(
            'NO',
            $nullable->is_nullable,
            '`role_delegations.ends_at` est devenue nullable : la borne `ends_at IS NULL` de TCK-456 '
            ."est désormais ATTEIGNABLE et n'est gardée par aucun cas. En ajouter un ici avant de "
            .'laisser passer cette migration.',
        );
    }

    /**
     * La contrepartie de l'abandon de la clause `starts_at` (décision TCK-456).
     *
     * `scopeActive` refusait une ligne dont le `starts_at` était futur. En
     * abandonnant cette clause, on s'appuie sur une propriété de
     * `RoleDelegationService::create()` : un `starts_at` futur produit
     * `Scheduled`, jamais `Active`. Cette propriété n'était gardée nulle part.
     * Elle l'est ici, sinon l'abandon reposerait sur une lecture de code.
     */
    public function test_le_statut_couvre_ce_que_la_clause_starts_at_couvrait(): void
    {
        $cible = $this->agentMembre();

        $delegation = app(RoleDelegationService::class)->create($this->agency, $this->delegant, [
            'user_id' => $cible->id,
            'role' => 'agent',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addWeek(),
        ]);

        $this->assertSame(
            RoleDelegationStatus::Scheduled,
            $delegation->status,
            "Une délégation à `starts_at` futur naît `Active` : l'abandon de la clause `starts_at` "
            ."dans la fenêtre d'activité ouvre alors un privilège avant sa date de début.",
        );
    }

    // ---------------------------------------------------------------- outillage

    private function deleguer(?Carbon $starts_at, Carbon $ends_at): RoleDelegation
    {
        return RoleDelegation::query()->create([
            'user_id' => $this->beneficiaire->id,
            'delegator_id' => $this->delegant->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'starts_at' => $starts_at,
            'ends_at' => $ends_at,
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            // NOT NULL en base ; instantané d'AUDIT, hors de toute résolution.
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
     * Un membre dont AUCUN profil ne porte la moindre capacité. Le shim TCK-142
     * (observateur `created` de `User`) attache un `OwnerProfile` au rôle
     * système owner : un bénéficiaire qu'on croit vierge détient déjà des
     * capacités. On réaffecte chaque profil au rôle vide.
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
}
