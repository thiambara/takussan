<?php

namespace App\Jobs;

use App\Models\Enums\NotificationType;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Services\Model\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendPropertyVisitReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(NotificationService $notificationService): void
    {
        $tomorrow = now()->addDay()->startOfDay();
        $tomorrowEnd = now()->addDay()->endOfDay();

        $visits = PropertyVisit::query()
            ->whereIn('status', [VisitStatus::Scheduled, VisitStatus::Confirmed])
            ->whereDate('scheduled_at', '>=', $tomorrow)
            ->whereDate('scheduled_at', '<=', $tomorrowEnd)
            ->with(['property', 'agent', 'visitor'])
            ->get();

        foreach ($visits as $visit) {
            $propertyTitle = $visit->property?->title ?? 'N/A';

            // Notify the agent
            if ($visit->agent_id) {
                $agent = $visit->agent;
                if ($agent) {
                    $notificationService->notify(
                        $agent,
                        NotificationType::Visit,
                        __('messages.visit_reminder_title'),
                        __('messages.visit_reminder_body', ['property' => $propertyTitle]),
                        ['visit_id' => $visit->id, 'property_id' => $visit->property_id],
                    );
                }
            }

            // Notify the visitor
            if ($visit->visitor_id) {
                $visitor = $visit->visitor;
                if ($visitor) {
                    $notificationService->notify(
                        $visitor,
                        NotificationType::Visit,
                        __('messages.visit_reminder_title'),
                        __('messages.visit_reminder_body', ['property' => $propertyTitle]),
                        ['visit_id' => $visit->id, 'property_id' => $visit->property_id],
                    );
                }
            }
        }
    }
}
