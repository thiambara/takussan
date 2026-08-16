<?php

namespace App\Services\Notifications\Sms\Dlr;

/**
 * TCK-294 — One record drained from an operator's DLR/MO queue.
 *
 * Deliberately provider-neutral: the transport (which is operator
 * specific and, for Mtarget, only partly documented) normalises into this
 * shape, and {@see DlrReportApplier} — the part we fully control — works
 * on nothing else.
 */
final class SmsDlrRecord
{
    /**
     * @param  string  $ticket  operator-side message id (Mtarget: `ticket`, aka `MsgId`)
     * @param  string  $msisdn  recipient, digits or E.164; '' when the operator omits it
     * @param  int|null  $statusCode  raw operator status code, null when unparseable
     * @param  array<string,mixed>  $raw  the untouched record, for logs
     */
    public function __construct(
        public readonly string $ticket,
        public readonly string $msisdn,
        public readonly ?int $statusCode,
        public readonly ?string $statusText = null,
        public readonly array $raw = [],
    ) {}

    /**
     * Mtarget multiplexes MO (inbound SMS) and DLR on the same queue and
     * distinguishes them by `Status`: 5 is an MO, every other value is a
     * delivery report. Applying an MO as a DLR would rewrite the status of
     * whatever message the subscriber replied to.
     */
    public function isMobileOriginated(): bool
    {
        return $this->statusCode === 5;
    }
}
