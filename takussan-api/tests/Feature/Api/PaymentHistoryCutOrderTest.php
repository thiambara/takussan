<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\PaymentHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2721 (contre-vérification de e368b24e4) — `PaymentHistory::select()` coupé à `k` lignes rend
 * les `k` PREMIÈRES lignes de la sélection non coupée, pour chacun des dix tris et pour tout `k`.
 *
 * La coupe se fait source par source (acomptes, loyers) après un ordre SQL (`orderForCut`), puis les
 * deux sources sont fusionnées et triées en PHP (`applySort`). La propriété ne tient que si l'ordre
 * SQL de chaque source est celui de PHP. Le décor est bâti pour qu'une divergence fasse passer une
 * ligne à travers la coupe : ex æquo entre les deux sources et dans une même source, acomptes sur les
 * trois branches du reste dû, date d'un acompte impayé reprise de `created_at`, et ordre physique de
 * la table bousculé par un `UPDATE`.
 *
 * Trois ablations, que `PaymentHistoryExportTest` laissait vertes, rougissent ici :
 *  - A1 : la clé `remaining_amount` des acomptes remplacée par `amount` ;
 *  - A2 : la date d'un acompte réduite à `paid_at`, sans repli sur `created_at`. Elle ne rougit qu'avec
 *    un acompte IMPAYÉ plus récent que les acomptes payés (B-7), le cas réel d'un acompte en attente
 *    créé le jour même ;
 *  - A3 : le départage par `id` retiré.
 */
class PaymentHistoryCutOrderTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const TRIS = ['-date', 'date', '-amount', 'amount', '-created_at', 'created_at', '-remaining_amount', 'remaining_amount', '-days_late', 'days_late'];

    private User $admin;

    private Agency $agency;

    private Lease $bail;

    private Customer $locataire;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->locataire = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $this->agency->id]);
        $this->bail = Lease::factory()->active()->create([
            'property_id' => $bien->id, 'landlord_id' => $bailleur->id, 'tenant_id' => $this->locataire->id, 'agency_id' => $this->agency->id,
        ]);
    }

    public function test_une_coupe_a_k_lignes_rend_les_k_premieres_lignes_dans_les_dix_tris(): void
    {
        $this->decor();
        $historique = app(PaymentHistory::class);

        $ecarts = [];
        foreach (self::TRIS as $tri) {
            $plein = $historique->select($this->admin, [], [], $tri, 1000)['rows']->pluck('reference_number')->all();
            $this->assertCount(14, $plein, "sans coupe : {$tri}");

            for ($k = 1; $k < count($plein); $k++) {
                $coupe = $historique->select($this->admin, [], [], $tri, $k)['rows']->pluck('reference_number')->all();
                if ($coupe !== array_slice($plein, 0, $k)) {
                    $ecarts[] = "{$tri}, k={$k} : ".implode(',', $coupe).' au lieu de '.implode(',', array_slice($plein, 0, $k));
                }
            }
        }

        $this->assertSame([], $ecarts);
    }

    /**
     * Quatorze lignes. Ex æquo entre sources : date (B-1 / L-1), montant (B-2 / L-3 / L-5), reste dû
     * (B-2 / B-3 / L-5), created_at (B-4 / L-6) ; dans une source : date (B-2 / B-5 / B-6), retard
     * (L-2 / L-7).
     */
    private function decor(): void
    {
        $this->loyer('L-1', 500, PaymentStatus::Paid, '2026-10-05 09:00:00', '2026-10-01', '2026-10-05', [], '2026-10-01 08:00:00');
        $this->acompte('B-1', 700, PaymentStatus::Paid, '2026-10-05 09:00:00', [], '2026-10-02 08:00:00');
        $this->loyer('L-2', 300, PaymentStatus::Late, null, '2026-09-01', '2026-09-05', [], '2026-09-01 08:00:00');
        $this->acompte('B-2', 400, PaymentStatus::Pending, null, [], '2026-11-02 08:00:00');                                      // date = created_at
        $this->loyer('L-3', 400, PaymentStatus::PartiallyPaid, null, '2026-11-01', '2026-11-05', ['metadata' => ['paid_amount' => 150]], '2026-11-01 07:00:00');
        $this->acompte('B-3', 1000, PaymentStatus::Paid, '2026-11-03 09:00:00', ['metadata' => ['paid_amount' => 600]], '2026-11-03 08:00:00'); // reste 400
        $this->acompte('B-4', 900, PaymentStatus::Refunded, '2026-11-04 09:00:00', ['refund_amount' => 250], '2026-11-04 08:00:00');            // reste 250
        $this->loyer('L-4', 800, PaymentStatus::Paid, '2026-11-06 09:00:00', '2026-11-01', '2026-11-05', ['refund_amount' => 100], '2026-11-04 08:00:00');
        $this->loyer('L-5', 400, PaymentStatus::Pending, null, '2026-12-01', '2026-12-05', [], '2026-11-10 08:00:00');
        $this->acompte('B-5', 600, PaymentStatus::PartiallyPaid, null, ['metadata' => ['paid_amount' => 450]], '2026-11-02 08:00:00');          // reste 150
        $this->loyer('L-6', 300, PaymentStatus::Pending, null, '2026-07-01', '2026-07-05', ['payment_type' => LeasePaymentType::DepositRefund], '2026-11-04 08:00:00');
        $this->loyer('L-7', 300, PaymentStatus::Late, null, '2026-10-01', '2026-09-05', [], '2026-09-01 08:00:00');                // même retard que L-2
        $this->acompte('B-6', 400, PaymentStatus::Paid, '2026-11-02 08:00:00', ['metadata' => ['paid_amount' => 400]], '2026-11-02 08:00:00'); // reste 0
        $this->acompte('B-7', 350, PaymentStatus::Pending, null, [], '2026-11-14 08:00:00');                                      // le plus récent, impayé (A2)

        // Une mise à jour range la ligne en fin de table : sans départage par id, l'ordre des ex æquo
        // n'est plus celui de l'insertion.
        DB::table('lease_payments')->where('reference_number', 'L-1')->update(['notes' => 'x']);
        DB::table('booking_payments')->where('reference_number', 'B-1')->update(['updated_at' => now()]);
    }

    /** @param  array<string, mixed>  $plus */
    private function loyer(string $ref, float $montant, PaymentStatus $statut, ?string $payeLe, string $debut, ?string $echeance, array $plus, string $creeLe): void
    {
        $ligne = LeasePayment::factory()->create([
            'lease_id' => $this->bail->id, 'payer_id' => $this->locataire->id, 'reference_number' => $ref, 'amount' => $montant,
            'status' => $statut, 'paid_at' => $payeLe, 'payment_method' => PaymentMethod::Wave,
            'period_start' => $debut, 'period_end' => Carbon::parse($debut)->endOfMonth()->toDateString(), 'due_date' => $echeance,
        ]);
        $ligne->forceFill($plus)->save();
        DB::table('lease_payments')->where('id', $ligne->id)->update(['created_at' => $creeLe]);
    }

    /** @param  array<string, mixed>  $plus */
    private function acompte(string $ref, float $montant, PaymentStatus $statut, ?string $payeLe, array $plus, string $creeLe): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id]);
        $reservation = Booking::factory()->create(['property_id' => $bien->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->locataire->id]);
        $ligne = BookingPayment::factory()->create([
            'booking_id' => $reservation->id, 'reference_number' => $ref, 'status' => $statut, 'amount' => $montant,
            'payment_method' => PaymentMethod::Wave, 'paid_at' => $payeLe,
        ]);
        $ligne->forceFill($plus)->save();
        DB::table('booking_payments')->where('id', $ligne->id)->update(['created_at' => $creeLe]);
    }
}
