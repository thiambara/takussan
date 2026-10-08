<?php

namespace App\Listeners\Payments;

use App\Models\Enums\PaymentProvider;
use App\Models\Integration;
use App\Services\Webhooks\WebhookJournal;
use LemonSqueezy\Laravel\Events\WebhookReceived;

/**
 * TCK-602 (ADR-0051 §4) — le paquet `lemonsqueezy/laravel` n'émet `WebhookReceived` qu'APRÈS son
 * middleware de signature : la ligne du journal est alors authentifiée, au nom de la plateforme
 * (ADR-0046 §6 — le secret de la configuration lui appartient), rattachée à son intégration Lemon
 * Squeezy si elle existe.
 *
 * Sans secret configuré, le paquet ne vérifie rien : la ligne reste non authentifiée, donc jamais
 * rejouable.
 */
class MarkLemonSqueezyWebhookAuthenticated
{
    public function __construct(private readonly WebhookJournal $journal) {}

    public function handle(WebhookReceived $event): void
    {
        if ((string) config('lemon-squeezy.signing_secret', '') === '') {
            return;
        }

        $this->journal->authenticated(Integration::query()
            ->where('provider', PaymentProvider::LemonSqueezy->value)
            ->where('is_active', true)
            ->whereNull('agency_id')
            ->first());
    }
}
