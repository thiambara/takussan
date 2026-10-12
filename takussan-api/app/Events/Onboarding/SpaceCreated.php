<?php

namespace App\Events\Onboarding;

use App\Models\Agency;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-633 (lot C) — un espace vient de naître : par l'assistant hôte, par la création
 * automatique de « Publier », ou par `POST /api/agencies` (lot F). Après le commit : la transaction d'onboarding peut encore
 * se défaire (409 `phone.taken`), et l'écouteur ne doit pas voir un espace qui n'existe plus.
 */
class SpaceCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public Agency $agency) {}
}
