<?php

namespace App\Listeners\Credits;

use App\Events\Auth\PhoneVerified;
use App\Services\Credits\WelcomeCreditService;

/** TCK-633 lot F (ADR-0061 §3) — découvert automatiquement (aucun `Event::listen`, cf. takussan-api/CLAUDE.md). */
class GrantWelcomeCreditsOnPhoneVerified
{
    public function __construct(private readonly WelcomeCreditService $service) {}

    public function handle(PhoneVerified $event): void
    {
        $this->service->onPhoneVerified($event->user);
    }
}
