<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Billing\QuotaResolver;
use Illuminate\Http\Request;

class AgencySubscriptionResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $resolver = app(QuotaResolver::class);

        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            'plan_id' => $this->plan_id,
            'status' => $this->status?->value,
            'trial_ends_at' => $this->iso($this->trial_ends_at),
            'current_period_start' => $this->iso($this->current_period_start),
            'current_period_end' => $this->iso($this->current_period_end),
            'ended_at' => $this->iso($this->ended_at),
            'platform_fee_pct_override' => $this->platform_fee_pct_override !== null ? (float) $this->platform_fee_pct_override : null,
            'limits_override' => $this->limits_override ?? [],
            'effective_platform_fee_pct' => $resolver->effectivePlatformFeePct($this->resource),
            'effective_limits' => $resolver->effectiveLimits($this->resource),
            'plan' => $this->whenLoaded('plan', fn () => (new PlanResource($this->plan))->resolve($request)),
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
