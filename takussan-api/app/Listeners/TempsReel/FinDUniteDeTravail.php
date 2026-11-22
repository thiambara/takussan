<?php

namespace App\Listeners\TempsReel;

use App\Support\TempsReel\UniteDeTravail;
use Illuminate\Foundation\Http\Events\RequestHandled;

/**
 * TCK-2952 (ADR-0129 § 3) — une requête HTTP est une unité de travail de l'émetteur temps réel : sa mémoire
 * (dédoublonnage, disjoncteur) est oubliée quand elle a répondu. Le worker de file fait de même entre deux
 * jobs (`forgetScopedInstances()`), mais rien ne le fait entre deux requêtes d'un même processus — les tests
 * en enchaînent plusieurs : sans ceci, le second `POST` identique d'un test n'émettrait rien.
 *
 * Découvert par Laravel (`app/Listeners`) : ne pas l'inscrire en plus par `listen()`.
 */
class FinDUniteDeTravail
{
    public function handle(RequestHandled $event): void
    {
        app()->forgetInstance(UniteDeTravail::class);
    }
}
