<?php

namespace App\Services\Model;

use App\Events\Lease\LeaseActivated;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class LeaseService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Property $property, User $user, array $data): Lease
    {
        // TCK-587 (ADR-0031) — le bailleur du bien, ou le PERSONNEL de l'agence du bien tenant
        // `leases.create`. La clause « même agence » laissait un autre bailleur de l'agence ouvrir un
        // bail sur le bien d'un autre, et `leases.create` n'avait aucun lecteur.
        $staffAgencyId = $user->staffAgencyId();
        $canCreate = $user->isSuperAdmin()
            || ($property->user_id === $user->id
                && ($property->agency_id === null || ! $user->isBlockedOwnerAt((int) $property->agency_id)))
            || ($property->agency_id !== null
                && $staffAgencyId === (int) $property->agency_id
                && $user->can(Capability::LeasesCreate->value, $property));
        abort_unless($canCreate, 403);

        // TCK-587 (vérification adverse, B2) — le locataire et le garant doivent être dans le
        // périmètre de l'émetteur (`view`), comme le client d'une réservation (`BookingService`).
        // `exists:` seul laissait rattacher le contact de n'importe qui, puis lire sa fiche par
        // le bail.
        $tenant = Customer::query()->find($data['tenant_id'] ?? null);
        abort_unless($tenant !== null && $user->can('view', $tenant), 403);
        if (! empty($data['guarantor_id'])) {
            $guarantor = Guarantor::query()->find($data['guarantor_id']);
            abort_unless($guarantor !== null && $user->can('view', $guarantor), 403);
        }

        // TCK-595 (ADR-0049 §1) — sans négociateur saisi, le créateur s'il est personnel de l'agence du
        // bien. Un bailleur qui crée son propre bail ne se désigne pas.
        if (! array_key_exists('agent_id', $data)) {
            $data['agent_id'] = PersonnelDeLAgence::estPersonnel($user, $property->agency_id) ? $user->id : null;
        }

        // TCK-595 (ADR-0049 §2) — une vente sans montant naît avec prix × taux. Jamais une location :
        // son `commission_rate` est le taux de gestion des reversements (ADR-0039), un autre flux.
        if (($data['commission_amount'] ?? null) === null
            && ($data['type'] ?? null) === LeaseType::Sale->value
            && isset($data['sale_price'], $data['commission_rate'])) {
            $data['commission_amount'] = round((float) $data['sale_price'] * (float) $data['commission_rate'] / 100, 2);
        }

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
        abort_code_unless(
            $lease->status === LeaseStatus::Draft,
            422,
            'lease.not_draft_activate'
        );

        $lease->update([
            'status' => LeaseStatus::Active,
            'signed_at' => now(),
        ]);

        $fresh = $lease->refresh();

        GenerateLeasePaymentSchedule::dispatch($fresh);

        // TCK-265 — fan out the welcome notification to the tenant.
        // The event is `ShouldDispatchAfterCommit`, so even if the caller
        // wraps activation in a transaction the listener still sees the
        // committed `status = active` row.
        LeaseActivated::dispatch($fresh);

        return $fresh;
    }

    public function generateSchedule(Lease $lease): int
    {
        abort_code_unless($lease->status === LeaseStatus::Active, 422, 'lease.not_active_schedule');

        $existing = $lease->payments()->count();
        abort_code_if($existing > 0, 422, 'lease.schedule_exists');

        $start = Carbon::parse($lease->start_date);
        $end = $lease->end_date ? Carbon::parse($lease->end_date) : null;
        $frequency = $lease->payment_frequency ?? PaymentFrequency::Monthly;
        $amount = (float) ($lease->monthly_rent ?? 0);
        $paymentDay = $lease->payment_day ?? 1;

        $current = $start->copy()->day(min($paymentDay, $start->daysInMonth));

        if ($current->lt($start)) {
            $current = $this->advancePeriod($current, $frequency);
        }

        // Wrap the whole schedule in a transaction: a mid-loop failure must not
        // leave a partial schedule, which the `$existing > 0` guard above would
        // then make permanently unrecoverable on retry.
        return DB::transaction(function () use ($lease, $current, $end, $frequency, $amount): int {
            $count = 0;

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
        });
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
        abort_code_unless(
            in_array($lease->status, [LeaseStatus::Active, LeaseStatus::PendingSignature], true),
            422,
            'lease.cannot_terminate'
        );

        $penaltyAmount = null;
        if ($lease->status === LeaseStatus::Active && $lease->end_date && $lease->end_date->isFuture()) {
            $remainingMonths = (int) now()->diffInMonths($lease->end_date);
            $penaltyAmount = min($remainingMonths, 3) * ($lease->monthly_rent ?? 0);
        }

        // The status flip and the penalty charge must commit together: if the
        // penalty insert failed after the status update, the lease would be
        // Terminated with no penalty and the charge could never be re-applied
        // (it's no longer Active).
        DB::transaction(function () use ($lease, $user, $reason, $penaltyAmount): void {
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
        });

        return $lease->refresh();
    }
}
