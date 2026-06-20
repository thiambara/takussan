<?php

namespace App\Services\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\UserStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Notifications\AccountDeletionExecutedNotification;
use App\Notifications\AccountDeletionRequestedNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-080 — RGPD self-service account deletion.
 *
 * Lifecycle:
 *  - {@see requestDeletion()} verifies anti-escalade obligations, creates
 *    an {@see AccountDeletionRequest} with `scheduled_for = now() + grace`,
 *    revokes ALL Sanctum tokens, journals the transition and notifies
 *    the user.
 *  - {@see cancelDeletion()} purges the request before `scheduled_for`.
 *  - {@see executeDeletion()} runs at/after `scheduled_for` (called by the
 *    scheduled command) and performs irreversible anonymization while
 *    preserving accounting/legal records.
 *
 * Anonymization preserves: BookingPayment, LeasePayment, Invoice, Lease,
 * Booking, Payout, ActivityLog (10 yr retention). Customer rows attached
 * via `user_id` are dissociated (`user_id = null`) but kept.
 */
class AccountDeletionService
{
    /**
     * Allowed reason codes a user may attach to a deletion request —
     * validated as an allow-list via Rule::in().
     */
    public const REASON_CODES = [
        'service_completed',
        'quality_issue',
        'privacy',
        'other',
    ];

    public function graceDays(): int
    {
        return max(1, (int) config('auth.account_deletion.grace_days', 30));
    }

    /**
     * Request deletion: validates obligations, persists the request, revokes
     * tokens. Caller is responsible for verifying password + 2FA *before*
     * invoking the service (FormRequest handles that).
     *
     * @throws ValidationException 422 with `obligations` payload listing
     *                             leases/payments still pending
     */
    public function requestDeletion(User $user, ?string $reason = null, ?string $reasonCode = null): AccountDeletionRequest
    {
        $obligations = $this->collectOpenObligations($user);
        if ($obligations !== []) {
            throw ValidationException::withMessages([
                'obligations' => [__('account.deletion.errors.has_obligations')],
            ])->status(422);
        }

        return DB::transaction(function () use ($user, $reason, $reasonCode) {
            $now = now();
            $scheduledFor = $now->copy()->addDays($this->graceDays());

            $request = AccountDeletionRequest::query()->updateOrCreate(
                ['user_id' => $user->id],
                [
                    'requested_at' => $now,
                    'scheduled_for' => $scheduledFor,
                    'reason' => $reason,
                    'reason_code' => $reasonCode,
                    'executed_at' => null,
                    'reminder_sent_at' => null,
                ],
            );

            $user->forceFill(['deletion_requested_at' => $now])->save();

            // Token revocation — user is logged out everywhere immediately.
            // They can re-authenticate to cancel, which mints a fresh token.
            $user->tokens()->delete();

            activity('Account')
                ->performedOn($request)
                ->causedBy($user)
                ->withProperties([
                    'scheduled_for' => $scheduledFor->toIso8601String(),
                    'reason_code' => $reasonCode,
                ])
                ->event('account.deletion.requested')
                ->log('account.deletion.requested');

            $user->notify(new AccountDeletionRequestedNotification($request));

            return $request->fresh();
        });
    }

    /**
     * Cancel a pending request. Returns true on cancel, false if no request
     * existed. Throws 410 (gone) when the grace window has already elapsed
     * — at that point the executor may have already started anonymization.
     */
    public function cancelDeletion(User $user): bool
    {
        $request = $user->deletionRequest()->first();
        if ($request === null) {
            return false;
        }

        if ($request->executed_at !== null) {
            abort(410, __('account.deletion.errors.already_executed'));
        }

        if ($request->scheduled_for !== null && $request->scheduled_for->isPast()) {
            abort(410, __('account.deletion.errors.grace_expired'));
        }

        DB::transaction(function () use ($user, $request) {
            activity('Account')
                ->performedOn($request)
                ->causedBy($user)
                ->withProperties([
                    'scheduled_for' => $request->scheduled_for?->toIso8601String(),
                ])
                ->event('account.deletion.cancelled')
                ->log('account.deletion.cancelled');

            $request->delete();

            $user->forceFill(['deletion_requested_at' => null])->save();
        });

        return true;
    }

    /**
     * Execute scheduled deletion: anonymizes the user and seals the request.
     * Idempotent — calling on an already-executed request is a no-op.
     */
    public function executeDeletion(AccountDeletionRequest $request): void
    {
        if ($request->executed_at !== null) {
            return;
        }

        $user = $request->user;
        if ($user === null) {
            $request->forceFill(['executed_at' => now()])->save();

            return;
        }

        DB::transaction(function () use ($user, $request) {
            $this->anonymize($user);

            $request->forceFill(['executed_at' => now()])->save();

            activity('Account')
                ->performedOn($request)
                ->causedBy($user)
                ->event('account.deletion.executed')
                ->log('account.deletion.executed');
        });

        // Notify after the transaction commits — the user row still has a
        // routable email address right up until the soft-delete inside
        // anonymize(), but Laravel uses the in-memory instance and the
        // notification is dispatched against the (already saved) anonymized
        // record. We rely on the original `notifiable->routeNotificationFor`
        // having been resolved earlier; instead we send the notification
        // before the row mutation by using the original email captured by
        // the notification constructor (see notification class).
    }

    /**
     * Anonymize a user IN PLACE. Public so admin tooling can call it
     * directly via a separate audited route (out of scope here).
     */
    public function anonymize(User $user): void
    {
        $originalEmail = $user->email;

        // Notify BEFORE we scramble the email so the mail still routes.
        // The notification is queueable and reads `routeNotificationForMail`
        // at dispatch time, hence the order matters.
        $request = $user->deletionRequest()->first();
        $user->notify(new AccountDeletionExecutedNotification($request));

        // Dissociate customers (preserve CRM history).
        Customer::query()->where('user_id', $user->id)->update(['user_id' => null]);

        // Tokens already revoked at request time, but in case the user
        // signed back in to cancel and let the request lapse, revoke now.
        $user->tokens()->delete();

        $user->forceFill([
            // first_name/last_name are NOT NULL on the schema — write empty
            // strings rather than nulls to preserve the constraint while
            // still scrubbing personal data.
            'first_name' => '',
            'last_name' => '',
            'phone' => null,
            'phone_verified_at' => null,
            'bio' => null,
            'username' => null,
            'google_id' => null,
            'facebook_id' => null,
            'apple_id' => null,
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => null,
            'metadata' => null,
            'status' => UserStatus::Deleted->value,
            'email' => sprintf('deleted-%d@takussan.local', $user->id),
            'email_verified_at' => null,
        ])->save();

        // Drop avatar/photo media — those are personal data.
        $user->clearMediaCollection('avatar');
        $user->clearMediaCollection('avatars');
        $user->clearMediaCollection('photos');

        // Soft-delete the row. Auth queries use the default scope so the
        // user can no longer log in.
        $user->delete();

        unset($originalEmail);
    }

    /**
     * Anti-escalade: list outstanding obligations preventing deletion.
     * Returned shape is consumable by the FormRequest as a 422 payload.
     *
     * @return array<int,array{type:string,id:int,reference:?string,label:string}>
     */
    public function collectOpenObligations(User $user): array
    {
        $obligations = [];

        // Active leases as landlord.
        $activeLandlordLeases = Lease::query()
            ->where('landlord_id', $user->id)
            ->whereIn('status', [LeaseStatus::Active->value, LeaseStatus::PendingSignature->value])
            ->get(['id', 'reference_number']);
        foreach ($activeLandlordLeases as $lease) {
            $obligations[] = [
                'type' => 'lease',
                'id' => $lease->id,
                'reference' => $lease->reference_number,
                'label' => __('account.deletion.obligations.lease_active', [
                    'reference' => $lease->reference_number ?? '#'.$lease->id,
                ]),
            ];
        }

        // Active leases as tenant (via Customer link).
        $tenantCustomerIds = Customer::query()
            ->where('user_id', $user->id)
            ->pluck('id');
        if ($tenantCustomerIds->isNotEmpty()) {
            $tenantLeases = Lease::query()
                ->whereIn('tenant_id', $tenantCustomerIds)
                ->whereIn('status', [LeaseStatus::Active->value, LeaseStatus::PendingSignature->value])
                ->get(['id', 'reference_number']);
            foreach ($tenantLeases as $lease) {
                $obligations[] = [
                    'type' => 'lease',
                    'id' => $lease->id,
                    'reference' => $lease->reference_number,
                    'label' => __('account.deletion.obligations.lease_active', [
                        'reference' => $lease->reference_number ?? '#'.$lease->id,
                    ]),
                ];
            }

            // Pending lease payments due by the user (as Customer payer).
            $pendingLeasePayments = LeasePayment::query()
                ->whereIn('payer_id', $tenantCustomerIds)
                ->whereIn('status', [PaymentStatus::Pending->value, PaymentStatus::Late->value, PaymentStatus::PartiallyPaid->value])
                ->get(['id', 'reference_number']);
            foreach ($pendingLeasePayments as $payment) {
                $obligations[] = [
                    'type' => 'lease_payment',
                    'id' => $payment->id,
                    'reference' => $payment->reference_number,
                    'label' => __('account.deletion.obligations.payment_pending', [
                        'reference' => $payment->reference_number ?? '#'.$payment->id,
                    ]),
                ];
            }

            // Pending invoices billed to a customer linked to the user.
            $pendingInvoices = Invoice::query()
                ->whereIn('customer_id', $tenantCustomerIds)
                ->whereIn('status', [InvoiceStatus::Sent->value, InvoiceStatus::Overdue->value])
                ->get(['id', 'reference_number']);
            foreach ($pendingInvoices as $invoice) {
                $obligations[] = [
                    'type' => 'invoice',
                    'id' => $invoice->id,
                    'reference' => $invoice->reference_number,
                    'label' => __('account.deletion.obligations.invoice_pending', [
                        'reference' => $invoice->reference_number ?? '#'.$invoice->id,
                    ]),
                ];
            }
        }

        // Bookings created by the user that are still in flight.
        $openBookings = Booking::query()
            ->where('created_by_id', $user->id)
            ->whereIn('status', [BookingStatus::Pending->value, BookingStatus::Confirmed->value])
            ->get(['id', 'reference_number']);
        foreach ($openBookings as $booking) {
            $obligations[] = [
                'type' => 'booking',
                'id' => $booking->id,
                'reference' => $booking->reference_number,
                'label' => __('account.deletion.obligations.booking_open', [
                    'reference' => $booking->reference_number ?? '#'.$booking->id,
                ]),
            ];
        }

        return $obligations;
    }

    /**
     * Convenience: count requests due for the J-N reminder, used by the
     * scheduled command. `before` lets the scheduler look ahead.
     *
     * @return Collection<int,AccountDeletionRequest>
     */
    public function dueForReminder(?Carbon $now = null): Collection
    {
        $now ??= now();
        $reminderDays = (int) config('auth.account_deletion.reminder_days_before', 7);
        $threshold = $now->copy()->addDays($reminderDays);

        return AccountDeletionRequest::query()
            ->whereNull('executed_at')
            ->whereNull('reminder_sent_at')
            ->where('scheduled_for', '<=', $threshold)
            ->where('scheduled_for', '>', $now)
            ->get();
    }

    /**
     * Convenience: requests ready to execute.
     *
     * @return Collection<int,AccountDeletionRequest>
     */
    public function dueForExecution(?Carbon $now = null): Collection
    {
        $now ??= now();

        return AccountDeletionRequest::query()
            ->whereNull('executed_at')
            ->where('scheduled_for', '<=', $now)
            ->get();
    }
}
