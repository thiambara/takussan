<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-639 (ADR-0061 §2) — un mouvement de crédits ne se modifie que par l'action d'une clé
 * étrangère, et les clés `nullOnDelete` du lot TCK-633 sont indexées.
 *
 * Le trigger de `500200` admettait la mise à NULL de `property_boost_id` / `actor_id` sans
 * condition : un UPDATE direct effaçait l'auteur d'un octroi. La migration `2026_10_14_100000` ne
 * l'admet plus qu'à `pg_trigger_depth() > 1`, c'est-à-dire depuis l'action référentielle.
 *
 * Les suppressions passent par `DB::table()->delete()` et non par Eloquent : `User`, `Agency` et
 * `Property` sont en suppression douce — l'effacement d'un compte est une anonymisation
 * (`AccountDeletionService::anonymize()`), qui ne déclenche AUCUNE clé étrangère. Seule une
 * suppression réelle de la ligne parente exerce le chemin que ce ticket garde.
 */
class CreditMovementForeignKeyActionsTest extends TestCase
{
    use RefreshDatabase;

    /** AC1 — le cas qui passait : effacer l'auteur d'un mouvement par une écriture directe. */
    public function test_un_update_direct_ne_met_pas_l_auteur_a_null(): void
    {
        $actorId = User::factory()->create()->id;
        [$agencyId, $lotId] = $this->lotBrut();
        $id = $this->mouvement($agencyId, $lotId, ['actor_id' => $actorId]);

        $this->assertRefuse(fn () => DB::table('credit_movements')->where('id', $id)->update(['actor_id' => null]));

        $this->assertSame($actorId, (int) DB::table('credit_movements')->where('id', $id)->value('actor_id'));
    }

    /** AC1 — même faille, même fermeture, sur le boost rattaché. */
    public function test_un_update_direct_ne_detache_pas_le_boost(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        $boostId = $this->boost($agencyId);
        $id = $this->mouvement($agencyId, $lotId, ['property_boost_id' => $boostId]);

        $this->assertRefuse(fn () => DB::table('credit_movements')->where('id', $id)->update(['property_boost_id' => null]));

        $this->assertSame($boostId, (int) DB::table('credit_movements')->where('id', $id)->value('property_boost_id'));
    }

    /** AC2 — supprimer pour de bon l'auteur d'un mouvement reste possible : l'auteur passe à NULL. */
    public function test_la_suppression_d_un_auteur_met_actor_id_a_null(): void
    {
        $actorId = User::factory()->create()->id;
        [$agencyId, $lotId] = $this->lotBrut();
        $id = $this->mouvement($agencyId, $lotId, ['actor_id' => $actorId]);

        DB::table('users')->where('id', $actorId)->delete();

        $mouvement = DB::table('credit_movements')->where('id', $id)->first();
        $this->assertNotNull($mouvement, 'le mouvement survit à son auteur');
        $this->assertNull($mouvement->actor_id);
        $this->assertSame(10, (int) $mouvement->amount);
    }

    /** AC2 — supprimer un boost le détache du mouvement, sans toucher au reste de la ligne. */
    public function test_la_suppression_d_un_boost_met_property_boost_id_a_null(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        $boostId = $this->boost($agencyId);
        $id = $this->mouvement($agencyId, $lotId, ['property_boost_id' => $boostId]);

        DB::table('property_boosts')->where('id', $boostId)->delete();

        $mouvement = DB::table('credit_movements')->where('id', $id)->first();
        $this->assertNotNull($mouvement);
        $this->assertNull($mouvement->property_boost_id);
    }

    /**
     * AC2 — la même mise à NULL, émise un cran plus bas : un bien supprimé emporte son boost en
     * cascade, qui détache le mouvement à la profondeur 3. Le seuil est `> 1`, pas `= 2`.
     */
    public function test_la_suppression_d_un_bien_detache_le_mouvement_de_son_boost(): void
    {
        [$agencyId, $lotId] = $this->lotBrut();
        $boostId = $this->boost($agencyId);
        $id = $this->mouvement($agencyId, $lotId, ['property_boost_id' => $boostId]);
        $propertyId = (int) DB::table('property_boosts')->where('id', $boostId)->value('property_id');

        DB::table('properties')->where('id', $propertyId)->delete();

        $this->assertNull(DB::table('credit_movements')->where('id', $id)->value('property_boost_id'));
        $this->assertSame(1, DB::table('credit_movements')->where('id', $id)->count());
    }

    /**
     * AC2 — supprimer une agence supprime ses mouvements, y compris quand la même suppression met
     * à NULL, par ses boosts emportés, le `property_boost_id` de ces mouvements.
     */
    public function test_la_suppression_d_une_agence_supprime_ses_mouvements(): void
    {
        $actorId = User::factory()->create()->id;
        [$agencyId, $lotId] = $this->lotBrut();
        $boostId = $this->boost($agencyId);
        $this->mouvement($agencyId, $lotId, ['actor_id' => $actorId, 'property_boost_id' => $boostId]);
        $this->mouvement($agencyId, $lotId, ['type' => 'spend', 'amount' => -5]);

        DB::table('agencies')->where('id', $agencyId)->delete();

        $this->assertSame(0, DB::table('credit_movements')->where('agency_id', $agencyId)->count());
        $this->assertSame(0, DB::table('credit_lots')->where('id', $lotId)->count());
        $this->assertSame(0, DB::table('property_boosts')->where('id', $boostId)->count());
        $this->assertSame(1, DB::table('users')->where('id', $actorId)->count(), 'l’auteur ne suit pas l’agence');
    }

    /** AC3 — sept index, chacun sur la SEULE colonne de sa clé. */
    public function test_les_sept_cles_etrangeres_sont_indexees(): void
    {
        $attendus = [
            'property_boosts_product_idx' => ['property_boosts', 'boost_product_id'],
            'property_boosts_purchased_by_idx' => ['property_boosts', 'purchased_by_id'],
            'property_boosts_cancelled_by_idx' => ['property_boosts', 'cancelled_by_id'],
            'credit_lots_granted_by_idx' => ['credit_lots', 'granted_by_id'],
            'credit_movements_actor_idx' => ['credit_movements', 'actor_id'],
            'credit_welcome_grants_user_idx' => ['credit_welcome_grants', 'user_id'],
            'credit_welcome_grants_lot_idx' => ['credit_welcome_grants', 'credit_lot_id'],
        ];

        $releves = DB::table('pg_indexes')
            ->where('schemaname', 'public')
            ->whereIn('indexname', array_keys($attendus))
            ->pluck('indexdef', 'indexname');

        $this->assertCount(7, $releves, 'index manquants : '.implode(', ', array_diff(array_keys($attendus), $releves->keys()->all())));
        foreach ($attendus as $nom => [$table, $colonne]) {
            $this->assertSame(
                "CREATE INDEX {$nom} ON public.{$table} USING btree ({$colonne})",
                $releves[$nom],
            );
        }
    }

    private function assertRefuse(\Closure $tentative): void
    {
        try {
            // Savepoint : l'erreur PostgreSQL n'abandonne que lui, pas la transaction du test (piège 1).
            DB::transaction($tentative);
            $this->fail('credit_movements a accepté une mise à NULL directe.');
        } catch (QueryException $e) {
            $this->assertSame('P0001', $e->getCode());
            $this->assertStringContainsString('insertion seule', $e->getMessage());
        }
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

    private function boost(int $agencyId): int
    {
        $propertyId = Property::factory()->create(['agency_id' => $agencyId])->id;

        return DB::table('property_boosts')->insertGetId([
            'property_id' => $propertyId, 'agency_id' => $agencyId, 'kind' => 'featured', 'price_credits' => 10,
            'duration_days' => 7, 'starts_at' => now(), 'ends_at' => now()->addDays(7), 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /** @param array<string, mixed> $colonnes */
    private function mouvement(int $agencyId, int $lotId, array $colonnes = []): int
    {
        return DB::table('credit_movements')->insertGetId([
            'agency_id' => $agencyId, 'credit_lot_id' => $lotId, 'type' => 'grant', 'amount' => 10, 'created_at' => now(),
            ...$colonnes,
        ]);
    }
}
