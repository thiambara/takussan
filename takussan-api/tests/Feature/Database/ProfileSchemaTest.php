<?php

namespace Tests\Feature\Database;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ProfileSchemaTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-279 — `agency_role_id` est NOT NULL sur les profils agence-scopés (Règle 6).
     * TCK-315 — et désormais aussi sur `service_provider_agency_collaborations`, d'où le
     * paramètre de type.
     *
     * Ces tests insèrent en SQL BRUT, délibérément : ils éprouvent les contraintes du SCHÉMA
     * (FK, unicité, NOT NULL), pas le comportement des modèles. Ils contournent donc le hook
     * `creating` de `HasAgencyRole` qui pose le rôle système ailleurs — et c'est à eux de
     * fournir toutes les colonnes NOT NULL, comme n'importe quel écrivain brut. C'est
     * exactement ce que la contrainte est censée forcer.
     *
     * ⚠ Sans filtre de type, ce helper rend le PREMIER rôle système de l'agence, quel qu'il
     * soit — la contrainte est satisfaite et le test vert avec un rôle `owner` posé sur une
     * collaboration de prestataire. Vert par accident. Nommer le type quand il compte.
     */
    private function systemRoleId(int $agencyId, ?string $baseProfileType = null): ?int
    {
        $id = DB::table('agency_roles')
            ->where('agency_id', $agencyId)
            ->where('is_system', true)
            ->when($baseProfileType !== null, fn ($q) => $q->where('base_profile_type', $baseProfileType))
            ->value('id');

        return $id === null ? null : (int) $id;
    }

    public function test_profile_tables_exist_with_expected_columns(): void
    {
        $expectations = [
            'owner_profiles' => [
                'id', 'user_id', 'agency_id', 'agency_role_id', 'status', 'rib', 'tax_id',
                'id_document_type', 'id_document_number', 'monthly_income',
                'employer', 'guarantor_user_id', 'metadata',
                'deleted_at', 'created_at', 'updated_at',
            ],
            'agent_profiles' => [
                'id', 'user_id', 'agency_id', 'agency_role_id', 'status', 'license_number',
                'commission_rate', 'specialty', 'hire_date', 'active_until',
                'metadata', 'deleted_at', 'created_at', 'updated_at',
            ],
            'service_provider_profiles' => [
                'id', 'user_id', 'status', 'specialties', 'service_areas',
                'insurance_policy_id', 'certifications',
                'hourly_rate_min', 'hourly_rate_max', 'active_until',
                'metadata', 'deleted_at', 'created_at', 'updated_at',
            ],
            'service_provider_agency_collaborations' => [
                'id', 'service_provider_profile_id', 'agency_id', 'status',
                'started_at', 'ended_at', 'metadata',
                'deleted_at', 'created_at', 'updated_at',
            ],
        ];

        foreach ($expectations as $table => $columns) {
            $this->assertTrue(Schema::hasTable($table), "Missing table: $table");
            foreach ($columns as $column) {
                $this->assertTrue(
                    Schema::hasColumn($table, $column),
                    "Missing column $table.$column"
                );
            }
        }
    }

    public function test_owner_profile_unique_user_agency(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        DB::table('owner_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('owner_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_agent_profile_unique_user_agency(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        DB::table('agent_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('agent_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * TCK-260 — la contrainte `unique(user_id)` sur
     * `service_provider_profiles` a été levée pour permettre :
     *  - les drafts (user_id = NULL) lors de l'envoi d'une invitation,
     *  - le multi-rattachement futur (TCK-262) qui pourrait, selon le
     *    design final, créer un profil dédié par agence.
     *
     * L'unicité réelle est portée par la table pivot
     * `service_provider_agency_collaborations(profile, agency)`.
     */
    public function test_service_provider_profile_allows_multiple_rows_for_same_user(): void
    {
        $user = User::factory()->create();

        DB::table('service_provider_profiles')->insert([
            'user_id' => $user->id,
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('service_provider_profiles')->insert([
            'user_id' => $user->id,
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame(
            2,
            DB::table('service_provider_profiles')->where('user_id', $user->id)->count(),
        );
    }

    public function test_service_provider_agency_collaboration_unique_pair(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        $spId = DB::table('service_provider_profiles')->insertGetId([
            'user_id' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('service_provider_agency_collaborations')->insert([
            'service_provider_profile_id' => $spId,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id, 'service_provider'),
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('service_provider_agency_collaborations')->insert([
            'service_provider_profile_id' => $spId,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id, 'service_provider'),
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_owner_profile_user_fk_restricts_user_delete(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        DB::table('owner_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('users')->where('id', $user->id)->delete();
    }

    public function test_orphan_owner_profile_rejected_by_user_fk(): void
    {
        $agency = Agency::factory()->create();

        $this->expectException(QueryException::class);

        DB::table('owner_profiles')->insert([
            'user_id' => 999_999,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->systemRoleId($agency->id),
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_orphan_agent_profile_rejected_by_agency_fk(): void
    {
        $user = User::factory()->create();
        // Rôle valide d'une agence réelle : ce test doit échouer sur la FK
        // `agency_id`, pas sur le NOT NULL de `agency_role_id`.
        $roleId = $this->systemRoleId((int) Agency::factory()->create()->id);

        $this->expectException(QueryException::class);

        DB::table('agent_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => 999_999,
            'agency_role_id' => $roleId,
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * TCK-586 — le courtier a quitté la base (ADR-0030). Rouge tant que la
     * migration `drop_broker_tables` n'a pas tourné.
     */
    public function test_broker_tables_are_gone(): void
    {
        $this->assertFalse(Schema::hasTable('broker_profiles'));
        $this->assertFalse(Schema::hasTable('broker_agency_collaborations'));
    }

    /**
     * TCK-586, AC1 — le `down()` recrée les deux tables VIDES au schéma
     * d'origine. « D'origine » se mesure : le schéma qu'il rend est comparé à
     * celui que rendent les deux migrations de création elles-mêmes —
     * colonnes, index (noms compris) et clés étrangères.
     */
    public function test_le_down_recree_les_tables_vides_au_schema_d_origine(): void
    {
        $drop = require database_path('migrations/2026_10_07_090100_drop_broker_tables.php');

        $drop->down();
        $rendu = $this->schemaOf(['broker_profiles', 'broker_agency_collaborations']);
        $this->assertSame(0, DB::table('broker_profiles')->count());
        $this->assertSame(0, DB::table('broker_agency_collaborations')->count());

        $drop->up();
        (require database_path('migrations/2026_05_02_000003_create_broker_profiles_table.php'))->up();
        (require database_path('migrations/2026_05_02_000005_create_broker_agency_collaborations_table.php'))->up();
        $origine = $this->schemaOf(['broker_profiles', 'broker_agency_collaborations']);

        $this->assertNotEmpty($origine['broker_agency_collaborations']['indexes']);
        $this->assertSame($origine, $rendu);
    }

    /**
     * @param  list<string>  $tables
     * @return array<string, array<string, mixed>>
     */
    private function schemaOf(array $tables): array
    {
        $schema = [];
        foreach ($tables as $table) {
            $schema[$table] = [
                'columns' => collect(Schema::getColumns($table))
                    ->map(fn (array $c) => [$c['name'], $c['type'], $c['nullable'], $c['default']])
                    ->sortBy(0)->values()->all(),
                'indexes' => collect(Schema::getIndexes($table))
                    ->map(fn (array $i) => [$i['name'], $i['columns'], $i['unique'], $i['primary']])
                    ->sortBy(0)->values()->all(),
                'foreign_keys' => collect(Schema::getForeignKeys($table))
                    ->map(fn (array $f) => [$f['name'], $f['columns'], $f['foreign_table'], $f['foreign_columns'], $f['on_delete']])
                    ->sortBy(0)->values()->all(),
            ];
        }

        return $schema;
    }
}
