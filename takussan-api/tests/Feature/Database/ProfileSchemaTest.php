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

    public function test_profile_tables_exist_with_expected_columns(): void
    {
        $expectations = [
            'owner_profiles' => [
                'id', 'user_id', 'agency_id', 'status', 'rib', 'tax_id',
                'id_document_type', 'id_document_number', 'monthly_income',
                'employer', 'guarantor_user_id', 'metadata',
                'deleted_at', 'created_at', 'updated_at',
            ],
            'agent_profiles' => [
                'id', 'user_id', 'agency_id', 'status', 'license_number',
                'commission_rate', 'specialty', 'hire_date', 'active_until',
                'metadata', 'deleted_at', 'created_at', 'updated_at',
            ],
            'broker_profiles' => [
                'id', 'user_id', 'license_number', 'insurance_policy_id',
                'regulator_registration', 'active_until', 'metadata',
                'deleted_at', 'created_at', 'updated_at',
            ],
            'service_provider_profiles' => [
                'id', 'user_id', 'specialties', 'service_areas',
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
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('owner_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
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
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('agent_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
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

    public function test_service_provider_profile_unique_user(): void
    {
        $user = User::factory()->create();

        DB::table('service_provider_profiles')->insert([
            'user_id' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('service_provider_profiles')->insert([
            'user_id' => $user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
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
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_orphan_agent_profile_rejected_by_agency_fk(): void
    {
        $user = User::factory()->create();

        $this->expectException(QueryException::class);

        DB::table('agent_profiles')->insert([
            'user_id' => $user->id,
            'agency_id' => 999_999,
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
