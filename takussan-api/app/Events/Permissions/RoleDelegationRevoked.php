<?php

namespace App\Events\Permissions;

use App\Models\RoleDelegation;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RoleDelegationRevoked
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly RoleDelegation $delegation) {}
}
