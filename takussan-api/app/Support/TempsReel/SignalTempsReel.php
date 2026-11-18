<?php

namespace App\Support\TempsReel;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * TCK-2952 (ADR-0129 § 1) — LE seul événement diffusé de l'application : « tel objet a changé ».
 *
 * Trois clés, et aucune n'est une donnée :
 *  - `subject` : `<type>:<id entier>`, où `type` est un type de {@see CanauxTempsReel} ou `utilisateur` ;
 *  - `event`   : une valeur de {@see CodeDeSignal} ;
 *  - `cursor`  : l'instant d'émission côté serveur, UTC, ISO 8601 à la microseconde
 *                (`2026-11-17T10:00:00.123456Z`). Forme fixe : le front le compare comme une chaîne, et
 *                ignore un signal dont le `cursor` n'avance pas pour ce couple `(subject, event)`.
 *
 * Il ne se construit que dans {@see TempsReel}, qui l'adresse à 100 canaux au plus (la limite d'un appel du
 * protocole Pusher). `tests/Unit/Architecture/DiffusionParLeSignalSeulTest` rougit sur toute autre classe qui
 * diffuse, et sur une quatrième clé.
 */
final class SignalTempsReel implements ShouldBroadcastNow
{
    /** La forme fixe du `cursor` (ADR-0129, décision de TCK-2952). */
    public const FORME_DU_CURSEUR = 'Y-m-d\TH:i:s.u\Z';

    /**
     * @param  list<string>  $canaux  noms SANS préfixe (`sujet.conversation.42`, `utilisateur.7`)
     */
    public function __construct(
        public readonly array $canaux,
        public readonly string $sujet,
        public readonly CodeDeSignal $code,
        public readonly string $curseur,
    ) {}

    /** @return list<PrivateChannel> */
    public function broadcastOn(): array
    {
        return array_map(fn (string $canal): PrivateChannel => new PrivateChannel($canal), $this->canaux);
    }

    public function broadcastAs(): string
    {
        return 'signal';
    }

    /** @return array{subject: string, event: string, cursor: string} */
    public function broadcastWith(): array
    {
        return [
            'subject' => $this->sujet,
            'event' => $this->code->value,
            'cursor' => $this->curseur,
        ];
    }
}
