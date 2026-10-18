<?php

namespace Tests\Feature\Database;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-862 (P02.04) — `customers.user_id` porte un index.
 *
 * `HasProfiles::hasActiveTenantLease()` joint `customers ⋈ leases` sur `customers.user_id` à
 * chaque `/api/auth/me`. PostgreSQL n'indexe pas une clé étrangère (piège n° 8) : sans index, la
 * jointure relit toute la table `customers`, même quand le balayage séquentiel est interdit.
 */
class CustomersUserIdIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_customers_user_id_is_indexed(): void
    {
        $index = collect(Schema::getIndexes('customers'))
            ->firstWhere('name', 'customers_user_id_index');

        $this->assertNotNull($index, 'index customers(user_id) absent');
        $this->assertSame(['user_id'], $index['columns']);
    }

    public function test_the_tenant_lease_lookup_reads_customers_by_the_index(): void
    {
        $user = User::factory()->create();
        Customer::factory()->count(30)->create();
        Customer::factory()->create(['user_id' => $user->id]);
        // Le moteur choisit l'index d'après les statistiques de la table, pas d'après son contenu :
        // si la table a été analysée vide (autovacuum, entre deux tests), `customers_pkey` et
        // `customers_user_id_index` coûtent pareil et il prend l'un ou l'autre (CI rouge du
        // 2026-10-18, #643). Analysée avec ses 31 lignes, `user_id = ?` devient le seul plan sélectif.
        DB::statement('ANALYZE customers');

        $sql = $user->tenantLeases()
            ->whereIn('leases.status', User::ACTIVE_TENANT_LEASE_STATUSES)
            ->toRawSql();

        // La table de test est minuscule : sans cela, le moteur la balaierait quel que soit l'index.
        DB::statement('SET LOCAL enable_seqscan = off');
        $plan = collect(DB::select('EXPLAIN '.$sql))->pluck('QUERY PLAN')->implode("\n");

        $this->assertStringContainsString('customers_user_id_index', $plan);
        $this->assertStringNotContainsString('Seq Scan on customers', $plan);
    }
}
