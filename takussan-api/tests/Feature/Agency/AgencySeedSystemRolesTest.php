<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\AgencySystemRoleSeeder;
use App\Services\Membership\SystemRoleCapabilities;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-279 AC1 — seed automatique des 4 rôles système à la création d'une
 * agence, avec les capacités de la table de vérité phase 1.
 */
class AgencySeedSystemRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_an_agency_seeds_four_system_roles(): void
    {
        $agency = Agency::factory()->create();

        $roles = AgencyRole::query()->where('agency_id', $agency->id)->get();

        $this->assertCount(4, $roles);
        $this->assertTrue($roles->every(fn (AgencyRole $r): bool => $r->is_system === true));
        $this->assertEqualsCanonicalizing(
            array_map(static fn (AgencyRoleBaseType $t): string => $t->value, AgencyRoleBaseType::cases()),
            $roles->map(fn (AgencyRole $r): string => $r->base_profile_type->value)->all(),
        );
    }

    public function test_system_roles_carry_the_phase_one_truth_table(): void
    {
        $agency = Agency::factory()->create();
        $catalog = app(SystemRoleCapabilities::class);

        foreach (AgencyRoleBaseType::cases() as $type) {
            $role = AgencyRole::query()
                ->where('agency_id', $agency->id)
                ->where('base_profile_type', $type->value)
                ->firstOrFail();

            $this->assertEqualsCanonicalizing(
                $catalog->valuesFor($type),
                $role->capabilityEnums()->map(fn (Capability $c): string => $c->value)->all(),
                "rôle système {$type->value}",
            );
        }
    }

    public function test_exactly_one_system_role_per_base_type(): void
    {
        $agency = Agency::factory()->create();

        // Deuxième passage du seeder : idempotent, aucun doublon.
        app(AgencySystemRoleSeeder::class)->seed($agency);

        foreach (AgencyRoleBaseType::cases() as $type) {
            $this->assertSame(1, AgencyRole::query()
                ->where('agency_id', $agency->id)
                ->where('base_profile_type', $type->value)
                ->where('is_system', true)
                ->count());
        }
    }

    /**
     * LE MÊME INVARIANT, GARDÉ PAR LA BASE — et il ne l'était pas.
     *
     * Le test au-dessus éprouve l'IDEMPOTENCE DU SEEDER : il rappelle `seed()` et
     * compte. C'est utile, et ça ne dit rien de l'invariant, parce que le seeder est
     * précisément le seul chemin qui ne le viole jamais. Un `DB::table()->insert()`,
     * une commande de reprise, un `updateQuietly` ou un import passaient à côté sans
     * rien lever.
     *
     * Le docblock de `AgencySystemRoleSeeder` justifiait cette absence par « MySQL 8.0
     * ne sait pas exprimer un unique partiel (`WHERE is_system = true`) ». C'était vrai
     * de MySQL, et périmé depuis ADR-0020 : PostgreSQL le sait, et le dépôt en pose déjà
     * un ailleurs (`agency_upgrade_requests_one_pending_per_agency`). *Une justification
     * périmée protège le code qu'elle décrit : on cesse de se demander s'il est encore
     * nécessaire.*
     *
     * L'invariant reste tenu applicativement — le seeder et `AgencyRolePolicy` restent
     * la première couche. Celui-ci est la seconde : *la normalisation applicative garde
     * le comportement ; l'index garde les données.*
     */
    public function test_un_second_role_systeme_du_meme_type_est_refuse_par_la_base(): void
    {
        $agency = Agency::factory()->create();

        $existant = AgencyRole::query()
            ->where('agency_id', $agency->id)
            ->where('base_profile_type', AgencyRoleBaseType::Agent->value)
            ->where('is_system', true)
            ->firstOrFail();

        $this->expectException(QueryException::class);

        // En SQL brut, délibérément : passer par le seeder testerait le seeder.
        DB::table('agency_roles')->insert([
            'agency_id' => $agency->id,
            'name' => $existant->name.' (doublon)',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
            'is_system' => true,
            'is_clonable' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * L'index est PARTIEL : il ne doit contraindre que `is_system`. Deux rôles
     * PERSONNALISÉS du même type de base sont parfaitement légitimes — c'est tout
     * l'objet de TCK-279 phase 2 — et un index total les refuserait en silence.
     *
     * *Une contrainte trop large ne se voit pas en vert : elle se voit le jour où
     * quelqu'un a besoin du cas qu'elle interdit.*
     */
    public function test_deux_roles_personnalises_du_meme_type_restent_permis(): void
    {
        $agency = Agency::factory()->create();

        foreach (['Agent senior', 'Agent junior'] as $nom) {
            DB::table('agency_roles')->insert([
                'agency_id' => $agency->id,
                'name' => $nom,
                'base_profile_type' => AgencyRoleBaseType::Agent->value,
                'is_system' => false,
                'is_clonable' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->assertSame(2, AgencyRole::query()
            ->where('agency_id', $agency->id)
            ->where('base_profile_type', AgencyRoleBaseType::Agent->value)
            ->where('is_system', false)
            ->count());
    }

    /**
     * Règle 6 — `agency_role_id` est NOT NULL. Un profil créé sans pointeur
     * reçoit le rôle système de son type, faute de quoi ~40 sites de
     * création casseraient sur une contrainte base.
     */
    public function test_profile_created_without_role_gets_the_system_role(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();

        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);

        $this->assertNotNull($profile->agency_role_id);
        $this->assertTrue($profile->agencyRole->is_system);
        $this->assertSame(AgencyRoleBaseType::Agent, $profile->agencyRole->base_profile_type);
    }

    public function test_agency_without_roles_still_gets_one_on_demand(): void
    {
        $agency = Agency::factory()->create();
        AgencyRole::query()->where('agency_id', $agency->id)->delete();
        $this->assertSame(0, AgencyRole::query()->where('agency_id', $agency->id)->count());

        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
        ]);

        $this->assertNotNull($profile->agency_role_id);
    }
}
