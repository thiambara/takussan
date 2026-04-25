<?php

namespace App\Services\Invoice;

use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\Setting;
use App\Notifications\InvoiceOverdueReminderNotification;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-092 — Picks the overdue invoices that match a configured offset
 * (`invoice.reminder_offsets_days`, default `[3, 7, 15]`) and dispatches
 * a single reminder per (invoice, offset) pair.
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
    public function offsets(): array
    {
        $row = Setting::query()->where('key', self::SETTING_KEY)->first();
        if ($row === null) {
            return self::DEFAULT_OFFSETS;
        }

        $value = $row->value;
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
        $offsets = $this->offsets();
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

        $cap = count($offsets);
        if ((int) ($invoice->reminders_sent_count ?? 0) >= $cap) {
            return false;
        }

        $today = Carbon::instance($now)->startOfDay();
        $due = Carbon::parse($invoice->due_date)->startOfDay();
        $daysOverdue = (int) $due->diffInDays($today, false);

        if ($daysOverdue <= 0 || ! in_array($daysOverdue, $offsets, true)) {
            return false;
        }

        // Fallback intra-day idempotence: if a reminder has already been
        // sent today (any offset), do not send a second one. This catches
        // races across overlapping cron runs even if the count column is
        // momentarily inconsistent.
        if ($invoice->last_reminder_sent_at !== null
            && Carbon::parse($invoice->last_reminder_sent_at)->isSameDay($today)
        ) {
            return false;
        }

        $expectedBucket = array_search($daysOverdue, $offsets, true) + 1;
        $alreadySent = (int) ($invoice->reminders_sent_count ?? 0);
        if ($alreadySent >= $expectedBucket) {
            // Already crossed this offset bucket — typical when the job
            // missed a day and now sees a later offset (we still send the
            // current one but never resend a prior one).
            return false;
        }

        $recipient = $invoice->customer?->user;

        // Always record the attempt: even if the recipient opted out
        // (or has no User account), the audit log has to reflect that
        // we tried — that's the spec's "tentée" semantics.
        $invoice->forceFill([
            'last_reminder_sent_at' => $now,
            'reminders_sent_count' => $alreadySent + 1,
            // Promote `Sent` → `Overdue` lazily here, mirroring what the
            // legacy job did, but only after the first reminder fires so
            // we don't pre-emptively flip status before any user-visible
            // signal. Subsequent reminders keep the row in `Overdue`.
            'status' => InvoiceStatus::Overdue,
        ])->save();

        activity('Invoice')
            ->performedOn($invoice)
            ->withProperties([
                'offset_days' => $daysOverdue,
                'recipient_email' => $recipient?->email,
                'channel' => $recipient ? 'email_inapp' : 'audit_only',
            ])
            ->event('invoice_reminder_sent')
            ->log('invoice_reminder_sent');

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
        $offsets = $this->offsets();

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

        // The exact-day matrix: due_date == today - offset_n for any n.
        // `whereDate` is used (instead of plain `whereIn`) because the
        // underlying SQLite/MySQL column may serialize a `date` cast as
        // `Y-m-d H:i:s`, which would never match a bare `Y-m-d` literal.
        $eligibleDates = array_map(
            static fn (int $offset) => $today->copy()->subDays($offset)->toDateString(),
            $offsets,
        );

        $query = Invoice::query()
            ->with('customer.user')
            ->whereIn('status', array_map(static fn (InvoiceStatus $s) => $s->value, self::REMINDABLE_STATUSES))
            ->where(function ($q) use ($eligibleDates): void {
                foreach ($eligibleDates as $date) {
                    $q->orWhereDate('due_date', $date);
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
