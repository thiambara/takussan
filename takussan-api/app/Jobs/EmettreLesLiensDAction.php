<?php

namespace App\Jobs;

use App\Models\Message;
use App\Services\Pont\LiensDAction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * TCK-2982 (ADR-0132 § 5) — après le COMMIT de l'écriture d'un événement d'un code émetteur
 * (`EvenementsDuFil::ecrire`), les liens d'action de ses destinataires joints par le pont. Un rejeu ne double rien
 * d'utile : un nouveau lien révoque le précédent pour le même (compte, objet, geste).
 */
class EmettreLesLiensDAction implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $messageId) {}

    public function handle(LiensDAction $liens): void
    {
        $evenement = Message::with('conversation')->find($this->messageId);
        if ($evenement !== null) {
            $liens->apresEvenement($evenement);
        }
    }
}
