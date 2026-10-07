<?php

namespace Tests\Feature\Database;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-586, AC2 — la migration de données retire les relations client du
 * courtier, et elles seules. Insertion en SQL brut : le cas d'énumération
 * n'existe plus, le modèle ne saurait plus écrire — ni relire — la valeur.
 */
class DeleteBrokerClientRelationshipsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_une_ligne_broker_client_disparait_et_une_ligne_agent_client_reste(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create();

        $courtier = DB::table('user_customer_relationships')->insertGetId([
            'user_id' => $user->id,
            'customer_id' => $customer->id,
            'relationship_type' => 'broker_client',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $agent = DB::table('user_customer_relationships')->insertGetId([
            'user_id' => $user->id,
            'customer_id' => $customer->id,
            'relationship_type' => 'agent_client',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        (require database_path('migrations/2026_10_07_090000_delete_broker_client_customer_relationships.php'))->up();

        $this->assertDatabaseMissing('user_customer_relationships', ['id' => $courtier]);
        $this->assertDatabaseHas('user_customer_relationships', [
            'id' => $agent,
            'relationship_type' => 'agent_client',
            'status' => 'active',
        ]);
    }
}
