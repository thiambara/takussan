<?php

namespace App\Jobs;

use App\Models\Conversation;
use App\Models\User;
use App\Services\Pont\LiensDAction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * TCK-2982 (ADR-0132 § 5) — à l'accord ou à la jonction d'une personne dans un fil (TCK-2981), après le COMMIT : les
 * gestes que ce fil attend encore d'elle émettent leur lien. Idempotent : un lien vivant n'est pas réémis.
 */
class EmettreLesLiensALaJonction implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $conversationId, public readonly int $userId) {}

    public function handle(LiensDAction $liens): void
    {
        $fil = Conversation::query()->find($this->conversationId);
        $personne = User::query()->find($this->userId);
        if ($fil !== null && $personne !== null) {
            $liens->aLaJonction($fil, $personne);
        }
    }
}
