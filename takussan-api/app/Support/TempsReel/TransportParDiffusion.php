<?php

namespace App\Support\TempsReel;

use Illuminate\Contracts\Broadcasting\Factory as Diffuseur;

/**
 * TCK-2952 (ADR-0129 § 3) — le transport réel : le diffuseur de la connexion par défaut (`reverb` là où le
 * service tourne, `null` dans la suite et tant qu'il n'est pas posé), en synchrone (`ShouldBroadcastNow`),
 * sans passer par la file ni par le répartiteur d'événements (un `Event::fake()` ne le court-circuite pas).
 *
 * Le délai d'1 s est celui du client HTTP de la connexion `reverb` (`config/broadcasting.php`,
 * `client_options`).
 */
final class TransportParDiffusion implements TransportTempsReel
{
    public function __construct(private readonly Diffuseur $diffuseur) {}

    public function envoyer(SignalTempsReel $signal): void
    {
        $this->diffuseur->queue($signal);
    }
}
