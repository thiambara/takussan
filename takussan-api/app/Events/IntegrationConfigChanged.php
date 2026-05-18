<?php

namespace App\Events;

use App\Models\Integration;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class IntegrationConfigChanged
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Integration $integration,
        /** @var array<int,string> */
        public readonly array $changedFields,
    ) {}
}
