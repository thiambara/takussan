<?php

namespace App\Listeners\Admin;

use App\Services\Admin\AlertRuleService;
use Spatie\Activitylog\Models\Activity;

class DispatchAlerts
{
    public function __construct(private readonly AlertRuleService $alerts) {}

    public function handle(Activity $activity): void
    {
        $this->alerts->dispatchForActivity($activity);
    }
}
