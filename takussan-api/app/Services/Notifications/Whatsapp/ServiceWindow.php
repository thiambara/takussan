<?php

namespace App\Services\Notifications\Whatsapp;

use App\Models\MessageRelay;
use App\Models\WhatsappContact;
use App\Services\Pont\Canaux\WhatsappCloud;
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

    /**
     * TCK-2980 (ADR-0132 § 1) — la fenêtre de Meta se compte PAR NUMÉRO D'ENTREPRISE : ouverte quand ce numéro a écrit
     * à ce numéro d'entreprise (le relais entrant le plus récent du pont) depuis moins de 24 h. Sans numéro
     * d'entreprise connu, retombe sur `last_inbound_at` ({@see self::isOpen()}), gardé pour les appelants existants.
     */
    public function isOpenFor(string $phone, ?string $businessNumberId): bool
    {
        if ($businessNumberId === null || $businessNumberId === '') {
            return $this->isOpen(WhatsappContact::query()->where('phone', $phone)->first());
        }
        $hours = (int) $this->config->get('whatsapp.service_window_hours', 24);

        return MessageRelay::query()
            ->where('channel', WhatsappCloud::NOM)
            ->where('direction', MessageRelay::DIRECTION_IN)
            ->where('phone', $phone)
            ->where('business_number_id', $businessNumberId)
            ->where('created_at', '>=', now()->subHours($hours))
            ->exists();
    }
}
