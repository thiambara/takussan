<?php

namespace App\Jobs\Radar;

use App\Ai\Agents\RadarDemandTargets;
use App\Jobs\Concerns\RunsOnAiQueue;
use App\Services\Radar\Targets\RadarDemandCurator;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-2470 (ADR-0087 §6) — un passage des cibles de la demande ({@see RadarDemandCurator}), en file `ai`. Mis en file par
 * `radar:refresh-demand-targets` (la nuit) et par « rafraîchir maintenant » (`POST /api/admin/radar/demand/refresh`).
 *
 * Unique (un seul en file ou en cours) et idempotent : des signaux inchangés depuis la dernière révision ne rappellent pas le
 * modèle, et deux passages se sérialisent sur la ligne du réglage. Une tentative : un échec attend le passage suivant.
 */
class RefreshRadarDemandTargets implements ShouldBeUnique, ShouldQueue
{
    use Queueable;
    use RunsOnAiQueue;

    /** Sous le délai de reprise de la file `ai` (90 s, ADR-0078 ; `scripts/check-queues.mjs`). */
    public const TIMEOUT_SECONDS = 85;

    /** Le temps laissé à l'appel, tous maillons compris ({@see RadarDemandTargets::timeout()}). */
    public const AI_CALL_BUDGET_SECONDS = self::TIMEOUT_SECONDS - 10;

    public int $tries = 1;

    public int $timeout = self::TIMEOUT_SECONDS;

    public int $uniqueFor = 600;

    public function __construct()
    {
        $this->onAiQueue();
    }

    public function handle(RadarDemandCurator $curator): void
    {
        $curator->run();
    }
}
