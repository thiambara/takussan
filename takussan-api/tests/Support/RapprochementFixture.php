<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * TCK-2674 — l'agence du rapprochement « par paiement » : son admin principal, un agent (qui ne
 * rapproche pas), un bail, une réservation, et une seconde agence avec son admin. Les paiements se
 * posent EN MASSE (`insert`) : l'AC1 en demande 846.
 */
trait RapprochementFixture
{
    protected Agency $agency;

    protected User $admin;

    protected User $agent;

    protected Lease $lease;

    protected Customer $payer;

    protected Agency $otherAgency;

    protected User $otherAdmin;

    protected function setUpRapprochement(): void
    {
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->payer = Customer::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop']);
        $this->lease = Lease::factory()->create(['agency_id' => $this->agency->id, 'tenant_id' => $this->payer->id, 'currency' => Currency::XOF]);

        $this->otherAgency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->otherAdmin = User::factory()->create();
        $this->materializeRoleProfile($this->otherAdmin, 'agency_admin', $this->otherAgency);
        $this->otherAgency->update(['primary_admin_id' => $this->otherAdmin->id]);
    }

    /** Le `metadata.gateway` d'un paiement soldé par le webhook d'un fournisseur. */
    protected function gatewaySettled(string $provider, string $transactionId): array
    {
        return ['gateway' => [
            'provider' => $provider, 'transaction_id' => $transactionId, 'settled_by' => $transactionId,
            'transactions' => [['transaction_id' => $transactionId, 'provider' => $provider, 'amount' => 100000]],
        ]];
    }

    /** Le `metadata.gateway` d'un règlement saisi par le personnel (`markManualSettlement`). */
    protected function manuallySettled(): array
    {
        return ['gateway' => ['settled_by' => 'manual']];
    }

    /**
     * `$count` échéances payées sur le bail de l'agence (ou `$lease`), en une requête.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function paidLeasePayments(int $count, PaymentMethod $method, ?array $metadata, array $attributes = [], ?Lease $lease = null): void
    {
        $lease ??= $this->lease;
        $rows = [];
        $now = now();
        for ($i = 0; $i < $count; $i++) {
            $rows[] = $attributes + [
                'lease_id' => $lease->id, 'payer_id' => $this->payer->id,
                'reference_number' => 'LPY-'.Str::upper(Str::random(10)),
                'amount' => 100000, 'currency' => 'XOF', 'payment_method' => $method->value,
                'payment_type' => LeasePaymentType::Rent->value,
                'period_start' => '2026-11-01', 'period_end' => '2026-11-30', 'due_date' => '2026-11-05',
                'status' => PaymentStatus::Paid->value, 'paid_at' => '2026-11-10 09:00:00',
                'metadata' => $metadata === null ? null : json_encode($metadata),
                'created_at' => $now, 'updated_at' => $now,
            ];
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            LeasePayment::query()->insert($chunk);
        }
    }

    /** @param  array<string, mixed>  $attributes */
    protected function leasePayment(array $attributes = []): LeasePayment
    {
        return LeasePayment::factory()->create($attributes + [
            'lease_id' => $this->lease->id, 'payer_id' => $this->payer->id, 'amount' => 100000, 'currency' => 'XOF',
            'payment_method' => PaymentMethod::Cash, 'status' => PaymentStatus::Paid, 'paid_at' => '2026-11-10 09:00:00',
            'marked_paid_at' => '2026-11-10 09:05:00', 'metadata' => $this->manuallySettled(),
        ]);
    }

    protected function booking(?Agency $agency = null): Booking
    {
        return Booking::factory()->create(['agency_id' => ($agency ?? $this->agency)->id]);
    }

    /** @param  array<string, mixed>  $attributes */
    protected function statement(array $attributes = [], ?Agency $agency = null): BankStatement
    {
        return BankStatement::factory()->create($attributes + [
            'agency_id' => ($agency ?? $this->agency)->id, 'status' => BankStatementStatus::ReadyForReview,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    protected function suggestedLine(Model $payment, int $confidence, array $attributes = [], ?BankStatement $statement = null): BankStatementLine
    {
        return BankStatementLine::factory()->create($attributes + [
            'bank_statement_id' => ($statement ?? $this->statement())->id,
            'amount' => $payment->amount, 'currency' => 'XOF', 'posted_at' => '2026-11-11',
            'label' => 'VIR AWA DIOP LOYER NOV', 'match_status' => BankStatementLineMatchStatus::Suggested,
            'matched_payment_type' => $payment::class, 'matched_payment_id' => $payment->getKey(),
            'match_confidence' => $confidence,
        ]);
    }
}
