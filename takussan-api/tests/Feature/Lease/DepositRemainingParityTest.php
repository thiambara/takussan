<?php

namespace Tests\Feature\Lease;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Lease\DepositRefundService;
use App\Services\Lease\DepositRemaining;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2642 — `DepositRemaining::sql()` (le motif `deposit_to_refund` de la file) rend, bail par bail,
 * ce que rend l'accesseur `Lease::deposit_remaining` (TCK-2375) : sans caution, encaissée en partie,
 * restituée en partie avec une retenue, sur une chaîne de renouvellements, et quand un ancêtre est
 * supprimé. Le moindre terme oublié dans le SQL se lit ici comme un écart de montant.
 */
class DepositRemainingParityTest extends TestCase
{
    use RefreshDatabase;

    private User $issuer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->issuer = User::factory()->create();
    }

    private function lease(array $overrides = []): Lease
    {
        return Lease::factory()->create(array_merge([
            'landlord_id' => $this->issuer->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 600000,
        ], $overrides));
    }

    private function deposit(Lease $lease, float $amount, PaymentStatus $status = PaymentStatus::Paid): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id, 'payer_id' => $lease->tenant_id, 'payment_type' => LeasePaymentType::Deposit,
            'amount' => $amount, 'status' => $status, 'paid_at' => $status === PaymentStatus::Paid ? now()->subMonths(6) : null,
        ]);
    }

    /** Pour chaque bail, l'accesseur et le SQL rendent le même reste. */
    private function assertParity(Lease ...$leases): void
    {
        $sql = Lease::query()->withTrashed()->whereIn('id', array_map(fn (Lease $l) => $l->id, $leases))
            ->selectRaw('id, '.DepositRemaining::sql().' as remaining')->pluck('remaining', 'id');

        foreach ($leases as $lease) {
            $accessor = Lease::withTrashed()->findOrFail($lease->id)->deposit_remaining;
            $this->assertEquals($accessor, (float) $sql[$lease->id], "bail {$lease->id} : accesseur {$accessor}, SQL {$sql[$lease->id]}");
        }
    }

    public function test_sans_caution_et_caution_non_encaissee(): void
    {
        $none = $this->lease(['deposit_amount' => null]);
        $unpaid = $this->lease();
        $this->deposit($unpaid, 600000, PaymentStatus::Pending);

        $this->assertParity($none, $unpaid);
        $this->assertSame(0.0, $unpaid->fresh()->deposit_remaining);
    }

    public function test_encaissee_en_partie_puis_au_dela_du_bail(): void
    {
        $partial = $this->lease();
        $this->deposit($partial, 250000);
        $over = $this->lease(['deposit_amount' => 400000]);
        $this->deposit($over, 300000);
        $this->deposit($over, 300000);

        $this->assertParity($partial, $over);
        $this->assertSame(250000.0, $partial->fresh()->deposit_remaining);
        $this->assertSame(400000.0, $over->fresh()->deposit_remaining, 'le montant écrit au bail borne l\'encaissé');
    }

    public function test_restituee_en_partie_avec_une_retenue(): void
    {
        $lease = $this->lease();
        $this->deposit($lease, 600000);
        app(DepositRefundService::class)->refund($lease, $this->issuer, ['amount' => 450000, 'reason' => 'Peinture']);
        $partlyRefunded = $this->lease();
        $this->deposit($partlyRefunded, 600000);
        $partlyRefunded->update(['deposit_refunded_amount' => 100000]);

        $this->assertParity($lease, $partlyRefunded);
        $this->assertSame(0.0, $lease->fresh()->deposit_remaining, 'rendu 450 000 et retenu 150 000');
        $this->assertSame(500000.0, $partlyRefunded->fresh()->deposit_remaining);
    }

    public function test_une_chaine_de_renouvellements(): void
    {
        $root = $this->lease(['status' => LeaseStatus::Renewed]);
        $this->deposit($root, 600000);
        $middle = $this->lease(['status' => LeaseStatus::Renewed, 'renewed_from_lease_id' => $root->id]);
        $child = $this->lease(['status' => LeaseStatus::Expired, 'renewed_from_lease_id' => $middle->id]);
        $middle->update(['deposit_refunded_amount' => 50000]);

        $this->assertParity($root, $middle, $child);
        $this->assertSame(550000.0, $child->fresh()->deposit_remaining, 'la caution du bail racine suit la chaîne');
    }

    public function test_un_ancetre_supprime_coupe_la_chaine(): void
    {
        $root = $this->lease(['status' => LeaseStatus::Renewed]);
        $this->deposit($root, 600000);
        $middle = $this->lease(['status' => LeaseStatus::Renewed, 'renewed_from_lease_id' => $root->id]);
        $child = $this->lease(['status' => LeaseStatus::Expired, 'renewed_from_lease_id' => $middle->id]);
        $middle->delete();

        $this->assertParity($root, $child);
        $this->assertSame(0.0, $child->fresh()->deposit_remaining);
    }
}
