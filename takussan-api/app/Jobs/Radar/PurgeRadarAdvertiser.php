<?php

namespace App\Jobs\Radar;

use App\Services\Radar\AdvertiserRevocation;
use App\Services\Radar\RadarPurger;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * TCK-2391 (ADR-0077 §9) — « dès un STOP » : la purge des annonces jamais publiées d'un annonceur qui vient d'être révoqué,
 * mise en file APRÈS le commit de la révocation ({@see AdvertiserRevocation}). `radar:purge` en est le
 * filet, qui rejoue la même purge chaque jour : un job perdu ne laisse rien d'oublié plus d'une journée.
 *
 * Idempotent : {@see RadarPurger::run()} ne touche que ce qui est encore dû, sous verrou ; deux exemplaires ne se gênent pas. ADR-0078 : `$timeout` + 5 s ≤ `retry_after`.
 */
final class PurgeRadarAdvertiser implements ShouldQueue
{
    use Queueable;

    public int $timeout = 85;

    public bool $failOnTimeout = false;

    public function __construct(public readonly int $advertiserId) {}

    public function handle(RadarPurger $purger): void
    {
        $purger->run(advertiserId: $this->advertiserId);
    }
}
