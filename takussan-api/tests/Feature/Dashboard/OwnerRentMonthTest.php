<?php

namespace Tests\Feature\Dashboard;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2623 — « Loyers de novembre : 8 reçus sur 14 » : `finance.rent_month` du bailleur, sur les seules
 * échéances de LOYER de ses baux dues dans le mois courant (heure de Dakar). Une caution n'est jamais
 * une échéance ; une échéance annulée n'est plus attendue.
 */
class OwnerRentMonthTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 10:00:00', 'Africa/Dakar'));
    }

    private function echeance(Lease $lease, string $dueDate, PaymentStatus $status, LeasePaymentType $type = LeasePaymentType::Rent, int $montant = 100_000): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $montant,
            'payment_type' => $type,
            'status' => $status,
            'due_date' => $dueDate,
            'period_start' => substr($dueDate, 0, 8).'01',
            'paid_at' => $status === PaymentStatus::Paid ? now() : null,
        ]);
    }

    /** AC4. */
    public function test_ac4_huit_recus_sur_quatorze_caution_et_annulee_exclues(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $baux = Lease::factory()->active()->count(2)->create(['landlord_id' => $owner->id]);

        // 14 loyers de novembre, dont 8 soldés.
        foreach (range(1, 14) as $i) {
            $this->echeance($baux[$i % 2], sprintf('2026-11-%02d', min($i * 2, 30)), $i <= 8 ? PaymentStatus::Paid : PaymentStatus::Pending);
        }
        // Une caution, une restitution de caution et des charges du mois : pas des loyers.
        $this->echeance($baux[0], '2026-11-05', PaymentStatus::Paid, LeasePaymentType::Deposit);
        $this->echeance($baux[0], '2026-11-05', PaymentStatus::Pending, LeasePaymentType::DepositRefund);
        $this->echeance($baux[1], '2026-11-05', PaymentStatus::Paid, LeasePaymentType::Charges);
        // Un loyer annulé (renouvellement) n'est plus attendu.
        $this->echeance($baux[1], '2026-11-05', PaymentStatus::Cancelled);
        // Octobre et décembre : hors du mois.
        $this->echeance($baux[0], '2026-10-31', PaymentStatus::Paid);
        $this->echeance($baux[0], '2026-12-01', PaymentStatus::Pending);
        // Le loyer d'un autre bailleur.
        $this->echeance(Lease::factory()->active()->create(['landlord_id' => User::factory()->create()->id]), '2026-11-05', PaymentStatus::Paid);

        $reponse = $this->apiGet('/api/dashboard/owner')->assertOk()
            ->assertJsonPath('data.finance.rent_month.received_count', 8)
            ->assertJsonPath('data.finance.rent_month.expected_count', 14);
        $this->assertEquals(800_000, $reponse->json('data.finance.rent_month.received_amount'));

        $this->apiGet('/api/dashboard/me')->assertOk()
            ->assertJsonPath('data.metrics.rent_month.received_count', 8)
            ->assertJsonPath('data.metrics.rent_month.expected_count', 14);
    }

    /** Une échéance en échec de paiement reste attendue : elle peut repasser à payée. */
    public function test_une_echeance_en_echec_reste_attendue(): void
    {
        $owner = $this->apiActingAsRole('owner');
        $bail = Lease::factory()->active()->create(['landlord_id' => $owner->id]);
        $this->echeance($bail, '2026-11-05', PaymentStatus::Failed);
        $this->echeance($bail, '2026-11-06', PaymentStatus::Late);

        $reponse = $this->apiGet('/api/dashboard/owner')->assertOk()
            ->assertJsonPath('data.finance.rent_month.received_count', 0)
            ->assertJsonPath('data.finance.rent_month.expected_count', 2);
        $this->assertEquals(0, $reponse->json('data.finance.rent_month.received_amount'));
    }
}
