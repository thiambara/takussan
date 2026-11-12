<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Payments\PaymentHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2721 (contre-vérification de e368b24e4, point 4) — un `metadata.paid_amount` non numérique,
 * écrit hors du modèle (le hook `saving` de `HasPaymentAttributes` le refuse), ne fait plus tomber
 * en 500 le tri du registre des encaissements par reste dû ni le résumé financier : les deux lisent
 * la valeur par UN fragment SQL, `CollectedPayments::paidAmountMetaSql()`, qui la lit comme le
 * `(float)` de PHP (`"abc"` → 0, `"350,5"` → 350).
 *
 * Les valeurs corrompues sont écrites par `DB::table()->update()` ; les valeurs que la garde du
 * modèle accepte (`"1e3"`, `" 12"`, `"+5"`, `".5"`, nombres JSON) servent de témoins : le correctif
 * ne doit changer la lecture d'aucune d'elles.
 */
class PaidAmountTolerantReadTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** Valeurs JSON brutes de `metadata.paid_amount` ; témoins acceptés par le modèle, puis corrompues. */
    private const VALEURS = [
        '1500', '12.75', '"1e3"', '" 12"', '"+5"', '".5"', '"250.50"', '"1e0001"', '"5e0002"', '"1e-0002"',
        '"abc"', '""', '"1 000"', '"350,5"', 'true', 'false', 'null', '"5."', '"1e"', '"-2.5e-1z"', '"+-3"', '"0x1A"',
    ];

    private User $admin;

    private Agency $agency;

    private Lease $bail;

    private Customer $locataire;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-15 10:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->locataire = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $this->bail = Lease::factory()->active()->create([
            'property_id' => $bien->id, 'landlord_id' => $bailleur->id, 'tenant_id' => $this->locataire->id, 'agency_id' => $this->agency->id,
        ]);
    }

    public function test_le_fragment_lit_paid_amount_comme_le_float_de_php_sur_les_deux_tables(): void
    {
        $ecarts = [];
        foreach (self::VALEURS as $i => $brut) {
            $loyer = $this->loyer("L-{$i}", 2000, PaymentStatus::PartiallyPaid, '2026-11-05', $brut);
            $acompte = $this->acompte("B-{$i}", 2000, PaymentStatus::PartiallyPaid, $brut);

            foreach ([$loyer, $acompte] as $ligne) {
                $table = $ligne->getTable();
                $sql = (float) DB::table($table)->where('id', $ligne->id)
                    ->value(DB::raw(CollectedPayments::paidAmountMetaSql($table)));
                $php = (float) ($ligne->fresh()->metadata['paid_amount'] ?? 0);
                if ($sql !== $php) {
                    $ecarts[] = "{$table} {$brut} : SQL {$sql}, PHP {$php}";
                }
            }

            $resteSql = (float) DB::table('lease_payments')->where('id', $loyer->id)->value(DB::raw(CollectedPayments::OWED_REMAINING_SQL));
            if (round($resteSql, 2) !== $loyer->fresh()->remaining_amount) {
                $ecarts[] = "reste dû {$brut} : SQL {$resteSql}, PHP {$loyer->fresh()->remaining_amount}";
            }
        }

        $this->assertSame([], $ecarts);
    }

    public function test_le_tri_par_reste_du_tient_une_valeur_non_numerique_dans_les_deux_sens(): void
    {
        $this->loyer('L-ABC', 500, PaymentStatus::PartiallyPaid, '2026-11-05', '"abc"');     // reste 500
        $this->loyer('L-150', 400, PaymentStatus::PartiallyPaid, '2026-11-05', '150');       // reste 250
        $this->acompte('B-ABC', 300, PaymentStatus::PartiallyPaid, '"abc"');                 // reste 300
        $this->acompte('B-VIRG', 700, PaymentStatus::PartiallyPaid, '"350,5"');              // reste 350, comme PHP
        $this->acompte('B-VRAI', 120, PaymentStatus::PartiallyPaid, 'true');                 // reste 119

        $this->actingAsApi($this->admin);
        $croissant = $this->getJson('/api/payments/history?sort=remaining_amount&per_page=100')->assertOk()->json('data');
        $this->assertSame(['B-VRAI', 'L-150', 'B-ABC', 'B-VIRG', 'L-ABC'], array_column($croissant, 'reference_number'));
        $this->assertEquals([119, 250, 300, 350, 500], array_column($croissant, 'remaining_amount'));

        $decroissant = $this->getJson('/api/payments/history?sort=-remaining_amount&per_page=100')->assertOk()->json('data');
        $this->assertSame(['L-ABC', 'B-VIRG', 'B-ABC', 'L-150', 'B-VRAI'], array_column($decroissant, 'reference_number'));

        // La coupe range en SQL comme PHP range après elle : couper à k rend les k premières lignes.
        $historique = app(PaymentHistory::class);
        foreach (['remaining_amount', '-remaining_amount'] as $tri) {
            $plein = $historique->select($this->admin, [], [], $tri, 1000)['rows']->pluck('reference_number')->all();
            for ($k = 1; $k < count($plein); $k++) {
                $coupe = $historique->select($this->admin, [], [], $tri, $k)['rows']->pluck('reference_number')->all();
                $this->assertSame(array_slice($plein, 0, $k), $coupe, "{$tri}, k={$k}");
            }
        }
    }

    public function test_le_resume_financier_tient_une_valeur_non_numerique(): void
    {
        $this->loyer('L-ABC', 100_000, PaymentStatus::PartiallyPaid, '2026-11-01', '"abc"');   // reste 100 000
        $this->loyer('L-VIRG', 80_000, PaymentStatus::Late, '2026-10-01', '"30000,5"');        // reste 50 000, comme PHP

        $this->actingAsApi($this->admin);
        $overdue = $this->getJson("/api/agencies/{$this->agency->id}/finance/summary")->assertOk()->json('data.overdue');

        $this->assertSame(2, $overdue['count']);
        $this->assertEquals(150_000.0, $overdue['amount']);
        $this->assertEquals(100_000.0, $overdue['by_age']['from_8_to_30']['amount']);
        $this->assertEquals(50_000.0, $overdue['by_age']['over_30']['amount']);

        $aging = $this->getJson("/api/agencies/{$this->agency->id}/finance/aging")->assertOk()->json('data');
        $this->assertEquals(150_000.0, $aging['total']['amount']);
    }

    private function loyer(string $ref, float $montant, PaymentStatus $statut, string $echeance, string $paidAmountJson): LeasePayment
    {
        $ligne = LeasePayment::factory()->create([
            'lease_id' => $this->bail->id, 'payer_id' => $this->locataire->id, 'reference_number' => $ref, 'amount' => $montant,
            'status' => $statut, 'paid_at' => null, 'payment_method' => PaymentMethod::Wave,
            'period_start' => '2026-10-01', 'period_end' => '2026-10-31', 'due_date' => $echeance,
        ]);
        $this->corrompre('lease_payments', $ligne->id, $paidAmountJson);

        return $ligne;
    }

    private function acompte(string $ref, float $montant, PaymentStatus $statut, string $paidAmountJson): BookingPayment
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id]);
        $reservation = Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->locataire->id]);
        $ligne = BookingPayment::factory()->create([
            'booking_id' => $reservation->id, 'reference_number' => $ref, 'status' => $statut, 'amount' => $montant,
            'payment_method' => PaymentMethod::Wave, 'paid_at' => null,
        ]);
        $this->corrompre('booking_payments', $ligne->id, $paidAmountJson);

        return $ligne;
    }

    /** Hors du modèle, comme une écriture directe en base : le hook `saving` n'est pas joué. */
    private function corrompre(string $table, int $id, string $paidAmountJson): void
    {
        DB::table($table)->where('id', $id)->update(['metadata' => DB::raw("'{\"paid_amount\":".str_replace("'", "''", $paidAmountJson)."}'::jsonb")]);
    }
}
