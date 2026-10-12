<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\Property;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — le schéma du registre : les tables existent, `credit_movements`
 * REFUSE toute modification et toute suppression directe, et une suppression en CASCADE d'un parent
 * reste possible (sinon un bien supprimé pour de bon ne pourrait plus l'être).
 */
class CreditSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_tables_et_colonnes_existent(): void
    {
        foreach (['boost_products', 'property_boosts', 'property_boost_daily_stats', 'credit_lots', 'credit_movements', 'credit_welcome_grants'] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->assertTrue(Schema::hasColumns('properties', ['ranked_at', 'sponsored_until', 'badge', 'badge_until']));
        $this->assertTrue(Schema::hasColumns('credit_lots', ['agency_id', 'origin', 'initial_amount', 'remaining_amount', 'expires_at', 'granted_by_id', 'reason', 'expiry_notice_sent_at']));
        $this->assertTrue(Schema::hasColumns('credit_movements', ['agency_id', 'credit_lot_id', 'type', 'amount', 'property_boost_id', 'actor_id', 'reason', 'created_at']));
        $this->assertFalse(Schema::hasColumn('credit_movements', 'updated_at'));
    }

    public function test_un_mouvement_ne_se_modifie_ni_ne_se_supprime(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        $id = DB::table('credit_movements')->insertGetId([
            'agency_id' => $agencyId, 'credit_lot_id' => $lotId, 'type' => 'grant', 'amount' => 10, 'created_at' => now(),
        ]);

        foreach ([
            fn () => DB::table('credit_movements')->where('id', $id)->update(['amount' => 99]),
            fn () => DB::table('credit_movements')->where('id', $id)->delete(),
        ] as $tentative) {
            try {
                // Savepoint : l'erreur PostgreSQL n'abandonne que lui, pas la transaction du test (piège 1).
                DB::transaction($tentative);
                $this->fail('credit_movements a accepté une modification directe.');
            } catch (QueryException $e) {
                $this->assertStringContainsString('insertion seule', $e->getMessage());
            }
        }

        $this->assertSame(10, (int) DB::table('credit_movements')->where('id', $id)->value('amount'));
    }

    public function test_la_suppression_en_cascade_d_un_parent_reste_possible(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        DB::table('credit_movements')->insert([
            'agency_id' => $agencyId, 'credit_lot_id' => $lotId, 'type' => 'grant', 'amount' => 10, 'created_at' => now(),
        ]);

        DB::table('agencies')->where('id', $agencyId)->delete();

        $this->assertSame(0, DB::table('credit_movements')->where('agency_id', $agencyId)->count());
    }

    public function test_un_lot_ne_descend_pas_sous_zero(): void
    {
        [, $lotId] = $this->lotBrut();

        try {
            DB::transaction(fn () => DB::table('credit_lots')->where('id', $lotId)->update(['remaining_amount' => -1]));
            $this->fail('credit_lots a accepté un restant négatif.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('credit_lots_amounts_check', $e->getMessage());
        }
    }

    /** Correction après vérif. adverse : un prix ou un remboursement négatif est refusé par la base. */
    public function test_un_boost_ne_porte_ni_prix_ni_remboursement_negatif(): void
    {
        $agencyId = Agency::factory()->create()->id;
        $propertyId = Property::factory()->create(['agency_id' => $agencyId])->id;
        $ligne = [
            'property_id' => $propertyId, 'agency_id' => $agencyId, 'kind' => 'featured', 'price_credits' => 0,
            'duration_days' => 7, 'starts_at' => now(), 'ends_at' => now()->addDays(7), 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ];

        foreach ([['price_credits' => -1], ['refunded_credits' => -1]] as $faute) {
            try {
                DB::transaction(fn () => DB::table('property_boosts')->insert(array_merge($ligne, $faute)));
                $this->fail('property_boosts a accepté '.json_encode($faute));
            } catch (QueryException $e) {
                $this->assertStringContainsString('property_boosts_credits_check', $e->getMessage());
            }
        }
        DB::table('property_boosts')->insert($ligne);
        $this->assertSame(1, DB::table('property_boosts')->where('property_id', $propertyId)->count());
    }

    /** Une bienvenue par espace : l'index unique sert aussi la clé étrangère (piège PostgreSQL n°8). */
    public function test_la_bienvenue_est_unique_par_espace(): void
    {
        $agencyId = Agency::factory()->create()->id;
        $ligne = fn (string $hash) => ['phone_hash' => $hash, 'agency_id' => $agencyId, 'granted_at' => now(), 'created_at' => now(), 'updated_at' => now()];

        $this->assertSame(1, DB::table('credit_welcome_grants')->insertOrIgnore($ligne(str_repeat('a', 64))));
        $this->assertSame(0, DB::table('credit_welcome_grants')->insertOrIgnore($ligne(str_repeat('b', 64))), 'un second numéro ne rouvre pas la bienvenue de l’espace');
        $this->assertSame(1, DB::table('credit_welcome_grants')->insertOrIgnore([...$ligne(str_repeat('c', 64)), 'agency_id' => null]));
        $this->assertSame(1, DB::table('credit_welcome_grants')->insertOrIgnore([...$ligne(str_repeat('d', 64)), 'agency_id' => null]), 'les espaces supprimés (NULL) ne s’excluent pas');
    }

    /** @return array{0:int,1:int} */
    private function lotBrut(): array
    {
        $agencyId = Agency::factory()->create()->id;
        $lotId = DB::table('credit_lots')->insertGetId([
            'agency_id' => $agencyId, 'origin' => 'admin_grant', 'initial_amount' => 10, 'remaining_amount' => 10,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return [$agencyId, $lotId];
    }
}
