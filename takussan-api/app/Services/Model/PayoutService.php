<?php

namespace App\Services\Model;

use App\Contracts\Payments\DisbursementDriverContract;
use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutMethodKind;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payout\PayoutApprovalRule;
use App\Services\Payout\PayoutApprovers;
use App\Services\Payout\PayoutCalculator;
use App\Support\SegregationOfDuties;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Les sorties d'argent de l'agence : au bailleur, au prestataire, au locataire (caution).
 *
 * TCK-594 (ADR-0039) — le brut n'est plus une saisie : il se recalcule ici depuis les pièces citées
 * ({@see PayoutCalculator}), qui doivent relever de l'agence de l'émetteur et du bailleur désigné. Un
 * paiement n'est reversé qu'une fois (index uniques des pivots). Trois gestes — préparer, approuver,
 * marquer payé — que {@see SegregationOfDuties} interdit à une même personne de tenir deux fois de
 * suite. Un reversement mobile money ou virement ne se paie que vers une destination vérifiée du
 * bénéficiaire, avec une référence.
 */
class PayoutService
{
    /**
     * Les moyens de paiement qui exigent une destination vérifiée, et la nature de destination que
     * chacun accepte (`null` = toute destination mobile money).
     *
     * @var array<string, list<PayoutMethodKind>|null>
     */
    private const DESTINATION_KINDS = [
        'wave' => [PayoutMethodKind::Wave],
        'orange_money' => [PayoutMethodKind::OrangeMoney],
        'free_money' => [PayoutMethodKind::FreeMoney],
        'mobile_money' => [PayoutMethodKind::Wave, PayoutMethodKind::OrangeMoney, PayoutMethodKind::FreeMoney],
        'bank_transfer' => [PayoutMethodKind::BankTransfer],
    ];

    /** VERIF-594 M-4 — le délai pendant lequel le vérificateur d'une destination ne la paie pas. */
    public const VERIFIER_PAY_DELAY_HOURS = 24;

    public function __construct(
        private readonly PayoutCalculator $calculator,
        private readonly PayoutApprovers $approvers,
        private readonly DisbursementDriverContract $disbursement,
        private readonly PayoutApprovalRule $approvalRule,
    ) {}

    /**
     * Un reversement au bailleur, depuis les pièces citées.
     *
     * @param  array<string,mixed>  $data  lease_payment_ids[], booking_payment_ids[],
     *                                     service_provider_bill_ids[], payout_method_id, period_*,
     *                                     payment_method, scheduled_at, notes
     */
    public function create(User $user, User $landlord, array $data): Payout
    {
        $agency = $this->issuingAgency($user, $data);

        // TCK-528 — le bailleur doit tenir un profil DANS l'agence de l'émetteur.
        abort_code_unless(
            // TCK-587 — APPARTENANCE du bénéficiaire, sans filtre de statut.
            $landlord->hasProfileAt((int) $agency->id, OwnerProfile::class)
            || $landlord->hasProfileAt((int) $agency->id, AgentProfile::class)
            || $landlord->hasProfileAt((int) $agency->id, AgencyAdminProfile::class),
            403,
            'payout.landlord_not_in_agency',
        );

        // ADR-0039 §4 (VERIF-594 m-1) — une agence `individual` ne reverse qu'à son hôte : son argent
        // sort par la chaîne plateforme. Le prestataire de l'hôte passe par `createForBill`.
        abort_code_if(
            $agency->kind?->isIndividual() && ! $landlord->hasProfileAt((int) $agency->id, AgencyAdminProfile::class),
            422,
            'payout.individual_third_party',
        );

        // ADR-0039 §4 — le bénéficiaire ne prépare pas son propre reversement.
        SegregationOfDuties::assertDistinct($user, [$landlord->id], SegregationOfDuties::STEP_PREPARE);

        $leaseIds = $this->ids($data['lease_payment_ids'] ?? []);
        $bookingIds = $this->ids($data['booking_payment_ids'] ?? []);
        $billIds = $this->ids($data['service_provider_bill_ids'] ?? []);

        if ($leaseIds === [] && $bookingIds === [] && $billIds === []) {
            throw ValidationException::withMessages(['lease_payment_ids' => __('money_out.payout.no_items')]);
        }

        // AC19 — le périmètre se vérifie AVANT toute écriture : rien n'est écrit sur un refus.
        $this->assertItemsInScope($agency, $landlord, $leaseIds, $bookingIds, $billIds);
        $destination = $this->destinationOf($data['payout_method_id'] ?? null, $landlord->id)
            ?? $this->defaultVerifiedDestination($landlord->id, (int) $agency->id);

        try {
            // Piège PostgreSQL n° 1 : une violation d'unicité n'est JAMAIS attrapée dans la
            // transaction. Elle la traverse, le rollback a lieu, puis elle devient 409 ici.
            $payout = DB::transaction(fn (): Payout => $this->createLocked(
                $user, $landlord, $agency, $leaseIds, $bookingIds, $billIds, $destination, $data,
            ));
        } catch (UniqueConstraintViolationException) {
            abort_code(409, 'payout.already_paid_out');
        }

        $this->notifyApprovers($payout, $agency);

        return $payout->refresh();
    }

    /**
     * TCK-594 (ADR-0039 §8) — payer une facture d'intervention validée : un `Payout`
     * `service_provider`, soumis au même seuil, aux mêmes quatre yeux et à la même destination
     * vérifiée qu'un reversement au bailleur.
     *
     * @param  array<string,mixed>  $data
     */
    public function createForBill(User $user, ServiceProviderBill $bill, array $data): Payout
    {
        SegregationOfDuties::assertDistinct($user, [$bill->provider_id], SegregationOfDuties::STEP_PREPARE);

        $agency = Agency::query()->findOrFail($bill->agency_id);
        $destination = $this->destinationOf($data['payout_method_id'] ?? null, (int) $bill->provider_id)
            ?? $this->defaultVerifiedDestination((int) $bill->provider_id, (int) $agency->id);

        $payout = DB::transaction(function () use ($user, $bill, &$agency, $destination, $data): Payout {
            /** @var ServiceProviderBill $locked */
            $locked = ServiceProviderBill::query()->whereKey($bill->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== ServiceProviderBillStatus::Validated) {
                abort_code(422, 'service_provider_bill.not_payable');
            }

            $live = Payout::query()
                ->where('service_provider_bill_id', $locked->id)
                ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::holdingItems()))
                ->exists();
            abort_code_if($live, 409, 'service_provider_bill.already_in_payout');

            // VERIF-594 m-3 — une facture antérieure à l'arrondi de l'observateur garde ses décimales :
            // le prestataire reçoit ce que le bailleur paie, à l'unité de la devise.
            $amount = round((float) $locked->amount, Currency::decimalPlacesOf($locked->currency), PHP_ROUND_HALF_UP);
            // VERIF-594 M-1 — le cumul vers ce prestataire se lit sous le verrou de la ligne agence.
            $agency = $this->lockAgency($agency);

            return Payout::create([
                'service_provider_bill_id' => $locked->id,
                'agency_id' => $agency->id,
                'landlord_id' => $locked->provider_id,
                'payee_role' => PayeeRole::ServiceProvider->value,
                'issued_by_id' => $user->id,
                'reference_number' => ReferenceNumberGenerator::payout(),
                'status' => $this->initialStatus($agency, $amount, $data['scheduled_at'] ?? null, PayeeRole::ServiceProvider, (int) $locked->provider_id)->value,
                'gross_amount' => $amount,
                'commission_amount' => 0,
                'net_amount' => $amount,
                'currency' => $locked->currency?->value ?? 'XOF',
                'payment_method' => $data['payment_method'] ?? null,
                'payout_method_id' => $destination?->id,
                'scheduled_at' => $data['scheduled_at'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);
        });

        $this->notifyApprovers($payout, $agency);

        return $payout->refresh();
    }

    /**
     * TCK-594 (ADR-0039 §4) — le second geste. Il n'est permis que depuis `awaiting_approval` : il
     * ne se rejoue pas. Le net approuvé est figé ; un paiement dont le net aurait changé est refusé.
     * La destination l'est aussi (VERIF-594 M-4) : son identifiant, sa forme masquée — celle que
     * l'approbateur a lue — et l'empreinte de son numéro.
     */
    public function approve(Payout $payout, User $actor, mixed $payoutMethodId = null): Payout
    {
        DB::transaction(function () use ($payout, $actor, $payoutMethodId): void {
            /** @var Payout $locked */
            $locked = Payout::query()->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            abort_code_unless($locked->status === PayoutStatus::AwaitingApproval, 422, 'payout.not_awaiting_approval');

            SegregationOfDuties::assertDistinct(
                $actor,
                [$locked->issued_by_id, $locked->beneficiaryUserId()],
                SegregationOfDuties::STEP_APPROVE,
            );

            // VERIF-594 N-1 — l'approbateur peut fixer (ou remplacer) la destination en approuvant :
            // sans elle, un reversement approuvé ne se payait plus qu'en espèces ou par chèque. Il ne
            // cite qu'une destination du bénéficiaire vérifiée pour l'agence ; elle entre dans
            // l'empreinte figée.
            $cited = $payoutMethodId !== null && $payoutMethodId !== '';
            $destination = $cited
                ? $this->approvableDestination($locked, (int) $payoutMethodId)
                : ($locked->payout_method_id !== null ? PayoutMethod::withTrashed()->find($locked->payout_method_id) : null);

            // VERIF-594 passe 3, P3-3 — l'approbateur qui FIXE une destination ne l'a pas vérifiée
            // lui-même dans les 24 h : sinon il vérifie un numéro neuf, le fixe, et plus personne ne le
            // revoit avant le payeur. La même règle que pour le payeur (M-4), appliquée au second geste.
            // Passe 4, P4-3 : la destination fixée, citée ou prise à la préparation — approuver sans
            // rien citer fixe celle du reversement tout autant.
            abort_code_if(
                $this->freshlyVerifiedBy($locked, $destination, $actor),
                403,
                'payout.approver_verified_destination_recently',
            );

            $locked->update([
                'payout_method_id' => $destination?->id,
                'status' => $locked->scheduled_at !== null ? PayoutStatus::Scheduled : PayoutStatus::Pending,
                'approved_by_id' => $actor->id,
                'approved_at' => now(),
                'metadata' => array_merge($locked->metadata ?? [], [
                    'approved_net_amount' => (string) $locked->net_amount,
                    'approved_payout_method_id' => $destination?->id,
                    'approved_destination_masked' => $destination?->masked_identifier,
                    'approved_destination_fingerprint' => $destination?->fingerprint(),
                ]),
            ]);
        });

        return $payout->refresh();
    }

    /**
     * Le troisième geste : l'argent est parti. Référence obligatoire hors espèces, destination
     * vérifiée du bénéficiaire pour le mobile money et le virement, payeur ≠ approbateur.
     *
     * @param  array<string,mixed>  $data
     */
    public function markProcessed(Payout $payout, array $data, User $actor): Payout
    {
        DB::transaction(function () use ($payout, $data, $actor): void {
            /** @var Payout $locked */
            $locked = Payout::query()->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            abort_code_if($locked->status === PayoutStatus::AwaitingApproval, 422, 'payout.awaiting_approval');
            abort_code_unless(
                in_array($locked->status, [PayoutStatus::Pending, PayoutStatus::Scheduled, PayoutStatus::Processing], true),
                422,
                'payout.cannot_process',
            );

            SegregationOfDuties::assertDistinct(
                $actor,
                [$locked->approved_by_id, $locked->beneficiaryUserId()],
                SegregationOfDuties::STEP_PAY,
            );

            $approvedNet = $locked->metadata['approved_net_amount'] ?? null;
            abort_code_if(
                $locked->approved_by_id !== null && $approvedNet !== null
                    && round((float) $approvedNet, 2) !== round((float) $locked->net_amount, 2),
                422,
                'payout.amount_changed_since_approval',
            );

            $method = $this->paymentMethodOf($data['payment_method'] ?? null, $locked);
            abort_code_if($method === null, 422, 'payout.payment_method_required');

            $reference = isset($data['transaction_id']) ? trim((string) $data['transaction_id']) : '';
            abort_code_if($method !== PaymentMethod::Cash && $reference === '', 422, 'payout.reference_required');

            $destination = $this->verifiedDestination($locked, $method, $data['payout_method_id'] ?? null);
            $this->assertApprovedDestination($locked, $destination);
            $this->assertNotFreshlyVerifiedBy($locked, $destination, $actor);

            $locked->update([
                'status' => PayoutStatus::Completed,
                'processed_at' => $data['processed_at'] ?? now(),
                'processed_by_id' => $actor->id,
                'transaction_id' => $reference !== '' ? $reference : $locked->transaction_id,
                'payment_method' => $method,
                'payout_method_id' => $destination?->id ?? $locked->payout_method_id,
                'notes' => isset($data['notes']) && trim((string) $data['notes']) !== '' ? $data['notes'] : $locked->notes,
                'metadata' => array_merge(
                    $locked->metadata ?? [],
                    $this->disbursement->disburse($locked, $destination, $reference !== '' ? $reference : null),
                ),
            ]);

            // VERIF-594 passe 3, P3-2 — la caution rendue solde SA ligne `deposit_refund` du bail.
            $this->depositRefundLine($locked)?->update(['status' => PaymentStatus::Paid, 'paid_at' => $locked->processed_at]);

            if ($locked->payee_role === PayeeRole::ServiceProvider && $locked->service_provider_bill_id !== null) {
                ServiceProviderBill::query()->whereKey($locked->service_provider_bill_id)
                    ->update(['status' => ServiceProviderBillStatus::Paid->value]);
            }
        });

        $payout->refresh();
        $this->notifyBeneficiary($payout, NotificationCode::PayoutProcessed, [
            'transaction' => $payout->transaction_id,
            'destination' => $payout->metadata['destination_masked'] ?? null,
        ]);

        return $payout;
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function markFailed(Payout $payout, array $data, ?User $actor = null): Payout
    {
        $reason = isset($data['failed_reason']) ? trim((string) $data['failed_reason']) : '';

        // VERIF-594 M-5 — le statut se juge sur la ligne VERROUILLÉE, comme `markProcessed` : jugé
        // sur le modèle lié, un échec concurrent d'un paiement écrasait `completed` et détachait les
        // pièces, qui redevenaient reversables (double paiement).
        DB::transaction(function () use ($payout, $reason, $actor): void {
            /** @var Payout $locked */
            $locked = Payout::query()->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            abort_code_if($locked->status === PayoutStatus::AwaitingApproval, 422, 'payout.awaiting_approval');
            abort_code_if(
                in_array($locked->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
                422,
                'payout.cannot_fail',
            );
            abort_code_if($reason === '', 422, 'payout.failure_reason_required');

            $previous = $locked->status;
            $locked->update([
                'status' => PayoutStatus::Failed,
                'failed_reason' => $reason,
            ]);
            $this->detachItems($locked);
            $this->releaseDeposit($locked, $previous, 'failed', $actor);
        });

        $payout->refresh();
        $this->notifyBeneficiary($payout, NotificationCode::PayoutFailed, ['reason' => $payout->failed_reason]);

        return $payout;
    }

    public function cancel(Payout $payout, ?User $actor = null): Payout
    {
        // VERIF-594 M-5 — jugé sous verrou, comme `markFailed`.
        DB::transaction(function () use ($payout, $actor): void {
            /** @var Payout $locked */
            $locked = Payout::query()->whereKey($payout->id)->lockForUpdate()->firstOrFail();

            abort_code_if(
                in_array($locked->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
                422,
                'payout.cannot_cancel'
            );

            $previous = $locked->status;
            $locked->update(['status' => PayoutStatus::Cancelled]);
            $this->detachItems($locked);
            $this->releaseDeposit($locked, $previous, 'cancelled', $actor);
        });

        return $payout->refresh();
    }

    /**
     * @param  list<int>  $leaseIds
     * @param  list<int>  $bookingIds
     * @param  list<int>  $billIds
     * @param  array<string,mixed>  $data
     */
    private function createLocked(
        User $user,
        User $landlord,
        Agency $agency,
        array $leaseIds,
        array $bookingIds,
        array $billIds,
        ?PayoutMethod $destination,
        array $data,
    ): Payout {
        // ADR-0039 §3 — le point de sérialisation est la LIGNE PARENT (bail, réservation), jamais un
        // `lockForUpdate()` sur un agrégat (piège PostgreSQL n° 2). L'ordre des verrous est fixe.
        $leasePayments = LeasePayment::query()->whereIn('id', $leaseIds)->get();
        Lease::query()->whereIn('id', $leasePayments->pluck('lease_id')->unique()->sort()->values())
            ->orderBy('id')->lockForUpdate()->get(['id']);
        $bookingPayments = BookingPayment::query()->whereIn('id', $bookingIds)->get();
        Booking::query()->whereIn('id', $bookingPayments->pluck('booking_id')->unique()->sort()->values())
            ->orderBy('id')->lockForUpdate()->get(['id']);
        $bills = ServiceProviderBill::query()->whereIn('id', $billIds)->orderBy('id')->lockForUpdate()->get();
        // VERIF-594 M-1 — la ligne agence en DERNIER (les pièces d'abord, comme la caution rendue) :
        // le cumul des nets non approuvés vers ce bailleur se lit sous son verrou.
        $agency = $this->lockAgency($agency);

        // Relu sous verrou : une pièce reversée entre la vérification et le verrou rend 409. La
        // course que ce test ne voit pas, l'index unique la refuse — et elle devient 409 aussi.
        $alreadyOut = ($leaseIds !== [] && DB::table('payout_lease_payment')->whereIn('lease_payment_id', $leaseIds)->exists())
            || ($bookingIds !== [] && DB::table('payout_booking_payment')->whereIn('booking_payment_id', $bookingIds)->exists())
            || $bills->contains(fn (ServiceProviderBill $bill) => $bill->imputed_payout_id !== null);
        abort_code_if($alreadyOut, 409, 'payout.already_paid_out');

        $computation = $this->calculator->compute(
            $agency,
            $leasePayments->load('lease:id,reference_number,property_id,commission_rate'),
            $bookingPayments->load('booking:id,reference_number,property_id'),
            $bills,
        );
        $totals = $computation['totals'];
        abort_code_if($totals['net'] < 0, 422, 'payout.net_negative');

        $paidAt = $leasePayments->pluck('paid_at')->concat($bookingPayments->pluck('paid_at'))->filter();
        $leaseOrigin = $bookingPayments->isEmpty() ? $leasePayments->pluck('lease_id')->unique() : collect();
        $bookingOrigin = $leasePayments->isEmpty() ? $bookingPayments->pluck('booking_id')->unique() : collect();

        $payout = Payout::create([
            // L'origine : un seul bail (resp. réservation) → sa colonne ; sinon les pivots la portent.
            'lease_id' => $leaseOrigin->count() === 1 ? $leaseOrigin->first() : null,
            'booking_id' => $bookingOrigin->count() === 1 ? $bookingOrigin->first() : null,
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'payee_role' => PayeeRole::Landlord->value,
            'issued_by_id' => $user->id,
            'reference_number' => ReferenceNumberGenerator::payout(),
            'status' => $this->initialStatus($agency, $totals['net'], $data['scheduled_at'] ?? null, PayeeRole::Landlord, (int) $landlord->id)->value,
            'period_start' => $data['period_start'] ?? $this->dateOf($paidAt->min()),
            'period_end' => $data['period_end'] ?? $this->dateOf($paidAt->max()),
            'gross_amount' => $totals['gross'],
            'commission_amount' => $totals['commission'],
            'fees_amount' => $totals['fees'] > 0 ? $totals['fees'] : null,
            'net_amount' => $totals['net'],
            'currency' => $computation['currency'],
            'payment_method' => $data['payment_method'] ?? null,
            'payout_method_id' => $destination?->id,
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        if ($leaseIds !== []) {
            $payout->leasePayments()->attach($leaseIds);
        }
        if ($bookingIds !== []) {
            $payout->bookingPayments()->attach($bookingIds);
        }
        if ($billIds !== []) {
            ServiceProviderBill::query()->whereIn('id', $billIds)->update(['imputed_payout_id' => $payout->id]);
        }

        return $payout;
    }

    /**
     * L'agence au nom de laquelle on verse : celle du profil actif. Le super-admin la désigne
     * (`agency_id`) — c'est lui qui l'emporte sur le profil qu'il tiendrait par ailleurs ; pour
     * tout autre, `agency_id` est ignoré.
     *
     * @param  array<string,mixed>  $data
     */
    private function issuingAgency(User $user, array $data): Agency
    {
        $agencyId = $user->isSuperAdmin() && isset($data['agency_id'])
            ? (int) $data['agency_id']
            : $user->agency_id;

        abort_code_if($agencyId === null, 403, 'payout.agency_required');

        return Agency::query()->findOrFail($agencyId);
    }

    /**
     * TCK-594 (AC19) — chaque pièce citée relève de l'agence ET du bailleur, et c'est un encaissement
     * reversable. Une pièce inconnue est traitée comme étrangère : on ne dit pas qu'elle n'existe pas.
     *
     * @param  list<int>  $leaseIds
     * @param  list<int>  $bookingIds
     * @param  list<int>  $billIds
     */
    private function assertItemsInScope(Agency $agency, User $landlord, array $leaseIds, array $bookingIds, array $billIds): void
    {
        $leaseTypes = array_map(fn ($t) => $t->value, PayoutCalculator::LEASE_TYPES);
        $leasePayments = LeasePayment::query()->with('lease:id,agency_id,landlord_id')->whereIn('id', $leaseIds)->get()->keyBy('id');
        foreach ($leaseIds as $id) {
            $payment = $leasePayments->get($id);
            if ($payment === null || $payment->lease === null
                || (int) $payment->lease->agency_id !== (int) $agency->id
                || (int) $payment->lease->landlord_id !== (int) $landlord->id) {
                $this->foreignItem('lease_payment_ids', $id);
            }
            if ($payment->status !== PaymentStatus::Paid || ! in_array($payment->payment_type?->value, $leaseTypes, true)) {
                $this->ineligibleItem('lease_payment_ids', $id);
            }
        }

        $bookingTypes = array_map(fn ($t) => $t->value, PayoutCalculator::BOOKING_TYPES);
        $bookingPayments = BookingPayment::query()->with('booking:id,agency_id,property_id', 'booking.property:id,user_id')
            ->whereIn('id', $bookingIds)->get()->keyBy('id');
        foreach ($bookingIds as $id) {
            $payment = $bookingPayments->get($id);
            if ($payment === null || $payment->booking === null
                || (int) $payment->booking->agency_id !== (int) $agency->id
                || (int) $payment->booking->property?->user_id !== (int) $landlord->id) {
                $this->foreignItem('booking_payment_ids', $id);
            }
            if ($payment->status !== PaymentStatus::Paid || ! in_array($payment->payment_type?->value, $bookingTypes, true)) {
                $this->ineligibleItem('booking_payment_ids', $id);
            }
        }

        $bills = ServiceProviderBill::query()->with('property:id,user_id')->whereIn('id', $billIds)->get()->keyBy('id');
        foreach ($billIds as $id) {
            $bill = $bills->get($id);
            if ($bill === null
                || (int) $bill->agency_id !== (int) $agency->id
                || (int) $bill->property?->user_id !== (int) $landlord->id) {
                $this->foreignItem('service_provider_bill_ids', $id);
            }
            if (! $bill->rechargeable_to_landlord
                || ! in_array($bill->status, [ServiceProviderBillStatus::Validated, ServiceProviderBillStatus::Paid], true)) {
                $this->ineligibleItem('service_provider_bill_ids', $id);
            }
        }
    }

    private function foreignItem(string $field, int $id): never
    {
        throw ValidationException::withMessages([$field => __('money_out.payout.foreign_item', ['id' => $id])]);
    }

    private function ineligibleItem(string $field, int $id): never
    {
        throw ValidationException::withMessages([$field => __('money_out.payout.ineligible_item', ['id' => $id])]);
    }

    /** Une destination citée à la préparation appartient au bénéficiaire (vérifiée ou non). */
    /**
     * VERIF-594 N-1 — sans destination citée, un reversement prend la destination par défaut du
     * bénéficiaire, si elle est vérifiée POUR CETTE AGENCE. Sinon il n'en a pas : l'approbateur
     * pourra la fixer.
     */
    private function defaultVerifiedDestination(int $beneficiaryId, int $agencyId): ?PayoutMethod
    {
        return PayoutMethod::query()
            ->where('user_id', $beneficiaryId)
            ->where('is_default', true)
            ->verifiedFor($agencyId)
            ->first();
    }

    /** VERIF-594 N-1 — la destination citée par l'approbateur : du bénéficiaire, vérifiée pour l'agence. */
    private function approvableDestination(Payout $payout, int $payoutMethodId): PayoutMethod
    {
        $destination = $payout->payee_role === PayeeRole::Tenant ? null : PayoutMethod::query()
            ->whereKey($payoutMethodId)
            ->where('user_id', $payout->beneficiaryUserId())
            ->verifiedFor((int) $payout->agency_id)
            ->first();

        abort_code_if($destination === null, 422, 'payout.unverified_destination');

        return $destination;
    }

    private function destinationOf(mixed $payoutMethodId, int $beneficiaryId): ?PayoutMethod
    {
        if ($payoutMethodId === null || $payoutMethodId === '') {
            return null;
        }

        $method = PayoutMethod::query()->whereKey((int) $payoutMethodId)->where('user_id', $beneficiaryId)->first();
        if ($method === null) {
            throw ValidationException::withMessages(['payout_method_id' => __('money_out.payout.foreign_destination')]);
        }

        return $method;
    }

    private function paymentMethodOf(mixed $requested, Payout $payout): ?PaymentMethod
    {
        if ($requested instanceof PaymentMethod) {
            return $requested;
        }
        if (is_string($requested) && $requested !== '') {
            return PaymentMethod::tryFrom($requested);
        }

        return $payout->payment_method;
    }

    /**
     * ADR-0039 §6 — le mobile money et le virement ne partent que vers une destination du
     * bénéficiaire VÉRIFIÉE PAR L'AGENCE DU REVERSEMENT (VERIF-594 M-6), de la nature du moyen choisi. Le locataire d'une caution rendue n'a pas
     * toujours de compte : sa destination reste hors de ce contrôle (Notes du ticket).
     */
    private function verifiedDestination(Payout $payout, PaymentMethod $method, mixed $requestedId): ?PayoutMethod
    {
        $kinds = self::DESTINATION_KINDS[$method->value] ?? null;
        if ($kinds === null || $payout->payee_role === PayeeRole::Tenant) {
            return null;
        }

        $id = ($requestedId !== null && $requestedId !== '') ? (int) $requestedId : $payout->payout_method_id;
        $destination = $id === null ? null : PayoutMethod::query()
            ->whereKey($id)
            ->where('user_id', $payout->beneficiaryUserId())
            ->verifiedFor((int) $payout->agency_id)
            ->first();

        abort_code_if(
            $destination === null || ! in_array($destination->kind, $kinds, true),
            422,
            'payout.unverified_destination',
        );

        return $destination;
    }

    /**
     * VERIF-594 M-4 — l'approbation couvre la destination. Un reversement approuvé ne part que vers
     * la destination approuvée, dont le numéro n'a pas changé depuis (même `id`, même empreinte) ;
     * approuvé sans destination, il ne part vers aucune (espèces, chèque). Un reversement que
     * personne n'a approuvé n'a rien à comparer.
     */
    private function assertApprovedDestination(Payout $payout, ?PayoutMethod $destination): void
    {
        if ($payout->approved_by_id === null || $destination === null) {
            return;
        }

        $metadata = $payout->metadata ?? [];
        $approvedId = $metadata['approved_payout_method_id'] ?? null;
        $approvedFingerprint = $metadata['approved_destination_fingerprint'] ?? null;

        abort_code_if(
            $approvedId === null
                || (int) $approvedId !== (int) $destination->id
                || ! is_string($approvedFingerprint)
                || ! hash_equals($approvedFingerprint, $destination->fingerprint()),
            422,
            'payout.destination_changed_since_approval',
        );
    }

    /**
     * VERIF-594 M-4 — celui qui a vérifié une destination pour l'agence ne la paie pas dans les 24 h
     * qui suivent, approbation ou non : sinon un seul membre vérifie le numéro qu'il veut et paie
     * aussitôt. Passé ce délai, l'avis au titulaire (ADR-0039 §6) a eu le temps d'agir.
     */
    private function assertNotFreshlyVerifiedBy(Payout $payout, ?PayoutMethod $destination, User $actor): void
    {
        abort_code_if($this->freshlyVerifiedBy($payout, $destination, $actor), 403, 'payout.verifier_cannot_pay_yet');
    }

    /** `$actor` a-t-il vérifié `$destination` pour l'agence du reversement il y a moins de 24 h ? */
    private function freshlyVerifiedBy(Payout $payout, ?PayoutMethod $destination, User $actor): bool
    {
        $verification = $destination?->verificationFor((int) $payout->agency_id);

        return $verification !== null
            && (int) $verification->verified_by_id === (int) $actor->id
            && $verification->verified_at !== null
            && $verification->verified_at->gt(now()->subHours(self::VERIFIER_PAY_DELAY_HOURS));
    }

    /**
     * L'état de naissance d'une sortie d'argent : `awaiting_approval` quand {@see PayoutApprovalRule}
     * l'exige, sinon `scheduled` ou `pending`. `$agency` est la ligne relue sous verrou.
     */
    public function initialStatus(Agency $agency, float $net, mixed $scheduledAt, PayeeRole $role, ?int $beneficiaryKey): PayoutStatus
    {
        if ($this->approvalRule->requiresApproval($agency, $net, $role, $beneficiaryKey)) {
            return PayoutStatus::AwaitingApproval;
        }

        return $scheduledAt !== null && $scheduledAt !== '' ? PayoutStatus::Scheduled : PayoutStatus::Pending;
    }

    /** La ligne agence relue sous verrou : le point de sérialisation des sorties d'une agence. */
    private function lockAgency(Agency $agency): Agency
    {
        /** @var Agency */
        return Agency::query()->whereKey($agency->id)->lockForUpdate()->firstOrFail();
    }

    /**
     * Les pièces d'un reversement annulé ou échoué redeviennent reversables (ADR-0039 §3).
     */
    /**
     * VERIF-594 passe 2, N-2 — une caution dont le reversement est refusé (`cancel`, le seul refus de
     * l'approbateur) ou échoue n'a rien rendu : son montant quitte `deposit_refunded_amount`, sous le
     * verrou du bail (pris après celui du reversement), et elle se rend de nouveau. Sans cela, le bail
     * restait « caution rendue » sans qu'aucun argent soit parti (`deposit_refund.already_refunded`).
     *
     * Une seule fois par reversement : seulement depuis un état qui tenait la caution — un reversement
     * `failed` puis annulé ne la rend pas deux fois. La ligne `deposit_refund` du bail (le journal de
     * TCK-027) passe `failed`, et l'activité `deposit_refund_reversed` trace le retour.
     */
    private function releaseDeposit(Payout $payout, PayoutStatus $previous, string $outcome, ?User $actor): void
    {
        if ($payout->payee_role !== PayeeRole::Tenant || $payout->lease_id === null
            || ! in_array($previous, PayoutStatus::holdingItems(), true)) {
            return;
        }

        /** @var Lease|null $lease */
        $lease = Lease::query()->whereKey($payout->lease_id)->lockForUpdate()->first();
        if ($lease === null) {
            return;
        }

        $amount = (float) $payout->net_amount;
        $refunded = max(0.0, round((float) ($lease->deposit_refunded_amount ?? 0) - $amount, 2));
        $lease->forceFill([
            'deposit_refunded_amount' => $refunded,
            'deposit_refunded_at' => $refunded > 0 ? $lease->deposit_refunded_at : null,
        ])->save();

        $line = $this->depositRefundLine($payout);
        $line?->update(['status' => PaymentStatus::Failed]);
        $invoice = $this->releaseRetentionInvoice($payout, $actor);

        activity('Lease')
            ->performedOn($lease)
            ->causedBy($actor)
            ->withProperties([
                'payout_id' => $payout->id, 'amount' => $amount, 'outcome' => $outcome, 'lease_payment_id' => $line?->id,
                'invoice_id' => $invoice?->id, 'invoice_status' => $invoice?->status->value,
            ])
            ->event('deposit_refund_reversed')
            ->log('deposit_refund_reversed');
    }

    /**
     * VERIF-594 passe 3, P3-2 — la ligne `deposit_refund` d'une caution rendue se retrouve par le lien
     * que la restitution a posé (`metadata.lease_payment_id`), jamais par son montant : deux
     * restitutions de même montant se départageaient par l'id le plus récent, et l'annulation de la
     * première faisait échouer la ligne de la seconde. Seule une ligne encore `pending` bouge.
     */
    private function depositRefundLine(Payout $payout): ?LeasePayment
    {
        $lineId = $payout->metadata['lease_payment_id'] ?? null;
        if ($payout->payee_role !== PayeeRole::Tenant || $payout->lease_id === null || $lineId === null) {
            return null;
        }

        return LeasePayment::query()
            ->whereKey((int) $lineId)
            ->where('lease_id', $payout->lease_id)
            ->where('payment_type', LeasePaymentType::DepositRefund->value)
            ->where('status', PaymentStatus::Pending->value)
            ->first();
    }

    /**
     * VERIF-594 passe 3, P3-1 — la facture de retenue d'une restitution refusée ou échouée tombe avec
     * elle : sinon la restitution suivante en créait une seconde, et la retenue se facturait deux fois
     * au locataire. Elle suit le chemin d'annulation de toute facture ({@see InvoiceService::cancel}) :
     * un brouillon s'annule, une facture émise se contrepasse par un avoir. Une facture déjà payée ou
     * annulée reste telle quelle — la restitution n'a pas à défaire un règlement.
     *
     * Passe 4, P4-4 — la facture se relit sous verrou (après le reversement et le bail, l'ordre de
     * toute sortie) et son statut se juge sur cette ligne : lue sans verrou, une facture réglée entre
     * la lecture et l'annulation faisait échouer tout le refus sur `invoice.cannot_cancel`. Réglée
     * avant, elle reste payée, et le restituable la déduit (P4-1).
     */
    private function releaseRetentionInvoice(Payout $payout, ?User $actor): ?Invoice
    {
        $invoiceId = $payout->metadata['invoice_id'] ?? null;
        $invoice = $invoiceId === null ? null : Invoice::query()->whereKey((int) $invoiceId)->lockForUpdate()->first();
        if ($invoice === null) {
            return null;
        }

        if (in_array($invoice->status, [InvoiceStatus::Draft, InvoiceStatus::Sent, InvoiceStatus::Overdue], true)) {
            return app(InvoiceService::class)->cancel($invoice, $actor);
        }

        return $invoice;
    }

    private function detachItems(Payout $payout): void
    {
        DB::table('payout_lease_payment')->where('payout_id', $payout->id)->delete();
        DB::table('payout_booking_payment')->where('payout_id', $payout->id)->delete();
        ServiceProviderBill::query()->where('imputed_payout_id', $payout->id)->update(['imputed_payout_id' => null]);
    }

    /** Les approbateurs possibles d'un reversement en attente, hors émetteur et bénéficiaire. */
    public function notifyApprovers(Payout $payout, Agency $agency): void
    {
        if ($payout->status !== PayoutStatus::AwaitingApproval) {
            return;
        }

        $excluded = array_filter([(int) $payout->issued_by_id, $payout->beneficiaryUserId()]);
        $recipients = $this->approvers->holders($agency)
            ->reject(fn (User $user): bool => in_array((int) $user->id, $excluded, true));

        foreach ($recipients as $recipient) {
            $this->notifications()->send($recipient, NotificationCode::PayoutAwaitingApproval, self::notificationParams($payout), NotificationTarget::of('finances'));
        }
    }

    /** @param  array<string, mixed>  $extra */
    private function notifyBeneficiary(Payout $payout, NotificationCode $code, array $extra): void
    {
        $beneficiaryId = $payout->beneficiaryUserId();
        $beneficiary = $beneficiaryId !== null ? User::query()->find($beneficiaryId) : null;
        if ($beneficiary !== null) {
            $this->notifications()->send($beneficiary, $code, self::notificationParams($payout) + $extra);
        }
    }

    /**
     * Les paramètres communs des avis d'un reversement : sa référence et son NET, montant brut que
     * le rendu formate dans la langue du destinataire (ADR-0032).
     *
     * @return array{reference: ?string, amount: array{amount: string, currency: string}}
     */
    public static function notificationParams(Payout $payout): array
    {
        return [
            'reference' => $payout->reference_number,
            'amount' => NotificationRenderer::money($payout->net_amount, $payout->currency),
        ];
    }

    private function notifications(): NotificationService
    {
        return app(NotificationService::class);
    }

    /**
     * @return list<int>
     */
    private function ids(mixed $values): array
    {
        return Collection::wrap($values)
            ->filter(fn ($v) => $v !== null && $v !== '')
            ->map(fn ($v) => (int) $v)
            ->unique()
            ->values()
            ->all();
    }

    private function dateOf(mixed $value): ?string
    {
        return $value === null ? null : Carbon::parse($value)->toDateString();
    }
}
