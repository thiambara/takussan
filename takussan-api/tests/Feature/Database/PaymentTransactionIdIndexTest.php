<?php

namespace Tests\Feature\Database;

use App\Models\BookingPayment;
use App\Models\LeasePayment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-891 (P04.11) — `transaction_id` des échéances et des paiements de réservation porte un index.
 *
 * `PaymentGatewayService::paymentsForEvent()` cherche le payable de chaque webhook par
 * `transaction_id`. PostgreSQL n'indexe rien d'office (piège n° 8) : sans index, chaque webhook
 * relit toute la table, même quand le balayage séquentiel est interdit.
 */
class PaymentTransactionIdIndexTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string, string, string}> */
    public static function payables(): array
    {
        return [
            'lease_payments' => [LeasePayment::class, 'lease_payments', 'lease_payments_transaction_id_idx'],
            'booking_payments' => [BookingPayment::class, 'booking_payments', 'booking_payments_transaction_id_idx'],
        ];
    }

    #[DataProvider('payables')]
    public function test_transaction_id_is_indexed(string $model, string $table, string $name): void
    {
        $index = collect(Schema::getIndexes($table))->firstWhere('name', $name);

        $this->assertNotNull($index, "index {$table}(transaction_id) absent");
        $this->assertSame(['transaction_id'], $index['columns']);
    }

    #[DataProvider('payables')]
    public function test_the_webhook_lookup_reads_by_the_index(string $model, string $table, string $name): void
    {
        $sql = $model::query()->where('transaction_id', 'cs_wave_xyz')->toRawSql();

        // La table de test est vide : sans cela, le moteur la balaierait quel que soit l'index.
        DB::statement('SET LOCAL enable_seqscan = off');
        $plan = collect(DB::select('EXPLAIN '.$sql))->pluck('QUERY PLAN')->implode("\n");

        $this->assertStringContainsString($name, $plan);
        $this->assertStringNotContainsString("Seq Scan on {$table}", $plan);
    }
}
