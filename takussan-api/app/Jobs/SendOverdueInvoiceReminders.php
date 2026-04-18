<?php

namespace App\Jobs;

use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\NotificationType;
use App\Models\Invoice;
use App\Services\Model\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendOverdueInvoiceReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(NotificationService $notificationService): void
    {
        $invoices = Invoice::query()
            ->whereIn('status', [InvoiceStatus::Sent, InvoiceStatus::Overdue])
            ->whereDate('due_date', '<', now())
            ->with('customer.user')
            ->get();

        foreach ($invoices as $invoice) {
            // Mark as overdue if still sent
            if ($invoice->status === InvoiceStatus::Sent) {
                $invoice->update(['status' => InvoiceStatus::Overdue]);
            }

            // Notify the customer
            $user = $invoice->customer?->user;
            if ($user) {
                $notificationService->notify(
                    $user,
                    NotificationType::Payment,
                    __('messages.overdue_invoice_title'),
                    __('messages.overdue_invoice_body', ['reference' => $invoice->reference_number ?? $invoice->id]),
                    ['invoice_id' => $invoice->id],
                );
            }
        }
    }
}
