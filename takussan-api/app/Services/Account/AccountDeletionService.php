<?php

namespace App\Services\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Activity;
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
use App\Models\NotificationDeliveryAttempt;
use App\Models\PropertyVisit;
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
     * tokens.
     *
     * Caller is responsible for the step-up proof *before* invoking the
     * service — `RequestAccountDeletionRequest` handles it. Since TCK-272
     * that proof is one of TWO modes, and the caller passes which one it
     * validated so the audit trail records it:
     * `password` (historical) or `email_code` (accounts whose stored hash is
     * a machine value and who could not delete their account at all before).
     *
     * TCK-600 — un OPÉRATEUR (`super_admin`) peut la demander pour le compte : même service, mêmes
     * obligations, même délai de grâce — `$operator` devient le causeur de l'activité et le step-up
     * est le sien (`operator`). L'effacement opérateur n'a pas d'autre chemin.
     *
     * @param  string  $stepUp  mode de step-up déjà vérifié par l'appelant
     *
     * @throws ValidationException 422 with `obligations` payload listing
     *                             leases/payments still pending
     */
    public function requestDeletion(
        User $user,
        ?string $reason = null,
        ?string $reasonCode = null,
        string $stepUp = 'password',
        ?User $operator = null,
    ): AccountDeletionRequest {
        $obligations = $this->collectOpenObligations($user);
        if ($obligations !== []) {
            throw ValidationException::withMessages([
                'obligations' => [__('account.deletion.errors.has_obligations')],
            ])->status(422);
        }

        return DB::transaction(function () use ($user, $reason, $reasonCode, $stepUp, $operator) {
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
                ->causedBy($operator ?? $user)
                ->withProperties([
                    'scheduled_for' => $scheduledFor->toIso8601String(),
                    'reason_code' => $reasonCode,
                    // TCK-272 — quel step-up a réellement ouvert la porte.
                    'step_up' => $stepUp,
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
            abort_code(410, 'account_deletion.already_executed');
        }

        if ($request->scheduled_for !== null && $request->scheduled_for->isPast()) {
            abort_code(410, 'account_deletion.grace_expired');
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
     *
     * TCK-885 — `$notifier: false` pour un REJEU après une restauration
     * (`account:list-erasures --execute`) : le titulaire a déjà reçu le courriel de l'effacement
     * d'origine, il n'en reçoit pas un second.
     */
    public function executeDeletion(AccountDeletionRequest $request, bool $notifier = true): void
    {
        if ($request->executed_at !== null) {
            return;
        }

        $user = $request->user;
        if ($user === null) {
            $request->forceFill(['executed_at' => now()])->save();

            return;
        }

        // TCK-885 (ADR-0044, amendement du 2026-10-18, § B) — la trace HORS de la base, que la
        // procédure « Après une restauration » relit. Écrite AVANT l'effacement, jamais après son
        // commit : si le disque refuse, l'exception sort avant que rien ne soit fait — ni courriel
        // (il part en synchrone depuis `anonymize()`), ni anonymisation, `executed_at` reste nul —
        // et le passage suivant de `account:execute-deletions` retente (journal + sortie en 1,
        // TCK-741). L'ordre inverse pourrait sceller un effacement sans trace : précisément le
        // compte qu'une restauration ramènerait sans que personne le sache. L'écart qui reste est
        // un objet sans effacement, si la transaction échoue ensuite : la demande est échue, elle
        // sera exécutée au passage suivant, et le rejeu après restauration est idempotent.
        $instant = now();
        app(ErasureLedger::class)->record($user->id, $instant);

        DB::transaction(function () use ($user, $request, $notifier, $instant) {
            $depublies = $this->anonymize($user, $notifier);

            $request->forceFill(['executed_at' => $instant])->save();

            activity('Account')
                ->performedOn($request)
                ->causedBy($user)
                // TCK-600 — les biens retirés du site faute de contact (`ErasedAccountListings`).
                ->withProperties(['unpublished_property_ids' => $depublies])
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
     *
     * @param  bool  $notifier  TCK-885 — `false` pour un rejeu après une restauration
     * @return list<int> TCK-600 — les biens dépubliés faute de contact
     */
    public function anonymize(User $user, bool $notifier = true): array
    {
        $originalEmail = $user->email;
        // TCK-1013 (P57.01) — relevés avant le `forceFill`, qui les efface.
        $originalPhones = $this->phoneVariants([$user->phone, $user->secondary_phone]);

        // Notify BEFORE we scramble the email so the mail still routes.
        // The notification is queueable and reads `routeNotificationForMail`
        // at dispatch time, hence the order matters.
        if ($notifier) {
            $request = $user->deletionRequest()->first();
            $user->notify(new AccountDeletionExecutedNotification($request));
        }

        // Dissociate customers (preserve CRM history).
        Customer::query()->where('user_id', $user->id)->update(['user_id' => null]);

        // TCK-1014 (P57.02) — de même pour les visites demandées en étant connecté : le compte
        // n'étant que soft-deleted, la FK `visitor_id` en `nullOnDelete` ne joue pas. Le contact
        // de la visite (`visitor_name`, `visitor_email`, `visitor_phone`) reste à l'agence
        // (décision du porteur, 2026-10-19).
        PropertyVisit::query()->where('visitor_id', $user->id)->update(['visitor_id' => null]);

        // Tokens already revoked at request time, but in case the user
        // signed back in to cancel and let the request lapse, revoke now.
        $user->tokens()->delete();

        // TCK-688 (P19.01) — anonymiser sans journaliser : `User` journalise `email`, `phone`, les
        // noms et `username` en `logOnlyDirty()`, et la ligne `updated` recopierait l'identité
        // d'origine sous `attribute_changes.old`. La trace de l'effacement est la ligne
        // `account.deletion.executed`, sans diff, écrite par `executeDeletion()`.
        $user->disableLogging();

        $user->forceFill([
            // first_name/last_name are NOT NULL on the schema — write empty
            // strings rather than nulls to preserve the constraint while
            // still scrubbing personal data.
            'first_name' => '',
            'last_name' => '',
            'phone' => null,
            'phone_verified_at' => null,
            // TCK-633 (lot C) — le second numéro et les cases WhatsApp sont des données
            // personnelles au même titre que `phone`. `terms_accepted_at` / `terms_version`
            // restent : la trace datée d'un consentement, qui n'identifie personne.
            'phone_whatsapp' => null,
            'secondary_phone' => null,
            'secondary_phone_verified_at' => null,
            'secondary_phone_whatsapp' => false,
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

        $user->enableLogging();

        // TCK-688 (P19.01) — les lignes déjà écrites sur ce compte (création, modifications)
        // portent ses valeurs d'origine dans leur diff : il est effacé, la ligne reste.
        Activity::query()
            ->where('subject_type', $user->getMorphClass())
            ->where('subject_id', $user->getKey())
            ->whereNotNull('attribute_changes')
            ->update(['attribute_changes' => null]);

        // TCK-691 (P19.02) — chaque envoi SMS ou WhatsApp garde le numéro du destinataire dans
        // `notification_delivery_attempts.to`. Le compte n'étant que soft-deleted, la FK en
        // `cascadeOnDelete` ne joue pas : le numéro est effacé, la tentative reste.
        NotificationDeliveryAttempt::query()
            ->whereIn('app_notification_id', $user->appNotifications()->select('id'))
            ->whereNotNull('to')
            ->update(['to' => null]);

        // TCK-1013 (P57.01) — depuis TCK-799, un SMS envoyé sans notification (code de
        // vérification, step-up, signature de bail) écrit sa tentative sans `app_notification_id` :
        // le filtre ci-dessus ne la voit pas. Elle se retrouve par le numéro, ceux du compte au
        // moment de l'effacement ; un ancien numéro remplacé n'y figure plus (décision du porteur :
        // ni migration ni colonne `user_id`).
        if ($originalPhones !== []) {
            NotificationDeliveryAttempt::query()
                ->whereNull('app_notification_id')
                ->whereIn('to', $originalPhones)
                ->update(['to' => null]);
        }

        unset($originalEmail);

        // TCK-600 — APRÈS le `delete()` : avant, `owner` et `collaborators.user` résolvent encore
        // le compte, qui resterait le contact de ses biens (`ErasedAccountListings`).
        return app(ErasedAccountListings::class)->handle($user);
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
            // TCK-595 (H-2) — une restitution de caution en attente est due AU locataire, pas par lui :
            // elle ne bloque pas la suppression de son compte.
            $pendingLeasePayments = LeasePayment::query()
                ->whereIn('payer_id', $tenantCustomerIds)
                ->whereIn('status', [PaymentStatus::Pending->value, PaymentStatus::Late->value, PaymentStatus::PartiallyPaid->value])
                ->exceptDepositRefunds()
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

        // TCK-741 — la plus ancienne échéance d'abord : l'ordre ne dépend plus du moteur.
        return AccountDeletionRequest::query()
            ->whereNull('executed_at')
            ->where('scheduled_for', '<=', $now)
            ->orderBy('scheduled_for')
            ->orderBy('id')
            ->get();
    }

    /**
     * TCK-1013 — les numéros du compte, tels qu'enregistrés et sans espaces : le routeur SMS
     * écrit `to` normalisé par `PhoneNumber::normalize()`, qui ne retire que les espaces.
     *
     * @param  list<?string>  $phones
     * @return list<string>
     */
    private function phoneVariants(array $phones): array
    {
        $variants = [];
        foreach ($phones as $phone) {
            if ($phone === null || trim($phone) === '') {
                continue;
            }
            $variants[] = $phone;
            $variants[] = preg_replace('/\s+/', '', $phone) ?? $phone;
        }

        return array_values(array_unique($variants));
    }
}
