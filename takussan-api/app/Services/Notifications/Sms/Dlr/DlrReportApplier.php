<?php

namespace App\Services\Notifications\Sms\Dlr;

use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Support\Facades\Log;

/**
 * TCK-294 — Apply one pulled {@see SmsDlrRecord} to the delivery attempt
 * it names. **This class is where idempotence lives.**
 *
 * Mtarget's pulling read is destructive: a successful call empties the
 * queue it returns, so there is no replayable "same window" on the read
 * side. Re-running the command therefore cannot be made safe by the
 * transport — it is made safe here, by three properties:
 *
 *  1. we only ever UPDATE a row matched on `(provider, provider_message_id)`,
 *     never insert one — so no report can create a duplicate attempt;
 *  2. {@see DeliveryAttemptUpdater} returns early when the status is
 *     already the one being written — so re-applying is a no-op, and no
 *     model event fires a second time;
 *  3. intermediate codes (0/1/2) are never written, and a status
 *     precedence blocks any regression — so a report drained out of order
 *     cannot walk a `delivered` attempt backwards.
 */
class DlrReportApplier
{
    public const OUTCOME_APPLIED = 'applied';

    public const OUTCOME_UNMATCHED = 'unmatched';

    public const OUTCOME_MOBILE_ORIGINATED = 'mobile_originated';

    public const OUTCOME_INTERMEDIATE = 'intermediate';

    public const OUTCOME_UNKNOWN_STATUS = 'unknown_status';

    public function __construct(private readonly DeliveryAttemptUpdater $updater) {}

    /**
     * Mtarget DLR codes, from the operator's API documentation:
     * 0 waiting · 1 in progress · 2 sent to operator · 3 delivered ·
     * 4 refused · 6 not delivered. (5 is an MO on the pulling queue.)
     *
     * Only the terminal codes are written. 0/1/2 describe a message still
     * on its way — writing them would overwrite nothing useful and would
     * risk clobbering a terminal status drained out of order.
     */
    private const TERMINAL_STATUSES = [
        3 => SmsResult::STATUS_DELIVERED,
        4 => SmsResult::STATUS_FAILED,
        6 => SmsResult::STATUS_FAILED,
    ];

    private const INTERMEDIATE_STATUSES = [0, 1, 2];

    /**
     * @return self::OUTCOME_*
     */
    public function apply(string $provider, SmsDlrRecord $record): string
    {
        if ($record->isMobileOriginated()) {
            return self::OUTCOME_MOBILE_ORIGINATED;
        }
        if ($record->statusCode !== null && in_array($record->statusCode, self::INTERMEDIATE_STATUSES, true)) {
            return self::OUTCOME_INTERMEDIATE;
        }
        $newStatus = self::TERMINAL_STATUSES[$record->statusCode] ?? null;
        if ($newStatus === null) {
            Log::warning('[sms.mtarget.pull] unknown delivery status code', [
                'provider' => $provider,
                'status' => $record->statusCode,
                'record' => $record->raw,
            ]);

            return self::OUTCOME_UNKNOWN_STATUS;
        }

        $deliveredAt = $newStatus === SmsResult::STATUS_DELIVERED ? now() : null;
        $failureReason = $newStatus === SmsResult::STATUS_FAILED
            ? ($record->statusText !== null && $record->statusText !== '' ? $record->statusText : 'mtarget_status_'.$record->statusCode)
            : null;

        foreach (MtargetTicketMatcher::candidates($record->ticket, $record->msisdn) as $candidate) {
            $updated = $this->updater->applyStatus(
                provider: $provider,
                providerMessageId: $candidate,
                newStatus: $newStatus,
                failureReason: $failureReason,
                deliveredAt: $deliveredAt,
                // Same ordering as the WhatsApp DLR consumer: a report
                // drained after a later one must never regress the row.
                statusPrecedence: [
                    SmsResult::STATUS_SENT,
                    SmsResult::STATUS_DELIVERED,
                    SmsResult::STATUS_FAILED,
                ],
            );
            if ($updated) {
                return self::OUTCOME_APPLIED;
            }
        }

        // The queue is drained by the read: an unmatched report is gone
        // from the operator's side. It must leave a trace, or a systematic
        // matching bug would be invisible.
        Log::warning('[sms.mtarget.pull] delivery report matched no attempt', [
            'provider' => $provider,
            'ticket' => $record->ticket,
            'msisdn' => $record->msisdn,
        ]);

        return self::OUTCOME_UNMATCHED;
    }
}
