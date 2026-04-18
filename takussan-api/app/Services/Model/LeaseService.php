<?php

namespace App\Services\Model;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Carbon\Carbon;

class LeaseService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Property $property, User $user, array $data): Lease
    {
        $canCreate = $user->hasRole(['admin', 'super_admin'])
            || $property->user_id === $user->id
            || ($user->agency_id && $property->agency_id === $user->agency_id);
        abort_unless($canCreate, 403);

        return Lease::create(array_merge($data, [
            'reference_number' => ReferenceNumberGenerator::lease(),
            'landlord_id' => $property->user_id,
            'agency_id' => $property->agency_id ?? $user->agency_id,
            'status' => LeaseStatus::Draft->value,
            'currency' => $data['currency'] ?? 'XOF',
            'payment_frequency' => $data['payment_frequency'] ?? 'monthly',
        ]));
    }

    public function activate(Lease $lease): Lease
    {
        abort_unless(
            $lease->status === LeaseStatus::Draft,
            422,
            'Only draft leases can be activated.'
        );

        $lease->update([
            'status' => LeaseStatus::Active,
            'signed_at' => now(),
        ]);

        GenerateLeasePaymentSchedule::dispatch($lease->refresh());

        return $lease->refresh();
    }

    /** @param array<string,mixed> $data */
    public function renew(Lease $lease, array $data): Lease
    {
        abort_unless(
            in_array($lease->status, [LeaseStatus::Active, LeaseStatus::Expired], true),
            422,
            'Only active or expired leases can be renewed.'
        );

        $newLease = Lease::create([
            'property_id' => $lease->property_id,
            'landlord_id' => $lease->landlord_id,
            'tenant_id' => $lease->tenant_id,
            'agency_id' => $lease->agency_id,
            'guarantor_id' => $lease->guarantor_id,
            'renewed_from_lease_id' => $lease->id,
            'reference_number' => ReferenceNumberGenerator::lease(),
            'type' => $lease->type,
            'status' => LeaseStatus::Draft,
            'start_date' => $lease->end_date?->addDay() ?? now(),
            'end_date' => $data['end_date'],
            'monthly_rent' => $data['monthly_rent'] ?? $lease->monthly_rent,
            'currency' => $lease->currency,
            'deposit_amount' => $lease->deposit_amount,
            'payment_frequency' => $lease->payment_frequency,
            'payment_day' => $lease->payment_day,
            'terms' => $data['terms'] ?? $lease->terms,
        ]);

        $lease->update(['status' => LeaseStatus::Renewed]);

        return $newLease;
    }

    public function generateSchedule(Lease $lease): int
    {
        abort_unless($lease->status === LeaseStatus::Active, 422, 'Only active leases can generate a payment schedule.');

        $existing = $lease->payments()->count();
        abort_if($existing > 0, 422, 'Payment schedule already generated.');

        $start = Carbon::parse($lease->start_date);
        $end = $lease->end_date ? Carbon::parse($lease->end_date) : null;
        $frequency = $lease->payment_frequency ?? PaymentFrequency::Monthly;
        $amount = (float) ($lease->monthly_rent ?? 0);
        $paymentDay = $lease->payment_day ?? 1;
        $count = 0;

        $current = $start->copy()->day(min($paymentDay, $start->daysInMonth));

        if ($current->lt($start)) {
            $current = $this->advancePeriod($current, $frequency);
        }

        while ($end === null || $current->lte($end)) {
            LeasePayment::create([
                'lease_id' => $lease->id,
                'reference_number' => ReferenceNumberGenerator::leasePayment(),
                'payer_id' => $lease->tenant_id,
                'payment_type' => LeasePaymentType::Rent->value,
                'amount' => $amount,
                'currency' => $lease->currency?->value ?? 'XOF',
                'status' => PaymentStatus::Pending,
                'due_date' => $current->toDateString(),
                'period_start' => $current->copy()->startOfMonth()->toDateString(),
                'period_end' => $current->copy()->endOfMonth()->toDateString(),
            ]);

            $count++;
            $current = $this->advancePeriod($current, $frequency);

            // Safety cap to avoid infinite loop when end_date is null
            if ($end === null && $count >= 12) {
                break;
            }
        }

        return $count;
    }

    private function advancePeriod(Carbon $date, PaymentFrequency $frequency): Carbon
    {
        return match ($frequency) {
            PaymentFrequency::Monthly => $date->addMonth(),
            PaymentFrequency::Quarterly => $date->addMonths(3),
            PaymentFrequency::Yearly => $date->addYear(),
        };
    }

    public function terminate(Lease $lease, User $user, ?string $reason = null): Lease
    {
        abort_unless(
            in_array($lease->status, [LeaseStatus::Active, LeaseStatus::PendingSignature], true),
            422,
            __('messages.lease_cannot_terminate')
        );

        $penaltyAmount = null;
        if ($lease->status === LeaseStatus::Active && $lease->end_date && $lease->end_date->isFuture()) {
            $remainingMonths = (int) now()->diffInMonths($lease->end_date);
            $penaltyAmount = min($remainingMonths, 3) * ($lease->monthly_rent ?? 0);
        }

        $lease->update([
            'status' => LeaseStatus::Terminated,
            'terminated_at' => now(),
            'terminated_by_id' => $user->id,
            'termination_reason' => $reason,
        ]);

        if ($penaltyAmount && $penaltyAmount > 0) {
            LeasePayment::create([
                'lease_id' => $lease->id,
                'reference_number' => ReferenceNumberGenerator::leasePayment(),
                'payer_id' => $lease->tenant_id,
                'payment_type' => LeasePaymentType::Penalty->value,
                'amount' => $penaltyAmount,
                'currency' => $lease->currency?->value ?? 'XOF',
                'status' => PaymentStatus::Pending,
                'due_date' => now()->addDays(30)->toDateString(),
                'period_start' => now()->toDateString(),
                'period_end' => now()->addDays(30)->toDateString(),
            ]);
        }

        return $lease->refresh();
    }

    public function refundDeposit(Lease $lease): LeasePayment
    {
        abort_unless(
            in_array($lease->status, [LeaseStatus::Terminated, LeaseStatus::Expired], true),
            422,
            __('messages.lease_must_be_ended_for_refund')
        );

        $existingRefund = $lease->payments()
            ->where('payment_type', LeasePaymentType::DepositRefund->value)
            ->exists();
        abort_if($existingRefund, 422, __('messages.deposit_already_refunded'));

        $amount = (float) ($lease->deposit_amount ?? 0);
        abort_if($amount <= 0, 422, __('messages.no_deposit_to_refund'));

        return LeasePayment::create([
            'lease_id' => $lease->id,
            'reference_number' => ReferenceNumberGenerator::leasePayment(),
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::DepositRefund->value,
            'amount' => $amount,
            'currency' => $lease->currency?->value ?? 'XOF',
            'status' => PaymentStatus::Pending,
            'due_date' => now()->addDays(30)->toDateString(),
            'period_start' => now()->toDateString(),
            'period_end' => now()->addDays(30)->toDateString(),
        ]);
    }
}
