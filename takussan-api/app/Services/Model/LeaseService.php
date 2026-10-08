<?php

namespace App\Services\Model;

use App\Events\Lease\LeaseActivated;
use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
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

        return $this->completeActivation($lease);
    }

    /**
     * TCK-596 §4B (ADR-0042 §6, §8) — ce que fait toute activation, quelle qu'en soit la voie
     * (service interne, seconde signature par code, signature papier) : `active`, `signed_at`,
     * échéancier, `LeaseActivated`. L'appelant a jugé l'état de départ ; sous transaction, il tient
     * le verrou de la ligne du bail.
     */
    public function completeActivation(Lease $lease): Lease
    {
        $lease->update([
            'status' => LeaseStatus::Active,
            'signed_at' => now(),
        ]);

        $fresh = $lease->refresh();

        // `afterCommit` : une activation dans la transaction d'une signature n'émet l'échéancier
        // qu'une fois la ligne validée (sans transaction, l'émission est immédiate).
        GenerateLeasePaymentSchedule::dispatch($fresh)->afterCommit();

        // TCK-265 — fan out the welcome notification to the tenant.
        // The event is `ShouldDispatchAfterCommit`, so even if the caller
        // wraps activation in a transaction the listener still sees the
        // committed `status = active` row.
        LeaseActivated::dispatch($fresh);

        return $fresh;
    }

    public function generateSchedule(Lease $lease): int
    {
        return $this->scheduleUnderLock($lease, failIfExists: true);
    }

    /**
     * La même génération, muette quand l'échéancier existe déjà : pour la tâche de file
     * (`GenerateLeasePaymentSchedule`), qu'une génération manuelle concurrente a pu devancer.
     */
    public function generateScheduleIfMissing(Lease $lease): int
    {
        return $this->scheduleUnderLock($lease, failIfExists: false);
    }

    /**
     * VERIF-596 (hors diff, fermé ici) — le contrôle « aucune échéance » se fait sous le verrou de
     * la ligne `leases`, sur le bail relu. Il se faisait avant la transaction : un clic sur
     * `generate-schedule` concurrent de la tâche de renouvellement (ou de l'activation) lisait
     * tous deux zéro échéance, et l'échéancier était créé deux fois.
     *
     * The whole schedule is one transaction: a mid-loop failure must not leave a partial schedule,
     * which the `$existing > 0` guard would then make permanently unrecoverable on retry.
     */
    private function scheduleUnderLock(Lease $lease, bool $failIfExists): int
    {
        return DB::transaction(function () use ($lease, $failIfExists): int {
            /** @var Lease $lease */
            $lease = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            $existing = $lease->payments()->count();
            // L'ordre des contrôles de chaque appelant est conservé : la tâche se tait d'abord sur un
            // échéancier existant, la route refuse d'abord un bail inactif.
            if ($existing > 0 && ! $failIfExists) {
                return 0;
            }
            abort_code_unless($lease->status === LeaseStatus::Active, 422, 'lease.not_active_schedule');
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
        // The status flip and the penalty charge must commit together: if the
        // penalty insert failed after the status update, the lease would be
        // Terminated with no penalty and the charge could never be re-applied
        // (it's no longer Active).
        return DB::transaction(function () use ($lease, $user, $reason): Lease {
            // VERIF-596 passe 4 (m-c) — statut et indemnité se jugent sur la ligne VERROUILLÉE : sur
            // l'instance liée, une activation validée entre-temps laissait résilier un bail actif
            // sans indemnité.
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless(
                in_array($locked->status, [LeaseStatus::Active, LeaseStatus::PendingSignature], true),
                422,
                'lease.cannot_terminate'
            );

            // VERIF-596 passe 4 (M-T, ADR-0042 §1) — l'indemnité est celle que le contrat imprime :
            // même règle que la voie formelle (`computePenalty`), le terme figé borné aux mois
            // restants. Avant : `min(mois restants, 3)` loyers en dur, quel que soit le contrat
            // signé. Un bail en attente de signature n'est pas en vigueur : aucune indemnité.
            $penaltyAmount = $locked->status === LeaseStatus::Active
                ? app(EarlyTerminationService::class)->computePenalty($locked, now())
                : 0.0;

            $locked->update([
                'status' => LeaseStatus::Terminated,
                'terminated_at' => now(),
                'terminated_by_id' => $user->id,
                'termination_reason' => $reason,
            ]);

            if ($penaltyAmount > 0) {
                LeasePayment::create([
                    'lease_id' => $locked->id,
                    'reference_number' => ReferenceNumberGenerator::leasePayment(),
                    'payer_id' => $locked->tenant_id,
                    'payment_type' => LeasePaymentType::Penalty->value,
                    'amount' => $penaltyAmount,
                    'currency' => $locked->currency?->value ?? 'XOF',
                    'status' => PaymentStatus::Pending,
                    'due_date' => now()->addDays(30)->toDateString(),
                    'period_start' => now()->toDateString(),
                    'period_end' => now()->addDays(30)->toDateString(),
                ]);
            }

            return $locked->refresh();
        });
    }
}
