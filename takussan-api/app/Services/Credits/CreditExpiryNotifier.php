<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Notifications\Credits\CreditsExpiringNotification;
use App\Services\Boost\BoostSettings;
use App\Services\Lead\ContactLeadService;

/** TCK-633 lot F (ADR-0061 §9) — un préavis par lot, réclamé atomiquement : deux ticks n'en envoient qu'un. */
final class CreditExpiryNotifier
{
    public function __construct(
        private readonly BoostSettings $settings,
        private readonly ContactLeadService $contacts,
    ) {}

    public function sendNotices(): int
    {
        $days = $this->settings->expiryNoticeDays();
        if ($days <= 0) {
            return 0;
        }
        $count = 0;
        $lots = CreditLot::query()
            ->whereNull('expiry_notice_sent_at')
            ->where('remaining_amount', '>', 0)
            ->whereNotNull('expires_at')
            ->where('expires_at', '>', now())
            ->where('expires_at', '<=', now()->addDays($days))
            ->get();

        foreach ($lots as $lot) {
            $claimed = CreditLot::query()->whereKey($lot->getKey())->whereNull('expiry_notice_sent_at')
                ->update(['expiry_notice_sent_at' => now(), 'updated_at' => now()]);
            if ($claimed === 0) {
                continue;
            }
            $agency = Agency::withTrashed()->find($lot->agency_id);
            foreach ($this->contacts->agencyAdmins($lot->agency_id) as $admin) {
                $admin->notify(new CreditsExpiringNotification($lot->remaining_amount, $lot->expires_at->toDateString(), (string) $agency?->name));
            }
            $count++;
        }

        return $count;
    }
}
