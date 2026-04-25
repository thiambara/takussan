<?php

namespace App\Jobs\Invoice;

use App\Services\Invoice\OverdueReminderService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-092 — Daily sweep dispatching overdue-invoice reminders one per
 * configured offset (default 3 / 7 / 15 days past `due_date`).
 *
 * Per-agency fan-out: the service is called once per agency bucket so
 * the chunk-based queries stay tenant-scoped and cannot leak invoices
 * across agencies. The `null` bucket covers platform-issued invoices
 * with no agency.
 */
class SendOverdueRemindersJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(OverdueReminderService $service): int
    {
        $now = now();
        $sent = 0;

        $agencies = $service->agenciesWithRemindableInvoices($now);

        foreach ($agencies as $agencyId) {
            $sent += $service->sendForAgency($agencyId, $now);
        }

        return $sent;
    }
}
