<?php

namespace App\Support\TempsReel;

use Illuminate\Container\Attributes\Bind;

/**
 * TCK-2952 — la couche la plus basse de l'émission : remettre UN signal (au plus 100 canaux) au diffuseur.
 *
 * C'est la seule couture que les tests remplacent ({@see TempsReel::fake()}, un transport qui lève) : le
 * passage au COMMIT, le dédoublonnage, les paquets de 100 et le disjoncteur restent réels au-dessus.
 */
#[Bind(TransportParDiffusion::class)]
interface TransportTempsReel
{
    /** Lève si le diffuseur échoue : {@see TempsReel} avale, journalise et compte. */
    public function envoyer(SignalTempsReel $signal): void;
}
