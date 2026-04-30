<?php

namespace App\Jobs;

use App\Models\Enums\NotificationType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Model\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendLeasePaymentReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(NotificationService $notifications): void
    {
        // Upcoming payments due in exactly 3 days
        $upcoming = LeasePayment::with(['lease.tenant.user'])
            ->where('status', PaymentStatus::Pending)
            ->whereDate('due_date', now()->addDays(3)->toDateString())
            ->get();

        foreach ($upcoming as $payment) {
            $user = $payment->lease?->tenant?->user;
            if ($user === null) {
                continue;
            }
            $notifications->notify(
                $user,
                NotificationType::Payment,
                'Rappel de paiement',
                'Votre loyer de '.$payment->amount.' '.$payment->currency?->value.' est dû dans 3 jours.',
                ['lease_payment_id' => $payment->id],
            );
        }

        // Overdue payments (J+1 and J+7)
        $overdue = LeasePayment::with(['lease.tenant.user'])
            ->where('status', PaymentStatus::Late)
            ->where(function ($query) {
                $query->whereDate('due_date', now()->subDays(1)->toDateString())
                    ->orWhereDate('due_date', now()->subDays(7)->toDateString());
            })
            ->get();

        foreach ($overdue as $payment) {
            $user = $payment->lease?->tenant?->user;
            if ($user === null) {
                continue;
            }
            $days = now()->diffInDays($payment->due_date);
            $notifications->notify(
                $user,
                NotificationType::Payment,
                'Paiement en retard',
                'Votre loyer de '.$payment->amount.' '.$payment->currency?->value.' est en retard de '.$days.' jour(s).',
                ['lease_payment_id' => $payment->id],
            );
        }
    }
}
