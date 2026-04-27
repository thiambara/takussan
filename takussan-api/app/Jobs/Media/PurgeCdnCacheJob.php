<?php

namespace App\Jobs\Media;

use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class PurgeCdnCacheJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [10, 30, 60];

    /**
     * @param  array<string>  $urls  Snapshot of CDN URLs captured before the Media was deleted.
     *                               The Media row may no longer exist when the job executes.
     */
    public function __construct(
        public readonly array $urls,
    ) {}

    public function handle(CdnProviderContract $cdn): void
    {
        if (empty($this->urls)) {
            return;
        }

        $cdn->purge($this->urls);
    }
}
