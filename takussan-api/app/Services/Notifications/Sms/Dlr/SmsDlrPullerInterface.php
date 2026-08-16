<?php

namespace App\Services\Notifications\Sms\Dlr;

use App\Services\Notifications\Sms\SmsDriverInterface;

/**
 * TCK-294 — Common contract for every DLR/MO *pulling* driver, mirroring
 * {@see SmsDriverInterface} on the outbound side: one interface, N drivers, one conditional binding in
 * `AppServiceProvider` keyed on `sms.dlr_pulling.driver`.
 *
 * Only Mtarget offers a pulling API today (Orange's answer is HTTPS +
 * IP allowlist — ardoise D-49), so the registry holds `mtarget` and the
 * inert `log`. The interface exists so the second operator to offer one
 * plugs in here instead of growing a parallel path.
 */
interface SmsDlrPullerInterface
{
    /**
     * Stable identifier — used in logs and to key the registry.
     */
    public function id(): string;

    /**
     * Drain ONE page of the operator's queue.
     *
     * Implementations must treat the call as destructive: a successful
     * response consumes the records it returns, so the caller applies
     * them immediately rather than accumulating pages.
     *
     * @param  array<string,mixed>  $context  `agency_id` selects whose Integration to use
     * @param  int  $max  page size requested from the operator
     */
    public function pull(array $context = [], int $max = 50): SmsDlrBatch;
}
