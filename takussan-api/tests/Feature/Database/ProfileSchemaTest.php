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
     * TCK-279 — `agency_role_id` est NOT NULL sur les profils agence-scopés
     * (Règle 6). Ces tests insèrent en SQL brut, donc hors du hook Eloquent
     * qui pose le rôle système par défaut : ils doivent le nommer eux-mêmes.
     * C'est exactement ce que la contrainte est censée forcer.
     */
    private function systemRoleId(int $agencyId): ?int
    {
        $id = DB::table('agency_roles')
            ->where('agency_id', $agencyId)
            ->where('is_system', true)
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
            'broker_profiles' => [
                'id', 'user_id', 'license_number', 'insurance_policy_id',
                'regulator_registration', 'active_until', 'metadata',
                'deleted_at', 'created_at', 'updated_at',
            ],
            'service_provider_profiles' => [
                'id', 'user_id', 'status', 'specialties', 'service_areas',
                'insurance_policy_id', 'certifications',
                'hourly_rate_min', 'hourly_rate_max', 'active_until',
                'metadata', 'deleted_at', 'created_at', 'updated_at',
            ],
            'broker_agency_collaborations' => [
                'id', 'broker_profile_id', 'agency_id', 'status',
                'started_at', 'ended_at', 'metadata',
                'deleted_at', 'created_at', 'updated_at',
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

    public function test_broker_profile_unique_user(): void
    {
        $user = User::factory()->create();

        DB::table('broker_profiles')->insert([
            'user_id' => $user->id,
            'license_number' => 'BRK-001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('broker_profiles')->insert([
            'user_id' => $user->id,
            'license_number' => 'BRK-002',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_broker_profile_unique_license_number(): void
    {
        $u1 = User::factory()->create();
        $u2 = User::factory()->create();

        DB::table('broker_profiles')->insert([
            'user_id' => $u1->id,
            'license_number' => 'BRK-DUP',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('broker_profiles')->insert([
            'user_id' => $u2->id,
            'license_number' => 'BRK-DUP',
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

    public function test_broker_agency_collaboration_unique_pair(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        $brokerId = DB::table('broker_profiles')->insertGetId([
            'user_id' => $user->id,
            'license_number' => 'BRK-COLLAB',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('broker_agency_collaborations')->insert([
            'broker_profile_id' => $brokerId,
            'agency_id' => $agency->id,
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('broker_agency_collaborations')->insert([
            'broker_profile_id' => $brokerId,
            'agency_id' => $agency->id,
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
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
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('service_provider_agency_collaborations')->insert([
            'service_provider_profile_id' => $spId,
            'agency_id' => $agency->id,
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

    public function test_broker_collaboration_cascades_on_broker_delete(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();

        $brokerId = DB::table('broker_profiles')->insertGetId([
            'user_id' => $user->id,
            'license_number' => 'BRK-CASCADE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('broker_agency_collaborations')->insert([
            'broker_profile_id' => $brokerId,
            'agency_id' => $agency->id,
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('broker_profiles')->where('id', $brokerId)->delete();

        $this->assertDatabaseMissing('broker_agency_collaborations', [
            'broker_profile_id' => $brokerId,
        ]);
    }
}
