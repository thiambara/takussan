<?php

namespace App\Listeners\Credits;

use App\Events\Onboarding\SpaceCreated;
use App\Services\Credits\WelcomeCreditService;

/** TCK-633 lot F (ADR-0061 §3). */
class GrantWelcomeCreditsOnSpaceCreated
{
    public function __construct(private readonly WelcomeCreditService $service) {}

    public function handle(SpaceCreated $event): void
    {
        $this->service->onSpaceCreated($event->agency);
    }
}
