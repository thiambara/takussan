<?php

namespace App\Services\Notifications\Whatsapp;

use App\Models\WhatsappContact;
use Illuminate\Contracts\Config\Repository as ConfigRepository;

/**
 * TCK-282 — Meta's 24h service window. Free-form text is only allowed when
 * the contact sent us an inbound message within the window; outside it (or
 * when the contact is unknown / never wrote in), an approved template is
 * mandatory. Shared with the future inbound flow.
 */
class ServiceWindow
{
    public function __construct(private readonly ConfigRepository $config) {}

    public function isOpen(?WhatsappContact $contact): bool
    {
        if (! $contact || ! $contact->last_inbound_at) {
            return false;
        }
        $hours = (int) $this->config->get('whatsapp.service_window_hours', 24);

        return $contact->last_inbound_at->greaterThanOrEqualTo(now()->subHours($hours));
    }
}
