<?php

namespace App\Services\Invoice;

use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Services\Admin\PlatformSettingService;
use App\Support\ScopedSetting;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-092 — Picks the overdue invoices that match a configured offset
 * (`invoice.reminder_offsets_days`, default `[3, 7, 15]`) and dispatches
 * a single reminder per (invoice, offset) pair. TCK-739 — an offset missed on
 * its day is still sent up to `CATCH_UP_DAYS` later, once.
 *
 * Idempotence has two complementary guards:
 *
 *   - `reminders_sent_count`: the count is incremented only when the offset
 *     bucket actually changes, so a same-day re-run finds the count already
 *     past the matched bucket and skips silently.
 *   - `last_reminder_sent_at::date`: a fallback that catches the rare case
 *     where the count column is in sync but the calendar day matches the
 *     last-sent date (defensive against double-fires across rolling job
 *     workers).
 */
class OverdueReminderService
{
    public const SETTING_KEY = 'invoice.reminder_offsets_days';

    /** @var list<int> */
    public const DEFAULT_OFFSETS = [3, 7, 15];

    /**
     * TCK-739 (P05.02) — un jalon manqué (job arrêté le jour prévu) part encore jusqu'à ce nombre
     * de jours après, une seule fois. Au-delà, il est perdu.
     */
    public const CATCH_UP_DAYS = 3;

    /**
     * Statuses that legitimately get reminders. The spec text says
     * "pending|partial" but the actual `InvoiceStatus` enum has no such
     * cases — `Sent` (issued, awaiting payment) and `Overdue` (past due
     * with prior tracking) are the natural equivalents and align with
     * what the legacy job handled.
     *
     * @var list<InvoiceStatus>
     */
    public const REMINDABLE_STATUSES = [
        InvoiceStatus::Sent,
        InvoiceStatus::Overdue,
    ];

    /**
     * @return list<int>
     */
    public function offsets(?int $agencyId = null): array
    {
        // TCK-600 (verif-600 H1) — le réglage de l'agence, sinon le global, sinon le défaut.
        // TCK-651 (ADR-0065) — le global et le défaut viennent du catalogue.
        $value = ScopedSetting::agencyRow(self::SETTING_KEY, $agencyId)?->value
            ?? app(PlatformSettingService::class)->getValue('invoice.reminder_offsets_days');
        if (is_array($value) && array_key_exists('value', $value)) {
            $value = $value['value'];
        }

        if (! is_array($value)) {
            return self::DEFAULT_OFFSETS;
        }

        $clean = array_values(array_filter(array_map(
            static fn ($v) => is_numeric($v) ? (int) $v : null,
            $value,
        ), static fn (?int $v) => $v !== null && $v > 0));

        sort($clean);

        return $clean === [] ? self::DEFAULT_OFFSETS : $clean;
    }

    /**
     * Iterate every eligible invoice for the given agency and process it
     * via {@see processOne()}. Returns the count of reminders actually
     * dispatched (i.e. excluding skipped ones). The agency filter is
     * applied at the SQL layer to avoid leaking across tenants.
     */
    public function sendForAgency(?int $agencyId, ?CarbonInterface $now = null): int
    {
        $now = $now ? Carbon::instance($now) : now();
        $offsets = $this->offsets($agencyId);
        $sent = 0;

        $this->candidateQuery($agencyId, $offsets, $now)
            ->chunkById(200, function ($chunk) use ($offsets, $now, &$sent): void {
                foreach ($chunk as $invoice) {
                    if ($this->processOne($invoice, $offsets, $now)) {
                        $sent++;
                    }
                }
            });

        return $sent;
    }

    /**
     * Decide whether the invoice matches an offset *right now* and
     * dispatch the reminder if so. Returns true when a reminder was
     * actually sent (false on skip / opt-out / cap).
     *
     * The state mutation is wrapped in `DB::transaction` + `lockForUpdate`
     * to close a race where two workers (or a cron + manual call) both
     * observe `reminders_sent_count = 0` and both increment + dispatch.
     * The lock is released as soon as the row is stamped; the queued
     * notification is sent outside the transaction so the queue dispatch
     * never holds the row.
     *
     * @param  list<int>  $offsets
     */
    public function processOne(Invoice $invoice, array $offsets, CarbonInterface $now): bool
    {
        if (! in_array($invoice->status, self::REMINDABLE_STATUSES, true)) {
            return false;
        }

        if ($invoice->due_date === null) {
            return false;
        }

        $today = Carbon::instance($now)->startOfDay();
        $due = Carbon::parse($invoice->due_date)->startOfDay();
        $daysOverdue = (int) $due->diffInDays($today, false);

        // TCK-739 — le jalon le plus tardif dont la fenêtre [offset, offset + CATCH_UP_DAYS]
        // contient aujourd'hui.
        $offset = null;
        foreach ($offsets as $candidate) {
            if ($daysOverdue >= $candidate && $daysOverdue - $candidate <= self::CATCH_UP_DAYS) {
                $offset = $candidate;
            }
        }
        if ($daysOverdue <= 0 || $offset === null) {
            return false;
        }

        $cap = count($offsets);
        $expectedBucket = array_search($offset, $offsets, true) + 1;
        $milestoneDay = $due->copy()->addDays($offset);

        $recipient = DB::transaction(function () use ($invoice, $now, $today, $daysOverdue, $cap, $expectedBucket, $milestoneDay) {
            // Re-read the row under a lock so we observe the freshest
            // state — another worker may have just stamped it.
            $fresh = Invoice::query()->lockForUpdate()->find($invoice->id);
            if ($fresh === null) {
                return null;
            }

            if (! in_array($fresh->status, self::REMINDABLE_STATUSES, true)) {
                return null;
            }

            $alreadySent = (int) ($fresh->reminders_sent_count ?? 0);
            if ($alreadySent >= $cap) {
                return null;
            }

            // Fallback intra-day idempotence: if a reminder has already been
            // sent today (any offset), do not send a second one.
            if ($fresh->last_reminder_sent_at !== null
                && Carbon::parse($fresh->last_reminder_sent_at)->isSameDay($today)
            ) {
                return null;
            }

            // TCK-739 — un envoi par jalon : une relance partie depuis le jour prévu de ce jalon
            // l'a servi. Le compteur seul ne suffit pas quand un jalon antérieur a été perdu.
            if ($fresh->last_reminder_sent_at !== null
                && Carbon::parse($fresh->last_reminder_sent_at)->startOfDay()->gte($milestoneDay)
            ) {
                return null;
            }

            if ($alreadySent >= $expectedBucket) {
                // Already crossed this offset bucket — typical when the job
                // missed a day and now sees a later offset (we still send the
                // current one but never resend a prior one).
                return null;
            }

            // The chunk query already eager-loaded `customer.user`; reuse
            // it instead of triggering an extra select inside the lock.
            $recipient = $invoice->customer?->user;

            // Always record the attempt: even if the recipient opted out
            // (or has no User account), the audit log has to reflect that
            // we tried — that's the spec's "tentée" semantics.
            $fresh->forceFill([
                'last_reminder_sent_at' => $now,
                'reminders_sent_count' => $alreadySent + 1,
                // Promote `Sent` → `Overdue` lazily here, mirroring what the
                // legacy job did, but only after the first reminder fires so
                // we don't pre-emptively flip status before any user-visible
                // signal. Subsequent reminders keep the row in `Overdue`.
                'status' => InvoiceStatus::Overdue,
            ])->save();

            activity('Invoice')
                ->performedOn($fresh)
                ->withProperties([
                    'offset_days' => $daysOverdue,
                    'recipient_email' => $recipient?->email,
                    'channel' => $recipient ? 'email_inapp' : 'audit_only',
                ])
                ->event('invoice_reminder_sent')
                ->log('invoice_reminder_sent');

            // Refresh the chunk-fed instance so callers see the new
            // counters / status without re-querying.
            $invoice->setRawAttributes($fresh->getAttributes(), true);

            return $recipient;
        });

        if ($recipient === null) {
            return false;
        }

        Notification::send($recipient, new InvoiceOverdueReminderNotification($invoice, $daysOverdue));

        return true;
    }

    /**
     * Distinct agency IDs that currently have at least one remindable
     * invoice. Includes the `null` agency bucket (invoices not attached
     * to any agency, typically platform-issued ones).
     *
     * @return list<int|null>
     */
    public function agenciesWithRemindableInvoices(?CarbonInterface $now = null): array
    {
        $now = $now ? Carbon::instance($now) : now();
        // TCK-600 (verif-600 H1) — balayage de TOUTES les agences : chaque échéance que l'une
        // d'elles retient compte, sans quoi une agence aux échéances propres n'y figurerait jamais.
        $offsets = $this->offsets();
        foreach (ScopedSetting::agencyRows(self::SETTING_KEY) as $ligne) {
            $offsets = array_merge($offsets, $this->offsets((int) $ligne->scope_id));
        }
        $offsets = array_values(array_unique($offsets));

        return $this->candidateQuery(null, $offsets, $now, withAgencyFilter: false)
            ->reorder()
            ->select('agency_id')
            ->distinct()
            ->pluck('agency_id')
            ->all();
    }

    /**
     * @param  list<int>  $offsets
     */
    protected function candidateQuery(
        ?int $agencyId,
        array $offsets,
        CarbonInterface $now,
        bool $withAgencyFilter = true,
    ): Builder {
        $today = Carbon::instance($now)->startOfDay();

        // TCK-739 — une fenêtre par jalon : due_date ∈ [today - offset - CATCH_UP_DAYS,
        // today - offset]. `whereDate` is used (instead of plain comparisons) because the
        // underlying column may serialize a `date` cast as `Y-m-d H:i:s`. (This line named
        // "SQLite/MySQL" until 2026-08-22; both were retired by ADR-0020,
        // and the reason is a property of the CAST, not of the engine.)
        $windows = array_map(
            static fn (int $offset) => [
                $today->copy()->subDays($offset + self::CATCH_UP_DAYS)->toDateString(),
                $today->copy()->subDays($offset)->toDateString(),
            ],
            $offsets,
        );

        $query = Invoice::query()
            ->with('customer.user')
            ->whereIn('status', array_map(static fn (InvoiceStatus $s) => $s->value, self::REMINDABLE_STATUSES))
            ->where(function ($q) use ($windows): void {
                foreach ($windows as [$from, $to]) {
                    $q->orWhere(fn ($w) => $w->whereDate('due_date', '>=', $from)->whereDate('due_date', '<=', $to));
                }
            });

        if ($withAgencyFilter) {
            if ($agencyId === null) {
                $query->whereNull('agency_id');
            } else {
                $query->where('agency_id', $agencyId);
            }
        }

        return $query->orderBy('id');
    }
}
